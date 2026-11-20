import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type GithubProfile = {
  githubId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

@Injectable()
export class GithubService {
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly callbackUrl: string;

  constructor(config: ConfigService) {
    this.clientId = config.get<string>('GITHUB_CLIENT_ID') || undefined;
    this.clientSecret = config.get<string>('GITHUB_CLIENT_SECRET') || undefined;
    this.callbackUrl = config.get<string>(
      'GITHUB_CALLBACK_URL',
      'http://localhost:3000/api/auth/github/callback',
    );
  }

  authorizeUrl(state: string): string {
    this.assertConfigured();
    const url = new URL('https://github.com/login/oauth/authorize');
    url.search = new URLSearchParams({
      client_id: this.clientId!,
      redirect_uri: this.callbackUrl,
      scope: 'read:user user:email',
      state,
      allow_signup: 'true',
    }).toString();
    return url.toString();
  }

  /** Authorization-code exchange. The GitHub access token is used once and thrown away. */
  async profileFromCode(code: string): Promise<GithubProfile> {
    this.assertConfigured();

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.callbackUrl,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const tokenBody = (await tokenRes.json()) as { access_token?: string };
    if (!tokenRes.ok || !tokenBody.access_token) throw new BadGatewayException('github token exchange failed');

    const headers = {
      Authorization: `Bearer ${tokenBody.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'roast-sh',
    };
    const [userRes, emailsRes] = await Promise.all([
      fetch('https://api.github.com/user', { headers, signal: AbortSignal.timeout(10_000) }),
      fetch('https://api.github.com/user/emails', { headers, signal: AbortSignal.timeout(10_000) }),
    ]);
    if (!userRes.ok || !emailsRes.ok) throw new BadGatewayException('github profile fetch failed');

    const user = (await userRes.json()) as {
      id: number;
      login: string;
      name: string | null;
      avatar_url: string | null;
    };
    const emails = (await emailsRes.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;

    // Only a *verified* email is trusted: it is later used to match existing accounts.
    const email = (emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified))?.email;
    if (!email) throw new BadGatewayException('github account has no verified email');

    return {
      githubId: String(user.id),
      email: email.toLowerCase(),
      name: user.name ?? user.login,
      avatarUrl: user.avatar_url,
    };
  }

  private assertConfigured() {
    if (!this.clientId || !this.clientSecret) {
      throw new ServiceUnavailableException('github oauth is not configured');
    }
  }
}
