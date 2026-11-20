import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';

export type TokenPayload = {
  sub: string; // user id
  jti: string; // unique token id
  fid: string; // token family = one login session; shared by every rotation of its refresh token
  typ: 'access' | 'refresh';
  iat: number;
  exp: number;
};

export type TokenPair = { accessToken: string; refreshToken: string; expiresIn: number };

/**
 * Redis keys
 *   rt:{jti}      valid (not yet used) refresh token                  -> userId, TTL = refresh ttl
 *   bl:{jti}      blacklisted access token                            -> 1,      TTL = its remaining life
 *   revfam:{fid}  revoked session (logout / refresh-token reuse)       -> 1,      TTL = refresh ttl
 *   ub:{userId}   "revoked before": every token issued at/before this -> unix s, TTL = refresh ttl
 *   rtu:{jti}     refresh token consumed a moment ago (grace window)  -> 1,      TTL = ROTATION_GRACE
 */
const ROTATION_GRACE_SECONDS = 10;

// Atomically consume a refresh token. 1 = consumed now, 2 = already consumed within the grace window
// (honest race: two tabs, a lost response), 0 = unknown/old (reuse = theft).
const CONSUME_LUA = `
if redis.call('GETDEL', KEYS[1]) then
  redis.call('SET', KEYS[2], '1', 'EX', ARGV[1])
  return 1
end
if redis.call('EXISTS', KEYS[2]) == 1 then return 2 end
return 0`;
@Injectable()
export class TokensService {
  readonly accessTtl: number;
  readonly refreshTtl: number;
  private readonly accessSecret: string;
  private readonly refreshSecret: string;

  constructor(
    config: ConfigService,
    private readonly jwt: JwtService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    this.accessSecret = required(config, 'JWT_ACCESS_SECRET');
    this.refreshSecret = required(config, 'JWT_REFRESH_SECRET');
    this.accessTtl = Number(config.get('JWT_ACCESS_TTL', 900)); // 15 min
    this.refreshTtl = Number(config.get('JWT_REFRESH_TTL', 60 * 60 * 24 * 7)); // 7 days
  }

  async issue(userId: string, fid: string = randomUUID()): Promise<TokenPair> {
    const base = { sub: userId, fid };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync({ ...base, typ: 'access' }, {
        secret: this.accessSecret,
        expiresIn: this.accessTtl,
        jwtid: randomUUID(),
        algorithm: 'HS256',
      }),
      this.jwt.signAsync({ ...base, typ: 'refresh' }, {
        secret: this.refreshSecret,
        expiresIn: this.refreshTtl,
        jwtid: randomUUID(),
        algorithm: 'HS256',
      }),
    ]);
    const { jti } = this.jwt.decode<TokenPayload>(refreshToken);
    await this.redis.set(`rt:${jti}`, userId, 'EX', this.refreshTtl);
    return { accessToken, refreshToken, expiresIn: this.accessTtl };
  }

  /** Validates signature, expiry and every revocation list. */
  async verifyAccess(token: string): Promise<TokenPayload> {
    const payload = await this.verify(token, this.accessSecret, 'access');
    const [blacklisted, familyRevoked, revokedBefore] = await this.redis.mget(
      `bl:${payload.jti}`,
      `revfam:${payload.fid}`,
      `ub:${payload.sub}`,
    );
    if (blacklisted || familyRevoked || (revokedBefore && payload.iat <= Number(revokedBefore))) {
      throw new UnauthorizedException('token revoked');
    }
    return payload;
  }

  /**
   * Refresh-token rotation: the presented token is consumed (single use) and a new pair is issued
   * in the same family. Presenting an already-used token means it was stolen (or replayed), so the
   * whole family is revoked: the attacker and the victim both have to log in again.
   */
  async rotate(refreshToken: string): Promise<{ pair: TokenPair; userId: string }> {
    const payload = await this.verify(refreshToken, this.refreshSecret, 'refresh');

    const [familyRevoked, revokedBefore] = await this.redis.mget(
      `revfam:${payload.fid}`,
      `ub:${payload.sub}`,
    );
    if (familyRevoked || (revokedBefore && payload.iat <= Number(revokedBefore))) {
      throw new UnauthorizedException('session revoked');
    }

    const outcome = Number(
      await this.redis.eval(CONSUME_LUA, 2, `rt:${payload.jti}`, `rtu:${payload.jti}`, ROTATION_GRACE_SECONDS),
    );
    if (outcome === 2) {
      // The token was rotated a moment ago and the caller probably has not seen the new cookie yet.
      // Not theft: do NOT revoke. The client retries with the cookie the winner set.
      throw new ConflictException('refresh token was just rotated, retry');
    }
    if (outcome !== 1) {
      await this.revokeFamily(payload.fid);
      throw new UnauthorizedException('refresh token reuse detected');
    }
    return { pair: await this.issue(payload.sub, payload.fid), userId: payload.sub };
  }

  /** Put a single access token on the blacklist until it would have expired anyway. */
  async blacklist(payload: Pick<TokenPayload, 'jti' | 'exp'>): Promise<void> {
    const ttl = payload.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) await this.redis.set(`bl:${payload.jti}`, '1', 'EX', ttl);
  }

  /** End one login session: its access tokens and its refresh token stop working. */
  async revokeFamily(fid: string): Promise<void> {
    await this.redis.set(`revfam:${fid}`, '1', 'EX', this.refreshTtl);
  }

  /** End every session of a user (logout everywhere, password change, account linking). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.redis.set(`ub:${userId}`, String(Math.floor(Date.now() / 1000)), 'EX', this.refreshTtl);
  }

  /** Decode without trusting: used on logout to find which session to close. */
  async peekRefresh(token: string): Promise<TokenPayload | undefined> {
    try {
      return await this.verify(token, this.refreshSecret, 'refresh');
    } catch {
      return undefined;
    }
  }

  private async verify(token: string, secret: string, typ: TokenPayload['typ']) {
    let payload: TokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(token, { secret, algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('invalid token');
    }
    if (payload.typ !== typ) throw new UnauthorizedException('wrong token type');
    return payload;
  }
}

function required(config: ConfigService, key: string): string {
  const v = config.get<string>(key);
  if (!v || v.length < 32) throw new Error(`${key} must be set (min 32 chars)`);
  return v;
}
