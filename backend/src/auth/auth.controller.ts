import {
  BadGatewayException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { AuthService, type AuthResult } from './auth.service.js';
import { OAUTH_STATE_COOKIE, readCookie, REFRESH_COOKIE } from './cookies.js';
import { LoginDto, RegisterDto } from './dto.js';
import { GithubService } from './github.service.js';
import { CurrentUser, JwtAuthGuard, type AuthUser } from './jwt-auth.guard.js';
import { TokensService } from './tokens.service.js';

@Controller('auth')
export class AuthController {
  private readonly log = new Logger(AuthController.name);
  private readonly frontendUrl: string;
  private readonly secure: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly github: GithubService,
    private readonly tokens: TokensService,
    config: ConfigService,
  ) {
    this.frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const cookieSecure = config.get<string>('COOKIE_SECURE');
    // explicit COOKIE_SECURE wins; otherwise Secure in production only
    this.secure = cookieSecure ? cookieSecure === 'true' : config.get('NODE_ENV') === 'production';
  }

  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.register(dto.email, dto.password));
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.login(dto.email, dto.password, req.ip ?? 'unknown'));
  }

  /** Exchanges the httpOnly refresh cookie for a new access token (and rotates the refresh token). */
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = readCookie(req, REFRESH_COOKIE);
    if (!token) {
      this.log.warn(`refresh: no ${REFRESH_COOKIE} cookie (origin=${req.headers.origin} host=${req.headers.host})`);
      throw new UnauthorizedException('no refresh token');
    }
    try {
      const result = await this.auth.refresh(token);
      this.log.log(`refresh ok user=${result.user.id} origin=${req.headers.origin} sfs=${req.headers['sec-fetch-site']}`);
      return this.respond(res, result);
    } catch (e) {
      this.log.warn(`refresh rejected: ${e instanceof Error ? e.message : String(e)}`);
      // Only a definite "this session is dead" (401) clears the cookie. A 409 (rotated a moment ago) must
      // keep it, or this response could erase the fresh cookie the winning request just set; 5xx must not log users out.
      if (e instanceof UnauthorizedException) this.clearRefreshCookie(res);
      throw e;
    }
  }

  /** Works with the cookie alone, a bearer token alone, or both. Always succeeds. */
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const [scheme, bearer] = (req.headers.authorization ?? '').split(' ');
      let access: Awaited<ReturnType<TokensService['verifyAccess']>> | undefined;
      if (scheme === 'Bearer' && bearer) access = await this.tokens.verifyAccess(bearer).catch(() => undefined);

      await this.auth.logout({
        access: access && { jti: access.jti, exp: access.exp, fid: access.fid },
        refreshToken: readCookie(req, REFRESH_COOKIE),
      });
    } finally {
      this.clearRefreshCookie(res); // the browser forgets the cookie even if Redis is down
    }
  }

  @Post('logout-all')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutEverywhere(user.id);
    this.clearRefreshCookie(res);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  // ---- GitHub OAuth2 (authorization code flow) ----

  @Get('github')
  githubStart(@Res() res: Response) {
    const state = randomBytes(32).toString('base64url');
    const url = this.github.authorizeUrl(state);
    res.cookie(OAUTH_STATE_COOKIE, state, { ...this.cookieBase(), maxAge: 10 * 60 * 1000 });
    res.redirect(url);
  }

  @Get('github/callback')
  async githubCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.log.log(`github callback hit: code=${!!code} state=${!!state}`);
    res.clearCookie(OAUTH_STATE_COOKIE, this.cookieBase());
    const expected = readCookie(req, OAUTH_STATE_COOKIE);
    if (!code || !state || !expected || !safeEqual(state, expected)) {
      this.log.warn(
        `github callback rejected: code=${!!code} state=${!!state} stateCookie=${!!expected} (cookie missing => browser dropped it / different host)`,
      );
      return res.redirect(`${this.frontendUrl}/login?error=oauth_state`);
    }
    try {
      const result = await this.auth.loginWithGithub(await this.github.profileFromCode(code));
      this.log.log(`github login ok user=${result.user.id}; cookie set, redirecting to ${this.frontendUrl}/auth/callback`);
      this.setRefreshCookie(res, result.tokens.refreshToken);
      // No token in the URL: the frontend calls POST /auth/refresh to pick up the session.
      return res.redirect(`${this.frontendUrl}/auth/callback`);
    } catch (e) {
      this.log.warn(`github login failed: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
      const code =
        e instanceof ConflictException
          ? 'github_conflict'
          : e instanceof BadGatewayException && /verified email/.test(e.message)
            ? 'github_email'
            : 'github';
      return res.redirect(`${this.frontendUrl}/login?error=${code}`);
    }
  }

  // ---- helpers ----

  private respond(res: Response, { tokens, user }: AuthResult) {
    this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, user };
  }

  private cookieBase() {
    return { httpOnly: true, secure: this.secure, sameSite: 'lax' as const, path: '/' };
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, { ...this.cookieBase(), maxAge: this.tokens.refreshTtl * 1000 });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, this.cookieBase());
  }
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
