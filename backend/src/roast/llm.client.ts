import { BadGatewayException, HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ChatMessage = { role: string; content: string };
type JsonMode = 'json_schema' | 'json_object';

type Preset = { baseUrl: string; keyEnv?: string; model: string; jsonMode: JsonMode };

/**
 * Any OpenAI-compatible `/chat/completions` API. Pick one with LLM_PROVIDER, or just set a key
 * (GROQ_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY) and it is detected. Override with LLM_MODEL / LLM_BASE_URL.
 */
function presets(config: ConfigService): Record<string, Preset> {
  return {
    groq: { baseUrl: 'https://api.groq.com/openai/v1', keyEnv: 'GROQ_API_KEY', model: 'openai/gpt-oss-120b', jsonMode: 'json_schema' },
    openai: { baseUrl: 'https://api.openai.com/v1', keyEnv: 'OPENAI_API_KEY', model: 'gpt-4o-mini', jsonMode: 'json_schema' },
    openrouter: {
      baseUrl: 'https://openrouter.ai/api/v1',
      keyEnv: 'OPENROUTER_API_KEY',
      model: 'meta-llama/llama-3.3-70b-instruct',
      jsonMode: 'json_object',
    },
    // local model through ollama's OpenAI-compatible endpoint (no key)
    ollama: {
      baseUrl: `${config.get<string>('OLLAMA_URL', 'http://localhost:11434').replace(/\/+$/, '')}/v1`,
      model: 'qwen2.5-coder:7b',
      jsonMode: 'json_schema',
    },
    // anything else that speaks the OpenAI protocol: set LLM_BASE_URL, LLM_MODEL, LLM_API_KEY
    custom: { baseUrl: config.get<string>('LLM_BASE_URL', ''), keyEnv: 'LLM_API_KEY', model: '', jsonMode: 'json_object' },
  };
}

@Injectable()
export class LlmClient {
  private readonly log = new Logger(LlmClient.name);
  readonly provider: string | undefined;
  readonly model: string;
  /** Optional separate model for the roasting pass (each model has its own rate-limit bucket on most providers). */
  readonly roasterModel: string | undefined;
  /** Reasoning effort for the analysis pass only (bug hunting benefits from more thinking than joke writing). */
  readonly analystEffort: string | undefined;
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly reasoningEffort: string | undefined;
  private jsonMode: JsonMode;

  constructor(config: ConfigService) {
    const all = presets(config);
    const explicit = config.get<string>('LLM_PROVIDER')?.toLowerCase();
    const detected = ['groq', 'openai', 'openrouter'].find((p) => config.get<string>(all[p].keyEnv!));
    this.provider = explicit || detected;

    const preset = this.provider ? all[this.provider] : undefined;
    if (this.provider && !preset) throw new Error(`LLM_PROVIDER must be one of: ${Object.keys(all).join(', ')}`);

    this.baseUrl = (config.get<string>('LLM_BASE_URL') || preset?.baseUrl || '').replace(/\/+$/, '');
    this.model = config.get<string>('LLM_MODEL') || preset?.model || '';
    this.roasterModel = config.get<string>('LLM_ROASTER_MODEL') || undefined;
    this.analystEffort = config.get<string>('LLM_ANALYST_EFFORT') || undefined;
    this.apiKey = config.get<string>('LLM_API_KEY') || (preset?.keyEnv ? config.get<string>(preset.keyEnv) : undefined) || undefined;
    this.jsonMode = (config.get<string>('LLM_JSON_MODE') as JsonMode) || preset?.jsonMode || 'json_object';
    this.timeoutMs = Number(config.get('LLM_TIMEOUT_MS', 120_000));
    this.reasoningEffort = config.get<string>('LLM_REASONING_EFFORT') || undefined; // e.g. "low" for gpt-oss, "none" for qwen3

    if (this.provider) this.log.log(`LLM provider=${this.provider} model=${this.model} mode=${this.jsonMode} url=${this.baseUrl}`);
    else this.log.warn('No LLM configured: set GROQ_API_KEY (or OPENAI_API_KEY / OPENROUTER_API_KEY / LLM_PROVIDER=ollama)');
  }

  /** One chat completion that must come back as a JSON object. Errors are mapped to HTTP exceptions. */
  async chatJson(messages: ChatMessage[], schema: object, temperature: number, model?: string, effort?: string): Promise<unknown> {
    if (!this.provider || !this.baseUrl || !this.model) throw new ServiceUnavailableException('the reviewer is not configured');

    for (let attempt = 0; attempt < 4; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
          body: JSON.stringify(this.body(messages, schema, temperature, model, effort)),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (e) {
        this.log.warn(`${this.provider} unreachable: ${(e as Error).message}`);
        throw new ServiceUnavailableException('the reviewer is unavailable');
      }

      if (res.ok) return this.parse(await res.json().catch(() => undefined));

      const raw = await res.text().catch(() => '');
      const detail = raw.slice(0, 300);
      if (res.status === 401 || res.status === 403) {
        this.log.error(`${this.provider} rejected the API key (${res.status}): ${detail}`);
        throw new ServiceUnavailableException('the reviewer is misconfigured');
      }
      if (res.status === 429) {
        // free tiers have tight tokens-per-minute limits: waiting a few seconds beats failing the user
        const wait = Number(res.headers.get('retry-after'));
        if (attempt < 2 && wait > 0 && wait <= 20) {
          await new Promise((r) => setTimeout(r, wait * 1000));
          continue;
        }
        this.log.warn(`${this.provider} rate limited: ${detail}`);
        throw new HttpException('the reviewer is rate limited, try again in a bit', HttpStatus.TOO_MANY_REQUESTS);
      }
      // The provider's JSON validator rejected the generation (typical for reasoning models). The rejected text
      // is attached to the error: often it is still usable JSON. Otherwise just ask again.
      if (res.status === 400 && /json_validate_failed/.test(raw)) {
        const salvaged = this.salvage(raw);
        if (salvaged !== undefined) {
          this.log.warn(`${this.provider}: json_validate_failed, salvaged the rejected generation`);
          return salvaged;
        }
        if (attempt < 2) {
          this.log.warn(`${this.provider}: json_validate_failed, retrying: ${raw.slice(0, 500)}`);
          continue;
        }
      }
      // model does not support strict schemas: degrade to plain JSON mode (schema goes into the prompt) and retry
      if (res.status === 400 && this.jsonMode === 'json_schema' && /json_schema|response_format|structured/i.test(detail)) {
        this.log.warn(`${this.provider}/${this.model} has no json_schema support, switching to json_object`);
        this.jsonMode = 'json_object';
        continue;
      }
      this.log.warn(`${this.provider} answered ${res.status}: ${detail}`);
      throw new BadGatewayException('the reviewer failed');
    }
    throw new BadGatewayException('the reviewer failed');
  }

  private body(messages: ChatMessage[], schema: object, temperature: number, model?: string, effort?: string) {
    const body: Record<string, unknown> = { model: model || this.model, temperature, stream: false };
    if (effort || this.reasoningEffort) body.reasoning_effort = effort || this.reasoningEffort;

    if (this.jsonMode === 'json_schema') {
      body.messages = messages;
      body.response_format = { type: 'json_schema', json_schema: { name: 'roast', strict: false, schema } };
    } else {
      // json_object only guarantees "some JSON": tell the model the shape (and the word JSON is required by OpenAI)
      const [system, ...rest] = messages;
      body.messages = [
        { ...system, content: `${system.content}\n\nRespond with a single JSON object that validates against this JSON Schema:\n${JSON.stringify(schema)}` },
        ...rest,
      ];
      body.response_format = { type: 'json_object' };
    }
    return body;
  }

  private parse(payload: unknown): unknown {
    const content = (payload as { choices?: { message?: { content?: string } }[] } | undefined)?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new BadGatewayException('the reviewer returned an empty answer');
    const parsed = parseLoose(content);
    if (parsed === undefined) throw new BadGatewayException('the reviewer returned an unreadable answer');
    return parsed;
  }

  /** `{"error":{"code":"json_validate_failed","failed_generation":"{...}"}}` -> the JSON the model did produce. */
  private salvage(rawBody: string): unknown {
    try {
      const failed = (JSON.parse(rawBody) as { error?: { failed_generation?: unknown } }).error?.failed_generation;
      return typeof failed === 'string' ? parseLoose(failed) : undefined;
    } catch {
      return undefined;
    }
  }
}

/** JSON.parse that tolerates <think>…</think> blocks and prose around the object. */
export function parseLoose(content: string): unknown {
  const text = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  for (const candidate of [text, text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)]) {
    try {
      const v = JSON.parse(candidate);
      if (v && typeof v === 'object') return v;
    } catch {
      /* try next */
    }
  }
  return undefined;
}
