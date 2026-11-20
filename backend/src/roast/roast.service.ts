import { HttpException, HttpStatus, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';
import { LlmClient } from './llm.client.js';
import { RoastTextStreamer } from './stream-text.js';
import type { Finding, Language, RoastResult, Toxicity } from './roast.dto.js';
import {
  ANALYST_SCHEMA,
  analystMessages,
  CLEAN_VERDICT,
  ROASTER_SCHEMA,
  roasterMessages,
  type Fact,
} from './roast.prompt.js';

/** Progress of one roast, in the order it happens. `facts` carries only line numbers: the jokes come later. */
export type RoastProgress =
  | { type: 'stage'; stage: 'analyzing' | 'roasting' }
  | { type: 'facts'; lines: { i: number; line: number; sev: Finding['sev'] }[] }
  /** A piece of roast text as the model writes it. `target` is a fact index (`i` in `facts`) or the verdict. Unverified: `result` is the truth. */
  | { type: 'text'; target: number | 'verdict'; delta: string };

@Injectable()
export class RoastService {
  private readonly log = new Logger(RoastService.name);
  private readonly ratePerMinute: number;
  private readonly maxConcurrent: number;
  private inFlight = 0;

  constructor(
    config: ConfigService,
    private readonly llm: LlmClient,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    this.ratePerMinute = Number(config.get('ROAST_RATE_PER_MINUTE', 10));
    this.maxConcurrent = Number(config.get('ROAST_MAX_CONCURRENT', 4)); // cap on parallel LLM requests
  }

  async roast(
    userId: string,
    code: string,
    filename: string | undefined,
    toxicity: Toxicity,
    language: Language = 'en',
    onProgress: (e: RoastProgress) => void = () => {},
  ): Promise<RoastResult> {
    await this.enforceRateLimit(userId);
    if (this.inFlight >= this.maxConcurrent) {
      throw new HttpException('the reviewer is busy, try again in a moment', HttpStatus.TOO_MANY_REQUESTS);
    }

    this.inFlight++;
    try {
      const lines = code.replace(/\r\n?/g, '\n').split('\n');
      onProgress({ type: 'stage', stage: 'analyzing' });

      // pass 1: cold analysis, verified against the real code (a retry if everything was made up)
      let analysis = ground(await this.llm.chatJson(analystMessages(lines, filename), ANALYST_SCHEMA, 0.1, undefined, this.llm.analystEffort), lines);
      if (analysis.facts.length === 0 && analysis.dropped > 0) {
        this.log.warn(`all ${analysis.dropped} findings were ungrounded, retrying once`);
        analysis = ground(await this.llm.chatJson(analystMessages(lines, filename), ANALYST_SCHEMA, 0.2, undefined, this.llm.analystEffort), lines);
      }
      if (analysis.facts.length === 0) {
        return { score: `${analysis.score}/10`, verdict: CLEAN_VERDICT[toxicity][language], findings: [] };
      }

      onProgress({ type: 'facts', lines: analysis.facts.map((f, i) => ({ i, line: f.line, sev: f.sev })) });
      onProgress({ type: 'stage', stage: 'roasting' });

      // pass 2: give the verified facts a voice. Retry once if some facts came back unvoiced; if it keeps
      // misbehaving we fall back to the plain facts rather than failing the request.
      let voiced: unknown;
      const messages = roasterMessages(analysis.facts, analysis.score, toxicity, language);
      const temperature = toxicity === 'nuclear' ? 0.7 : 0.4;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          // a retry starts the text over: tell the listener (it clears what it has shown)
          if (attempt > 0) onProgress({ type: 'stage', stage: 'roasting' });
          const streamer = new RoastTextStreamer(FORBIDDEN, (d) => onProgress({ type: 'text', ...d }));
          voiced = await this.llm.chatJson(messages, ROASTER_SCHEMA, temperature, this.llm.roasterModel, undefined, (acc) =>
            streamer.push(acc),
          );
          if (voicedCount(voiced, analysis.facts.length) === analysis.facts.length) break;
          this.log.warn(`roaster voiced ${voicedCount(voiced, analysis.facts.length)}/${analysis.facts.length} facts`);
        } catch (e) {
          this.log.warn(`roaster pass failed: ${(e as Error).message}`);
          if (e instanceof ServiceUnavailableException) break;
        }
      }
      return compose(analysis, voiced, language);
    } finally {
      this.inFlight--;
    }
  }

  /** Per-user sliding-ish window (fixed 60s). The model is slow and expensive: one user must not hog it. */
  private async enforceRateLimit(userId: string): Promise<void> {
    const key = `rl:roast:${userId}`;
    const res = await this.redis.multi().incr(key).expire(key, 60, 'NX').exec();
    if (Number(res?.[0]?.[1]) > this.ratePerMinute) {
      throw new HttpException('too many roasts, slow down', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}

// Hard limits enforced in code, not just in the prompt: a 7B model does not always obey.
// Insulting someone's code and skill is the product; slurs against who they are and calls to self-harm never ship.
const FORBIDDEN =
  /(n[i1]gg|f[a@]gg?[o0]t|k[i1]ke\b|tr[a@]nny|ret[a@]rd|chink|sp[i1]c\b|kill\s+yourself|\bkys\b|пидор|пидар|педик|жид[ыаов]|хач|чурк|негр|даун|хохол|кацап|москал|сдохни|повесься|убей\s+себя|вскрой\s+вены)/i;

const squash = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Remove a copied "12: " prefix and wrapping backticks/quotes the model likes to add. */
const cleanQuote = (q: string) => {
  const unwrap = (x: string) => x.trim().replace(/^[`'"]+|[`'"]+$/g, '');
  return squash(unwrap(unwrap(q).replace(/^\s*\d+\s*:\s?/, '')));
};

export type Analysis = { score: number; facts: Fact[]; dropped: number };

/**
 * Pass-1 output -> verified facts. Never trust the model: a finding whose quote is not on any line of the code is
 * a hallucination and is dropped; a wrong line number is corrected to the line that really contains the quote.
 */
export function ground(raw: unknown, lines: string[]): Analysis {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const flat = lines.map(squash);

  const n = Math.round(Number(obj.score));
  const score = Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : 0;

  const facts: Fact[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  for (const f of Array.isArray(obj.findings) ? obj.findings : []) {
    if (!f || typeof f !== 'object') continue;
    const { line, sev, quote, problem, fix } = f as Record<string, unknown>;
    const claimed = Math.round(Number(line));
    const prob = typeof problem === 'string' ? problem.trim().slice(0, 400) : '';
    if (!prob || !Number.isFinite(claimed)) continue;

    const q = typeof quote === 'string' ? cleanQuote(quote) : '';
    let at = -1;
    if (q.length >= 2) {
      const c = Math.min(lines.length, Math.max(1, claimed)) - 1;
      if (flat[c].includes(q)) at = c;
      else {
        let best = Infinity;
        flat.forEach((l, i) => {
          if (l.includes(q) && Math.abs(i - c) < best) {
            best = Math.abs(i - c);
            at = i;
          }
        });
      }
    }
    if (at === -1) {
      dropped++;
      continue;
    }

    const key = `${at}|${q}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({
      line: at + 1,
      sev: sev === 'CRIT' ? 'CRIT' : 'WARN',
      quote: lines[at].trim().slice(0, 200),
      problem: prob,
      fix: typeof fix === 'string' ? fix.trim().slice(0, 300) : '',
    });
    if (facts.length === 6) break;
  }
  facts.sort((a, b) => a.line - b.line); // top to bottom: the roast is then written (and streamed) in reading order
  return { score, facts, dropped };
}

/** How many of the n facts have a usable voiced text in the pass-2 output. */
export function voicedCount(voiced: unknown, n: number): number {
  const items = (voiced as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return 0;
  const ok = new Set<number>();
  for (const it of items) {
    const { i, text } = (it ?? {}) as { i?: unknown; text?: unknown };
    if (Number.isInteger(i) && (i as number) >= 0 && (i as number) < n && typeof text === 'string' && text.trim()) ok.add(i as number);
  }
  return ok.size;
}

/** Pass-2 output + verified facts -> what the UI shows. Line, severity and fix always come from the verified facts. */
export function compose(analysis: Analysis, voiced: unknown, language: Language): RoastResult {
  const v = (voiced && typeof voiced === 'object' ? voiced : {}) as Record<string, unknown>;
  const items = new Map<number, { text?: unknown; fix?: unknown }>();
  for (const it of Array.isArray(v.items) ? v.items : []) {
    if (it && typeof it === 'object' && Number.isInteger((it as { i?: unknown }).i)) {
      items.set((it as { i: number }).i, it as { text?: unknown; fix?: unknown });
    }
  }

  const findings: Finding[] = analysis.facts.map((fact, i) => {
    const it = items.get(i);
    const text = typeof it?.text === 'string' ? it.text.trim().slice(0, 600) : '';
    const fix = typeof it?.fix === 'string' && it.fix.trim() ? it.fix.trim().slice(0, 300) : fact.fix;
    const voicedText = `${text}\nfix: ${fix}`;
    // no voiced text, or it broke a hard limit: fall back to the neutral fact
    const body = text && !FORBIDDEN.test(voicedText) ? voicedText : `${fact.problem}\nfix: ${fact.fix}`;
    return { line: fact.line, sev: fact.sev, text: body };
  });
  findings.sort((a, b) => a.line - b.line);

  let verdict = typeof v.verdict === 'string' ? v.verdict.trim().slice(0, 400) : '';
  if (!verdict || FORBIDDEN.test(verdict)) verdict = language === 'ru' ? 'Вердикт: чини.' : 'Verdict: fix it.';
  return { score: `${analysis.score}/10`, verdict, findings };
}
