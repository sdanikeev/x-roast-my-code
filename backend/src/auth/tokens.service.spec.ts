import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Redis } from 'ioredis';
import { TokensService } from './tokens.service.js';

/** Minimal in-memory stand-in for the ioredis commands TokensService uses (TTL is honoured via Date.now). */
class FakeRedis {
  private store = new Map<string, { v: string; exp?: number }>();
  private live(k: string) {
    const e = this.store.get(k);
    if (e?.exp !== undefined && e.exp <= Date.now()) this.store.delete(k);
    return this.store.get(k);
  }
  set(k: string, v: string, _ex?: 'EX', ttl?: number) {
    this.store.set(k, { v, exp: ttl ? Date.now() + ttl * 1000 : undefined });
    return Promise.resolve('OK');
  }
  get(k: string) {
    return Promise.resolve(this.live(k)?.v ?? null);
  }
  mget(...keys: string[]) {
    return Promise.resolve(keys.map((k) => this.live(k)?.v ?? null));
  }
  getdel(k: string) {
    const v = this.live(k)?.v ?? null;
    this.store.delete(k);
    return Promise.resolve(v);
  }
  /** Emulates the CONSUME_LUA script (the real one runs atomically inside Redis). */
  eval(_script: string, _n: number, rtKey: string, rtuKey: string, grace: number) {
    if (this.live(rtKey)) {
      this.store.delete(rtKey);
      this.store.set(rtuKey, { v: '1', exp: Date.now() + grace * 1000 });
      return Promise.resolve(1);
    }
    return Promise.resolve(this.live(rtuKey) ? 2 : 0);
  }
  has(k: string) {
    return this.live(k) !== undefined;
  }
}

const config = (extra: Record<string, unknown> = {}) =>
  new ConfigService({
    JWT_ACCESS_SECRET: 'a'.repeat(40),
    JWT_REFRESH_SECRET: 'r'.repeat(40),
    JWT_ACCESS_TTL: 900,
    JWT_REFRESH_TTL: 3600,
    ...extra,
  });

describe('TokensService', () => {
  let redis: FakeRedis;
  let jwt: JwtService;
  let svc: TokensService;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    redis = new FakeRedis();
    jwt = new JwtService();
    svc = new TokensService(config(), jwt, redis as unknown as Redis);
  });
  afterEach(() => vi.useRealTimers());

  const advance = (seconds: number) => vi.setSystemTime(Date.now() + seconds * 1000);

  it('refuses to start with a missing or short secret', () => {
    expect(() => new TokensService(config({ JWT_ACCESS_SECRET: 'short' }), jwt, redis as unknown as Redis)).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('issues a pair; access token verifies and carries the user id', async () => {
    const pair = await svc.issue('user-1');
    const payload = await svc.verifyAccess(pair.accessToken);
    expect(payload).toMatchObject({ sub: 'user-1', typ: 'access' });
    expect(pair.expiresIn).toBe(900);
  });

  it('rejects a refresh token used as access token (and vice versa)', async () => {
    const pair = await svc.issue('user-1');
    await expect(svc.verifyAccess(pair.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(svc.rotate(pair.accessToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a tampered token and a token signed with another secret', async () => {
    const pair = await svc.issue('user-1');
    await expect(svc.verifyAccess(pair.accessToken.slice(0, -2) + 'xx')).rejects.toBeInstanceOf(UnauthorizedException);
    const other = new TokensService(config({ JWT_ACCESS_SECRET: 'z'.repeat(40) }), jwt, redis as unknown as Redis);
    await expect(other.verifyAccess(pair.accessToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired access token', async () => {
    const { accessToken } = await svc.issue('user-1');
    advance(901);
    await expect(svc.verifyAccess(accessToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('blacklisted access token is rejected, others of the same user still work', async () => {
    const a = await svc.issue('user-1');
    const b = await svc.issue('user-1');
    await svc.blacklist(await svc.verifyAccess(a.accessToken));
    await expect(svc.verifyAccess(a.accessToken)).rejects.toThrow('token revoked');
    await expect(svc.verifyAccess(b.accessToken)).resolves.toBeDefined();
  });

  it('blacklist entry lives only as long as the token', async () => {
    const { accessToken } = await svc.issue('user-1');
    const payload = await svc.verifyAccess(accessToken);
    await svc.blacklist(payload);
    expect(redis.has(`bl:${payload.jti}`)).toBe(true);
    advance(901);
    expect(redis.has(`bl:${payload.jti}`)).toBe(false);
  });

  describe('refresh rotation', () => {
    it('returns a new pair in the same family and consumes the old refresh token', async () => {
      const first = await svc.issue('user-1');
      const { pair, userId } = await svc.rotate(first.refreshToken);
      expect(userId).toBe('user-1');
      expect(pair.refreshToken).not.toBe(first.refreshToken);
      const [a, b] = await Promise.all([svc.verifyAccess(first.accessToken), svc.verifyAccess(pair.accessToken)]);
      expect(a.fid).toBe(b.fid);
    });

    it('reuse of a consumed refresh token revokes the whole family', async () => {
      const first = await svc.issue('user-1');
      const { pair } = await svc.rotate(first.refreshToken);

      advance(11); // outside the grace window: this is a replay, not a race
      await expect(svc.rotate(first.refreshToken)).rejects.toThrow('reuse');
      await expect(svc.rotate(pair.refreshToken)).rejects.toThrow('revoked'); // legit holder is cut off too
      await expect(svc.verifyAccess(pair.accessToken)).rejects.toThrow('revoked');
    });

    it('does not touch other sessions of the same user on reuse', async () => {
      const mine = await svc.issue('user-1');
      const other = await svc.issue('user-1');
      const { pair } = await svc.rotate(mine.refreshToken);
      advance(11);
      await expect(svc.rotate(mine.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(svc.verifyAccess(other.accessToken)).resolves.toBeDefined();
      await expect(svc.rotate(other.refreshToken)).resolves.toBeDefined();
      expect(pair).toBeDefined();
    });

    it('two parallel rotations (two tabs): one wins, the loser gets 409 and the session SURVIVES', async () => {
      const { refreshToken } = await svc.issue('user-1');
      const [a, b] = await Promise.allSettled([svc.rotate(refreshToken), svc.rotate(refreshToken)]);
      const winner = [a, b].find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<
        Awaited<ReturnType<TokensService['rotate']>>
      >;
      const loser = [a, b].find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(winner).toBeDefined();
      expect(loser.reason).toBeInstanceOf(ConflictException);

      // the family is intact: the winner's token keeps working
      await expect(svc.rotate(winner.value.pair.refreshToken)).resolves.toBeDefined();
    });

    it('replay after the grace window is theft: family revoked', async () => {
      const first = await svc.issue('user-1');
      const { pair } = await svc.rotate(first.refreshToken);
      advance(11); // grace is 10s
      await expect(svc.rotate(first.refreshToken)).rejects.toThrow('reuse');
      await expect(svc.verifyAccess(pair.accessToken)).rejects.toThrow('revoked');
    });

    it('rejects an expired refresh token', async () => {
      const { refreshToken } = await svc.issue('user-1');
      advance(3601);
      await expect(svc.rotate(refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('revocation', () => {
    it('revokeFamily kills access and refresh of that session only', async () => {
      const s1 = await svc.issue('user-1');
      const s2 = await svc.issue('user-1');
      await svc.revokeFamily((await svc.verifyAccess(s1.accessToken)).fid);
      await expect(svc.verifyAccess(s1.accessToken)).rejects.toThrow('revoked');
      await expect(svc.rotate(s1.refreshToken)).rejects.toThrow('revoked');
      await expect(svc.verifyAccess(s2.accessToken)).resolves.toBeDefined();
    });

    it('revokeAllForUser kills existing sessions but not tokens issued afterwards', async () => {
      const before = await svc.issue('user-1');
      const stranger = await svc.issue('user-2');
      await svc.revokeAllForUser('user-1');
      advance(2); // jwt iat has 1s resolution
      const after = await svc.issue('user-1');

      await expect(svc.verifyAccess(before.accessToken)).rejects.toThrow('revoked');
      await expect(svc.rotate(before.refreshToken)).rejects.toThrow('revoked');
      await expect(svc.verifyAccess(after.accessToken)).resolves.toBeDefined();
      await expect(svc.verifyAccess(stranger.accessToken)).resolves.toBeDefined();
    });

    it('peekRefresh returns the payload for a valid token and undefined for junk', async () => {
      const { refreshToken, accessToken } = await svc.issue('user-1');
      expect((await svc.peekRefresh(refreshToken))?.sub).toBe('user-1');
      expect(await svc.peekRefresh(accessToken)).toBeUndefined();
      expect(await svc.peekRefresh('junk')).toBeUndefined();
    });
  });
});
