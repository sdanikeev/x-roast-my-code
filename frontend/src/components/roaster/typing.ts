"use client";

import { useEffect, useRef, useState } from "react";

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * One typewriter for a whole list of texts, typed strictly one after another: segment k starts only when every
 * segment before it is fully typed. The texts may grow while we type (they come from a stream, often in bursts, so
 * several can arrive at once). A text that is replaced by something that no longer starts with what is shown is
 * rewound to the common part. Returns how many characters of each text to show; without `animate` everything is
 * shown at once.
 */
export function useSequentialTyping(texts: string[], animate: boolean): number[] {
  const [state, setState] = useState<{ texts: string[]; shown: number[] }>({ texts, shown: texts.map(() => 0) });
  const target = useRef(texts);

  // texts changed (compared by content): rewind any segment that no longer starts with what was typed
  if (!same(state.texts, texts)) {
    const shown = texts.map((text, k) => {
      const old = state.texts[k] ?? "";
      let common = 0;
      while (common < old.length && common < text.length && old[common] === text[common]) common++;
      return Math.min(state.shown[k] ?? 0, common);
    });
    setState({ texts, shown });
  }

  useEffect(() => {
    target.current = texts;
  });

  useEffect(() => {
    if (!animate) return;
    const instant = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      if (instant || now - last >= 16) {
        last = now;
        setState((s) => {
          const t = target.current;
          const k = t.findIndex((text, i) => (s.shown[i] ?? 0) < text.length);
          if (k < 0 || !same(s.texts, t)) return s;
          const left = t.reduce((sum, text, i) => sum + text.length - (s.shown[i] ?? 0), 0);
          // steady typing; a big backlog is caught up faster so we never lag far behind the model
          const step = instant ? left : 1 + Math.floor(left / 40);
          const shown = s.shown.slice();
          shown[k] = Math.min(t[k].length, (shown[k] ?? 0) + step);
          return { ...s, shown };
        });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  return texts.map((text, k) => (animate ? Math.min(state.shown[k] ?? 0, text.length) : text.length));
}
