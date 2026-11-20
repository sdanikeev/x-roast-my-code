import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';
import { toPublicUser, type PublicUser } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import type { GithubProfile } from './github.service.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from './password.js';
import { TokensService, type TokenPair } from './tokens.service.js';

export type AuthResult = { tokens: TokenPair; user: PublicUser };

const MAX_FAILED_LOGINS = 5;
const LOCK_SECONDS = 15 * 60;

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokensService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async register(email: string, password: string): Promise<AuthResult> {
    email = email.toLowerCase();
    if (await this.users.findByEmail(email)) throw new ConflictException('email already registered');
    let user;
    try {
      user = await this.users.createLocal(email, await hashPassword(password));
    } catch (e) {
      // two concurrent registrations of the same email: the unique index decides
      const err = e as { code?: string; driverError?: { code?: string } };
      if ((err.code ?? err.driverError?.code) === '23505') throw new ConflictException('email already registered');
      throw e;
    }
    return { tokens: await this.tokens.issue(user.id), user: toPublicUser(user) };
  }

  async login(email: string, password: string, ip: string): Promise<AuthResult> {
    email = email.toLowerCase();
    // Reserve an attempt BEFORE the (slow) password check, atomically: parallel guesses cannot all slip
    // under the limit, and INCR+EXPIRE can never leave a counter without a TTL.
    const failKey = `lf:${email}:${ip}`;
    const res = await this.redis.multi().incr(failKey).expire(failKey, LOCK_SECONDS, 'NX').exec();
    if (Number(res?.[0]?.[1]) > MAX_FAILED_LOGINS) {
      throw new HttpException('too many attempts, try again later', HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.users.findByEmailWithPassword(email);
    const ok = user?.passwordHash
      ? await verifyPassword(password, user.passwordHash)
      : (await burnPasswordCheck(password), false);

    if (!user || !ok) throw new UnauthorizedException('invalid email or password');
    await this.redis.del(failKey);
    return { tokens: await this.tokens.issue(user.id), user: toPublicUser(user) };
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const { pair, userId } = await this.tokens.rotate(refreshToken);
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('user no longer exists');
    return { tokens: pair, user: toPublicUser(user) };
  }

  /** Close the session an access and/or refresh token belongs to. Never throws on garbage input. */
  async logout(opts: { access?: { jti: string; exp: number; fid: string }; refreshToken?: string }) {
    const fids = new Set<string>();
    if (opts.access) {
      await this.tokens.blacklist(opts.access);
      fids.add(opts.access.fid);
    }
    if (opts.refreshToken) {
      const p = await this.tokens.peekRefresh(opts.refreshToken);
      if (p) fids.add(p.fid);
    }
    await Promise.all([...fids].map((fid) => this.tokens.revokeFamily(fid)));
  }

  logoutEverywhere(userId: string) {
    return this.tokens.revokeAllForUser(userId);
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    return toPublicUser(user);
  }

  async loginWithGithub(profile: GithubProfile): Promise<AuthResult> {
    let user = await this.users.findByGithubId(profile.githubId);
    let sessionsRevoked = false;

    if (!user) {
      const existing = await this.users.findByEmail(profile.email);
      if (existing?.githubId && existing.githubId !== profile.githubId) {
        // The email now belongs to a different GitHub account (recycled address, ...): never re-link silently.
        throw new ConflictException('email is linked to another github account');
      }
      if (existing) {
        // Link to the account that owns this (GitHub-verified) email. The password is wiped and old
        // sessions are killed: otherwise someone who pre-registered the victim's email with their own
        // password would keep access after the real owner signs in with GitHub.
        existing.githubId = profile.githubId;
        existing.passwordHash = null;
        existing.name ??= profile.name;
        existing.avatarUrl ??= profile.avatarUrl;
        user = await this.users.save(existing);
        await this.tokens.revokeAllForUser(user.id);
        sessionsRevoked = true;
      } else {
        user = await this.users.createFromGithub(profile);
      }
    }
    // JWT `iat` has 1s resolution and revocation drops tokens with iat <= cutoff, so a token minted
    // in the same second as revokeAllForUser would be born dead. Only the linking path needs this.
    if (sessionsRevoked) await new Promise((r) => setTimeout(r, 1100));
    return { tokens: await this.tokens.issue(user.id), user: toPublicUser(user) };
  }
}
