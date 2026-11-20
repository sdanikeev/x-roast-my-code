import type { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmClient } from './llm.client.js';

const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const err = (status: number, body = '{}', headers: Record<string, string> = {}) => new Response(body, { status, headers });
const make = (env: Record<string, unknown>) => new LlmClient(new ConfigService(env));
const SCHEMA = { type: 'object', required: ['x'] };
const MSGS = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }];

describe('LlmClient configuration', () => {
  it('detects groq from GROQ_API_KEY', () => {
    const c = make({ GROQ_API_KEY: 'k' });
    expect(c.provider).toBe('groq');
    expect(c.model).toBe('openai/gpt-oss-120b');
  });

  it('LLM_PROVIDER/LLM_MODEL/LLM_BASE_URL override the preset', () => {
    const c = make({ GROQ_API_KEY: 'k', LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'o', LLM_MODEL: 'gpt-x' });
    expect(c.provider).toBe('openai');
    expect(c.model).toBe('gpt-x');
  });

  it('rejects an unknown provider', () => {
    expect(() => make({ LLM_PROVIDER: 'skynet' })).toThrow(/LLM_PROVIDER/);
  });

  it('not configured: boots, but requests fail with 503', async () => {
    const c = make({});
    expect(c.provider).toBeUndefined();
    await expect(c.chatJson(MSGS, SCHEMA, 0)).rejects.toMatchObject({ status: 503 });
  });
});

describe('LlmClient.chatJson', () => {
  afterEach(() => vi.restoreAllMocks());

  it('POSTs to /chat/completions with the bearer key, json_schema mode and the temperature', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok('{"a":1}'));
    await expect(make({ GROQ_API_KEY: 'sekret' }).chatJson(MSGS, SCHEMA, 0.3)).resolves.toEqual({ a: 1 });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sekret');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: 'openai/gpt-oss-120b', temperature: 0.3, stream: false });
    expect(body.response_format).toMatchObject({ type: 'json_schema', json_schema: { schema: SCHEMA } });
    expect(body.messages).toEqual(MSGS);
  });

  it('json_object mode puts the schema into the system prompt', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok('{}'));
    await make({ GROQ_API_KEY: 'k', LLM_JSON_MODE: 'json_object' }).chatJson(MSGS, SCHEMA, 0);
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].content).toContain('JSON Schema');
    expect(body.messages[0].content).toContain('"required":["x"]');
    expect(body.messages[1]).toEqual(MSGS[1]);
  });

  it('ollama preset needs no key and does not send an auth header', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok('{}'));
    await make({ LLM_PROVIDER: 'ollama', OLLAMA_URL: 'http://host:11434/' }).chatJson(MSGS, SCHEMA, 0);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://host:11434/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('uses LLM_ROASTER_MODEL for the roasting pass only', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ok('{}'));
    const c = make({ GROQ_API_KEY: 'k', LLM_ROASTER_MODEL: 'openai/gpt-oss-20b' });
    await c.chatJson(MSGS, SCHEMA, 0);
    await c.chatJson(MSGS, SCHEMA, 0, c.roasterModel);
    const models = spy.mock.calls.map((c2) => JSON.parse((c2[1] as RequestInit).body as string).model);
    expect(models).toEqual(['openai/gpt-oss-120b', 'openai/gpt-oss-20b']);
  });

  it('forwards LLM_REASONING_EFFORT', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok('{}'));
    await make({ GROQ_API_KEY: 'k', LLM_REASONING_EFFORT: 'low' }).chatJson(MSGS, SCHEMA, 0);
    expect(JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string).reasoning_effort).toBe('low');
  });

  it.each([
    ['<think>hmm</think>{"a":1}', { a: 1 }],
    ['Sure! Here you go:\n{"a":2}\nHope it helps', { a: 2 }],
  ])('tolerates reasoning/prose around the JSON: %j', async (content, expected) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok(content));
    await expect(make({ GROQ_API_KEY: 'k' }).chatJson(MSGS, SCHEMA, 0)).resolves.toEqual(expected);
  });

  it('502 on unreadable or empty answers', async () => {
    const c = make({ GROQ_API_KEY: 'k' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok('not json')).mockResolvedValueOnce(new Response('{}'));
    await expect(c.chatJson(MSGS, SCHEMA, 0)).rejects.toMatchObject({ status: 502 });
    await expect(c.chatJson(MSGS, SCHEMA, 0)).rejects.toMatchObject({ status: 502 });
  });

  it('503 when unreachable, and when the API key is rejected (never leaks the key)', async () => {
    const c = make({ GROQ_API_KEY: 'sekret-key' });
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(err(401, 'bad key sekret-key'));
    await expect(c.chatJson(MSGS, SCHEMA, 0)).rejects.toMatchObject({ status: 503 });
    const e = (await c.chatJson(MSGS, SCHEMA, 0).catch((x: unknown) => x)) as HttpException;
    expect(e.getStatus()).toBe(503);
    expect(JSON.stringify(e.getResponse())).not.toContain('sekret-key');
  });

  it('429 with a short Retry-After (<=20s) is waited out and retried; a longer one is surfaced as 429', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(err(429, '{}', { 'retry-after': '0.001' }));
    // Number('0.001') > 0 && <= 5 => retried after ~1ms
    spy.mockResolvedValueOnce(ok('{"a":1}'));
    await expect(make({ GROQ_API_KEY: 'k' }).chatJson(MSGS, SCHEMA, 0)).resolves.toEqual({ a: 1 });
    expect(spy).toHaveBeenCalledTimes(2);

    spy.mockReset().mockResolvedValue(err(429, '{}', { 'retry-after': '60' }));
    await expect(make({ GROQ_API_KEY: 'k' }).chatJson(MSGS, SCHEMA, 0)).rejects.toMatchObject({ status: 429 });
  });

  it('degrades json_schema -> json_object when the model does not support schemas, and remembers it', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(err(400, '{"error":{"message":"response_format json_schema is not supported by this model"}}'))
      .mockImplementation(async () => ok('{"a":1}')); // fresh Response per call: a body can be read once
    const c = make({ GROQ_API_KEY: 'k' });
    await expect(c.chatJson(MSGS, SCHEMA, 0)).resolves.toEqual({ a: 1 });
    expect(JSON.parse((spy.mock.calls[1][1] as RequestInit).body as string).response_format.type).toBe('json_object');
    await c.chatJson(MSGS, SCHEMA, 0);
    expect(JSON.parse((spy.mock.calls[2][1] as RequestInit).body as string).response_format.type).toBe('json_object');
  });

  it('salvages the JSON from a provider-side json_validate_failed error', async () => {
    const body = JSON.stringify({ error: { code: 'json_validate_failed', failed_generation: 'sure {"a":3} done' } });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => err(400, body));
    await expect(make({ GROQ_API_KEY: 'k' }).chatJson(MSGS, SCHEMA, 0)).resolves.toEqual({ a: 3 });
  });

  it('retries json_validate_failed when nothing is salvageable, then gives up with 502', async () => {
    const body = JSON.stringify({ error: { code: 'json_validate_failed', failed_generation: '{"a": tru' } });
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => err(400, body));
    await expect(make({ GROQ_API_KEY: 'k' }).chatJson(MSGS, SCHEMA, 0)).rejects.toMatchObject({ status: 502 });
    expect(spy.mock.calls.length).toBeGreaterThan(1);

    spy.mockReset()
      .mockImplementationOnce(async () => err(400, body))
      .mockImplementation(async () => ok('{"a":9}'));
    await expect(make({ GROQ_API_KEY: 'k' }).chatJson(MSGS, SCHEMA, 0)).resolves.toEqual({ a: 9 });
  });

  it('502 on other provider errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(err(500, 'boom'));
    await expect(make({ GROQ_API_KEY: 'k' }).chatJson(MSGS, SCHEMA, 0)).rejects.toMatchObject({ status: 502 });
  });
});
