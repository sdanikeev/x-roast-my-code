import { describe, expect, it } from 'vitest';
import { readRoastText, RoastTextStreamer, type TextDelta } from './stream-text.js';

const FULL = '{"verdict":"Trash \\"code\\".","items":[{"i":0,"text":"You clown,\\nit leaks.","fix":"close it"},{"i":1,"text":"meh","fix":"x"}]}';

describe('readRoastText', () => {
  it('reads a finished answer', () => {
    const r = readRoastText(FULL);
    expect(r.verdict).toEqual({ text: 'Trash "code".', done: true });
    expect(r.items.get(0)).toEqual({ text: 'You clown,\nit leaks.', done: true });
    expect(r.items.get(1)).toEqual({ text: 'meh', done: true });
  });

  it('reads an unfinished one as far as it goes, without half escapes', () => {
    const r = readRoastText('{"verdict":"ok","items":[{"i":0,"text":"line\\');
    expect(r.items.get(0)).toEqual({ text: 'line', done: false });
    expect(readRoastText('{"verdict":"a\\u04').verdict).toEqual({ text: 'a', done: false });
  });

  it('ignores <think> blocks and prose around the JSON', () => {
    expect(readRoastText('<think>{"verdict":"no"}</think>\nsure: {"verdict":"yes"').verdict?.text).toBe('yes');
    expect(readRoastText('<think>still thinking {"verdict":"no"').verdict).toBeUndefined();
  });
});

describe('RoastTextStreamer', () => {
  const run = (chunks: string[], hold = 4) => {
    const out: TextDelta[] = [];
    const s = new RoastTextStreamer(/badword/i, (d) => out.push(d), hold);
    let acc = '';
    for (const c of chunks) s.push((acc += c));
    return out;
  };
  const joined = (out: TextDelta[], target: number | 'verdict') =>
    out.filter((d) => d.target === target).map((d) => d.delta).join('');

  it('streams the same text the final JSON holds, in any chunking', () => {
    for (const size of [1, 3, 7, 1000]) {
      const chunks = FULL.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g'))!;
      const out = run(chunks);
      expect(joined(out, 0)).toBe('You clown,\nit leaks.');
      expect(joined(out, 1)).toBe('meh');
      expect(joined(out, 'verdict')).toBe('Trash "code".');
    }
  });

  it('holds back the tail of an unfinished string', () => {
    expect(run(['{"verdict":"abcdefghij'])).toEqual([{ target: 'verdict', delta: 'abcdef' }]);
  });

  it('never shows a banned word, even split across chunks', () => {
    const out = run(['{"verdict":"x","items":[{"i":0,"text":"you bad', 'word, really","fix":"f"}]}'], 8);
    expect(joined(out, 0)).toBe('');
    expect(joined(out, 'verdict')).toBe('x');
  });
});
