/** One JSON string value read from a possibly unfinished document. */
type Partial = { text: string; done: boolean };

/** Decodes the JSON string that starts right after the opening quote at `from`. An unfinished one is returned as far as it goes. */
function readString(src: string, from: number): Partial {
  let out = '';
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === '"') return { text: out, done: true };
    if (c !== '\\') {
      out += c;
      continue;
    }
    const n = src[i + 1];
    if (n === undefined) break; // cut in the middle of an escape
    if (n === 'u') {
      const hex = src.slice(i + 2, i + 6);
      if (hex.length < 4) break;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 5;
    } else {
      out += { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' }[n] ?? n;
      i++;
    }
  }
  return { text: out, done: false };
}

/** Text of the roaster answer `{verdict, items:[{i,text,fix}]}` as far as it has been generated. */
export function readRoastText(raw: string): { verdict?: Partial; items: Map<number, Partial> } {
  // reasoning models may put <think>…</think> in front of the JSON; an unclosed one means nothing is readable yet
  let src = raw.replace(/<think>[\s\S]*?<\/think>/g, '');
  if (src.includes('<think>')) return { items: new Map() };
  src = src.slice(Math.max(0, src.indexOf('{')));

  const verdictAt = /(?<!\\)"verdict"\s*:\s*"/.exec(src);
  const verdict = verdictAt ? readString(src, verdictAt.index + verdictAt[0].length) : undefined;

  const items = new Map<number, Partial>();
  const key = /(?<!\\)"(i|text)"\s*:\s*(?:(\d+)|")/g;
  let lastI: number | undefined;
  let k = 0;
  for (let m = key.exec(src); m; m = key.exec(src)) {
    if (m[1] === 'i') lastI = Number(m[2]);
    else if (m[2] === undefined) {
      items.set(lastI ?? k, readString(src, m.index + m[0].length));
      lastI = undefined;
      k++;
    }
  }
  return { verdict, items };
}

export type TextDelta = { target: number | 'verdict'; delta: string };

/**
 * Turns the growing roaster answer into text deltas that are safe to show before the answer is verified:
 * the tail of an unfinished string is held back (so a banned word cannot flash by across chunks) and a string that
 * hits the hard-limit regex is never shown at all (the final `result` replaces it with the neutral fact).
 */
export class RoastTextStreamer {
  private readonly sent = new Map<number | 'verdict', number>();
  private readonly blocked = new Set<number | 'verdict'>();

  constructor(
    private readonly forbidden: RegExp,
    private readonly emit: (d: TextDelta) => void,
    private readonly holdBack = 24, // longer than any banned word
  ) {}

  push(raw: string): void {
    const { verdict, items } = readRoastText(raw);
    if (verdict) this.feed('verdict', verdict);
    for (const [i, p] of items) this.feed(i, p);
  }

  private feed(target: number | 'verdict', p: Partial): void {
    if (this.blocked.has(target)) return;
    if (this.forbidden.test(p.text)) {
      this.blocked.add(target);
      return;
    }
    const upTo = p.done ? p.text.length : Math.max(0, p.text.length - this.holdBack);
    const from = this.sent.get(target) ?? 0;
    if (upTo > from) {
      this.emit({ target, delta: p.text.slice(from, upTo) });
      this.sent.set(target, upTo);
    }
  }
}
