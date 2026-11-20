import { ConflictException, HttpException, UnauthorizedException } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { TokensService } from './tokens.service.js';
import type { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { hashPassword } from './password.js';

type U = Record<string, unknown>;

function setup(opts: { attempts?: number } = {}) {
  const users = {
    findByEmail: vi.fn<(e: string) => Promise<U | null>>().mockResolvedValue(null),
    findByEmailWithPassword: vi.fn<(e: string) => Promise<U | null>>().mockResolvedValue(null),
    findByGithubId: vi.fn<(id: string) => Promise<U | null>>().mockResolvedValue(null),
    findById: vi.fn(),
    createLocal: vi.fn(),
    createFromGithub: vi.fn(),
    save: vi.fn(async (u: U) => u),
  };
  const tokens = {
    issue: vi.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 }),
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
    revokeFamily: vi.fn().mockResolvedValue(undefined),
    blacklist: vi.fn().mockResolvedValue(undefined),
    peekRefresh: vi.fn(),
  };
  const exec = vi.fn().mockResolvedValue([[null, opts.attempts ?? 1], [null, 1]]);
  const multi = { incr: vi.fn().mockReturnThis(), expire: vi.fn().mockReturnThis(), exec };
  const redis = { multi: vi.fn(() => multi), del: vi.fn().mockResolvedValue(1) };
  const svc = new AuthService(
    users as unknown as UsersService,
    tokens as unknown as TokensService,
    redis as unknown as Redis,
  );
  return { svc, users, tokens, redis, multi };
}

describe('AuthService.login', () => {
  it('429s once the atomic attempt counter passes the limit, without checking the password', async () => {
    const { svc, users } = setup({ attempts: 6 });
    await expect(svc.login('a@b.dev', 'x', '1.1.1.1')).rejects.toBeInstanceOf(HttpException);
    expect(users.findByEmailWithPassword).not.toHaveBeenCalled();
  });

  it('reserves the attempt with INCR + EXPIRE NX in one transaction', async () => {
    const { svc, multi } = setup();
    await svc.login('A@B.dev', 'x', '1.1.1.1').catch(() => undefined);
    expect(multi.incr).toHaveBeenCalledWith('lf:a@b.dev:1.1.1.1');
    expect(multi.expire).toHaveBeenCalledWith('lf:a@b.dev:1.1.1.1', expect.any(Number), 'NX');
  });

  it('unknown user and wrong password are indistinguishable', async () => {
    const { svc, users } = setup();
    const unknown = await svc.login('a@b.dev', 'pw', 'ip').catch((e) => e);
    users.findByEmailWithPassword.mockResolvedValue({ id: '1', passwordHash: await hashPassword('right') });
    const wrong = await svc.login('a@b.dev', 'pw', 'ip').catch((e) => e);
    expect(unknown).toBeInstanceOf(UnauthorizedException);
    expect(wrong).toBeInstanceOf(UnauthorizedException);
    expect(unknown.message).toBe(wrong.message);
  });

  it('a successful login clears the failure counter', async () => {
    const { svc, users, redis } = setup();
    users.findByEmailWithPassword.mockResolvedValue({ id: '1', email: 'a@b.dev', passwordHash: await hashPassword('right') });
    await svc.login('a@b.dev', 'right', 'ip');
    expect(redis.del).toHaveBeenCalledWith('lf:a@b.dev:ip');
  });

  it('OAuth-only accounts (no password) cannot log in with a password', async () => {
    const { svc, users } = setup();
    users.findByEmailWithPassword.mockResolvedValue({ id: '1', passwordHash: null });
    await expect(svc.login('a@b.dev', 'anything', 'ip')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthService.register', () => {
  it('maps the unique-index race (23505) to 409', async () => {
    const { svc, users } = setup();
    users.createLocal.mockRejectedValue({ code: '23505' });
    await expect(svc.register('a@b.dev', 'password123')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rethrows unrelated database errors', async () => {
    const { svc, users } = setup();
    users.createLocal.mockRejectedValue(new Error('db down'));
    await expect(svc.register('a@b.dev', 'password123')).rejects.toThrow('db down');
  });
});

describe('AuthService.loginWithGithub', () => {
  const profile = { githubId: '42', email: 'a@b.dev', name: 'A', avatarUrl: null };

  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout'] }));
  afterEach(() => vi.useRealTimers());

  it('refuses to re-link an email that belongs to a different GitHub account', async () => {
    const { svc, users, tokens } = setup();
    users.findByEmail.mockResolvedValue({ id: '1', email: 'a@b.dev', githubId: '999', passwordHash: 'x' });
    await expect(svc.loginWithGithub(profile)).rejects.toBeInstanceOf(ConflictException);
    expect(users.save).not.toHaveBeenCalled();
    expect(tokens.issue).not.toHaveBeenCalled();
  });

  it('linking to a password account wipes the password and revokes existing sessions', async () => {
    const { svc, users, tokens } = setup();
    const existing = { id: '1', email: 'a@b.dev', githubId: null, passwordHash: 'scrypt$x$y', name: null, avatarUrl: null };
    users.findByEmail.mockResolvedValue(existing);

    const p = svc.loginWithGithub(profile);
    await vi.advanceTimersByTimeAsync(1200);
    await p;

    expect(existing).toMatchObject({ githubId: '42', passwordHash: null });
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith('1');
    expect(tokens.issue).toHaveBeenCalledWith('1');
  });

  it('creates a new user for an unknown GitHub account', async () => {
    const { svc, users } = setup();
    users.createFromGithub.mockResolvedValue({ id: '2', email: 'a@b.dev', name: 'A', avatarUrl: null });
    await svc.loginWithGithub(profile);
    expect(users.createFromGithub).toHaveBeenCalledWith(profile);
  });

  it('an already linked GitHub account just logs in (no revocation)', async () => {
    const { svc, users, tokens } = setup();
    users.findByGithubId.mockResolvedValue({ id: '3', email: 'a@b.dev', githubId: '42' });
    await svc.loginWithGithub(profile);
    expect(tokens.revokeAllForUser).not.toHaveBeenCalled();
  });
});

describe('AuthService.logout', () => {
  it('blacklists the access token and revokes the session of both tokens', async () => {
    const { svc, tokens } = setup();
    tokens.peekRefresh.mockResolvedValue({ fid: 'f2' });
    await svc.logout({ access: { jti: 'j', exp: 1, fid: 'f1' }, refreshToken: 'r' });
    expect(tokens.blacklist).toHaveBeenCalledWith({ jti: 'j', exp: 1, fid: 'f1' });
    expect(tokens.revokeFamily).toHaveBeenCalledWith('f1');
    expect(tokens.revokeFamily).toHaveBeenCalledWith('f2');
  });

  it('is a no-op for garbage input', async () => {
    const { svc, tokens } = setup();
    tokens.peekRefresh.mockResolvedValue(undefined);
    await expect(svc.logout({ refreshToken: 'junk' })).resolves.toBeUndefined();
    expect(tokens.revokeFamily).not.toHaveBeenCalled();
  });
});
