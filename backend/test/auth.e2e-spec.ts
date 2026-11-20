import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Redis } from 'ioredis';
import { AppModule } from '../src/app.module.js';
import { REDIS } from '../src/redis/redis.module.js';
import { LlmClient } from '../src/roast/llm.client.js';
import { configureApp } from '../src/app.setup.js';

const PASSWORD = 'correct-horse-battery';
const email = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@test.dev`;

describe('auth (e2e, real Postgres + Redis)', () => {
  let app: NestExpressApplication;
  const llm = { chatJson: vi.fn() }; // no real LLM calls in tests
  const http = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LlmClient)
      .useValue(llm)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app, 'http://localhost:3000'); // the exact production setup
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const register = async (e = email()) => {
    const agent = request.agent(http()); // keeps the refresh cookie
    const res = await agent.post('/auth/register').send({ email: e, password: PASSWORD }).expect(201);
    return { agent, email: e, accessToken: res.body.accessToken as string, res };
  };

  it('GET /health reports postgres and redis', async () => {
    const res = await request(http()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', postgres: 'ok', redis: 'ok' });
  });

  it('register returns an access token, a public user and an httpOnly refresh cookie', async () => {
    const { res, email: e } = await register();
    expect(res.body.user).toMatchObject({ email: e });
    expect(res.body.user.passwordHash).toBeUndefined();
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('roast_rt='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('validates input and rejects duplicates', async () => {
    await request(http()).post('/auth/register').send({ email: 'nope', password: '1' }).expect(400);
    await request(http()).post('/auth/register').send({ email: email(), password: PASSWORD, admin: true }).expect(400);
    const { email: e } = await register();
    await request(http()).post('/auth/register').send({ email: e.toUpperCase(), password: PASSWORD }).expect(409);
  });

  it('login: right password works, wrong password and unknown user give the same 401', async () => {
    const { email: e } = await register();
    await request(http()).post('/auth/login').send({ email: e, password: PASSWORD }).expect(200);
    const wrong = await request(http()).post('/auth/login').send({ email: e, password: 'wrong-password' }).expect(401);
    const unknown = await request(http()).post('/auth/login').send({ email: email(), password: PASSWORD }).expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('locks login after repeated failures (429)', async () => {
    const { email: e } = await register();
    for (let i = 0; i < 5; i++) {
      await request(http()).post('/auth/login').send({ email: e, password: 'bad-bad-bad' }).expect(401);
    }
    await request(http()).post('/auth/login').send({ email: e, password: PASSWORD }).expect(429);
  });

  it('GET /auth/me needs a valid bearer token', async () => {
    const { accessToken, email: e } = await register();
    await request(http()).get('/auth/me').expect(401);
    await request(http()).get('/auth/me').set('Authorization', 'Bearer garbage').expect(401);
    const res = await request(http()).get('/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(res.body.email).toBe(e);
  });

  it('refresh rotates the token; replaying the old one revokes the session', async () => {
    const { agent, accessToken: oldAccess } = await register();
    const stolenCookie = agent.jar.getCookie('roast_rt', { path: '/', domain: '127.0.0.1', script: false, secure: false } as never);
    expect(stolenCookie).toBeDefined();

    const refreshed = await agent.post('/auth/refresh').expect(200);
    expect(refreshed.body.accessToken).toBeTruthy();

    // right after rotation a replay is indistinguishable from a second tab: 409, nothing revoked
    await request(http()).post('/auth/refresh').set('Cookie', `roast_rt=${stolenCookie!.value}`).expect(409);

    // once the grace window is over (emulated by dropping its marker) a replay is theft: 401 + revoke
    const jti = JSON.parse(Buffer.from(stolenCookie!.value.split('.')[1], 'base64url').toString()).jti as string;
    await app.get<Redis>(REDIS).del(`rtu:${jti}`);
    await request(http()).post('/auth/refresh').set('Cookie', `roast_rt=${stolenCookie!.value}`).expect(401);
    // ...which also kills the legitimate holder and the outstanding access tokens
    await agent.post('/auth/refresh').expect(401);
    await request(http()).get('/auth/me').set('Authorization', `Bearer ${refreshed.body.accessToken}`).expect(401);
    await request(http()).get('/auth/me').set('Authorization', `Bearer ${oldAccess}`).expect(401);
  });

  const cookieOf = (res: request.Response) =>
    (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('roast_rt='))!.split(';')[0].slice('roast_rt='.length);

  it('two tabs refreshing with the same cookie: one 200, one 409, and the session survives', async () => {
    const reg = await register();
    const old = cookieOf(reg.res);
    const send = () => request(http()).post('/auth/refresh').set('Cookie', `roast_rt=${old}`);
    const results = await Promise.all([send(), send()]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = results.find((r) => r.status === 200)!;
    const loser = results.find((r) => r.status === 409)!;
    // a 409 must not clear the cookie the winner just set
    expect(((loser.headers['set-cookie'] as unknown as string[]) ?? []).some((c) => c.startsWith('roast_rt=;'))).toBe(false);
    // the winner's cookie is still good => no family revocation happened
    await request(http()).post('/auth/refresh').set('Cookie', `roast_rt=${cookieOf(winner)}`).expect(200);
  });

  it('refresh without a cookie is 401', async () => {
    await request(http()).post('/auth/refresh').expect(401);
  });

  it('logout blacklists the access token and invalidates the refresh token', async () => {
    const { agent, accessToken } = await register();
    await agent.post('/auth/logout').set('Authorization', `Bearer ${accessToken}`).expect(204);
    await request(http()).get('/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(401);
    await agent.post('/auth/refresh').expect(401);
  });

  it('logout never fails, even without any credentials', async () => {
    await request(http()).post('/auth/logout').expect(204);
  });

  it('logout-all ends every session of the user, not other users', async () => {
    const e = email();
    const first = await register(e);
    await new Promise((r) => setTimeout(r, 1100)); // JWT iat resolution is 1s
    const second = await request(http()).post('/auth/login').send({ email: e, password: PASSWORD }).expect(200);
    const bystander = await register();

    await new Promise((r) => setTimeout(r, 1100));
    await request(http()).post('/auth/logout-all').set('Authorization', `Bearer ${second.body.accessToken}`).expect(204);

    await request(http()).get('/auth/me').set('Authorization', `Bearer ${first.accessToken}`).expect(401);
    await request(http()).get('/auth/me').set('Authorization', `Bearer ${second.body.accessToken}`).expect(401);
    await request(http()).get('/auth/me').set('Authorization', `Bearer ${bystander.accessToken}`).expect(200);
  });

  it('login CSRF: cross-origin and form-encoded requests are rejected', async () => {
    const body = { email: email(), password: PASSWORD };
    await request(http()).post('/auth/login').set('Origin', 'https://evil.example').send(body).expect(403);
    await request(http()).post('/auth/login').set('Sec-Fetch-Site', 'cross-site').send(body).expect(403);
    // urlencoded body is not parsed => validation fails; it can never authenticate
    await request(http()).post('/auth/login').type('form').send(body).expect(400);
    await request(http()).post('/auth/login').set('Origin', 'http://localhost:3000').send(body).expect(401);
  });

  it('refresh cookie is Path=/, HttpOnly, SameSite=Lax and cleared on logout', async () => {
    const { agent, res } = await register();
    const set = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('roast_rt='))!;
    expect(set).toMatch(/Path=\//);
    const out = await agent.post('/auth/logout').expect(204);
    expect((out.headers['set-cookie'] as unknown as string[]).some((c) => c.startsWith('roast_rt=;'))).toBe(true);
  });

  it('GitHub OAuth start redirects to github with a state and sets the state cookie', async () => {
    const res = await request(http()).get('/auth/github');
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.host).toBe('github.com');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect((res.headers['set-cookie'] as unknown as string[]).some((c) => c.startsWith('roast_oauth_state='))).toBe(true);
  });

  it('GitHub callback with a missing or mismatching state is bounced to the login page', async () => {
    const res = await request(http()).get('/auth/github/callback?code=abc&state=forged').set('Cookie', 'roast_oauth_state=other');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login?error=oauth_state');
  });

  describe('POST /roast', () => {
    const body = { code: 'var x = 1\nreturn x', filename: 'a.js', toxicity: 'medium', language: 'en' };
    const model = (schema: { required: string[] }) =>
      schema.required.includes('items')
        ? { verdict: 'meh', items: [{ i: 0, text: 'var again', fix: 'const x = 1' }] }
        : { score: 4, findings: [{ line: 1, sev: 'WARN', quote: 'var x', problem: 'uses var', fix: 'const x = 1' }] };
    beforeEach(() => {
      // NB: braces matter - a function returned from beforeEach would be run as a cleanup hook
      llm.chatJson.mockReset().mockImplementation(async (_m: unknown, schema: { required: string[] }) => model(schema));
    });

    it('requires authentication', async () => {
      await request(http()).post('/roast').send(body).expect(401);
    });

    it('validates input (toxicity, language, size, unknown fields)', async () => {
      const { accessToken } = await register();
      const post = (b: object) => request(http()).post('/roast').set('Authorization', `Bearer ${accessToken}`).send(b);
      await post({ ...body, toxicity: 'apocalyptic' }).expect(400);
      await post({ ...body, language: 'klingon' }).expect(400);
      await post({ ...body, code: '' }).expect(400);
      await post({ ...body, code: 'x'.repeat(12_001) }).expect(400);
      await post({ ...body, role: 'admin' }).expect(400);
      expect(llm.chatJson).not.toHaveBeenCalled();
    });

    it('returns the verified, voiced review for an authenticated user', async () => {
      const { accessToken } = await register();
      const res = await request(http()).post('/roast').set('Authorization', `Bearer ${accessToken}`).send(body).expect(200);
      expect(res.body).toEqual({ score: '4/10', verdict: 'meh', findings: [{ line: 1, sev: 'WARN', text: 'var again\nfix: const x = 1' }] });
      expect(llm.chatJson).toHaveBeenCalledTimes(2);
    });

    it('language is optional', async () => {
      const { accessToken } = await register();
      const noLang: Partial<typeof body> = { ...body };
      delete noLang.language;
      await request(http()).post('/roast').set('Authorization', `Bearer ${accessToken}`).send(noLang).expect(200);
    });

    it('503 when the model provider is down', async () => {
      const { ServiceUnavailableException } = await import('@nestjs/common');
      llm.chatJson.mockRejectedValue(new ServiceUnavailableException('the reviewer is unavailable'));
      const { accessToken } = await register();
      await request(http()).post('/roast').set('Authorization', `Bearer ${accessToken}`).send(body).expect(503);
    });
  });
});
