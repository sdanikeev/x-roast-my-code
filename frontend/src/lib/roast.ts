import { HttpError, isHttpError } from "@x-requests/core";
import type { Locale, MessageKey } from "@/lib/i18n/messages";
import { api } from "@/lib/api";
import type { Severity } from "@/components/ui";

export const TOXICITY = ["mild", "medium", "nuclear"] as const;
export type Toxicity = (typeof TOXICITY)[number];

export type Language = Locale; // the UI language is also the language of the roast

export type Finding = { line: number; sev: Severity; text: string };
export type RoastResult = { score: string; verdict: string; findings: Finding[] };

// Backend endpoint expected at POST /roast.
export const roast = (body: { code: string; filename: string; toxicity: Toxicity; language: Language }) =>
  api.post("/roast").body(body).timeout(185_000).result(); // generous: a local model can take long

/** What the UI shows while the roast is still being written. */
export type LiveRoast = {
  facts: { i: number; line: number; sev: Severity }[];
  texts: Record<number, string>;
  verdict: string;
};

export const emptyLive = (): LiveRoast => ({ facts: [], texts: {}, verdict: "" });

/** Folds one stream event into the live view (a new "roasting" stage = the model restarted, drop its text). */
export function applyLive(live: LiveRoast, ev: RoastEvent): LiveRoast {
  if (ev.type === "facts") return { ...live, facts: ev.lines };
  if (ev.type === "stage" && ev.stage === "roasting") return { ...live, texts: {}, verdict: "" };
  if (ev.type === "text") {
    return ev.target === "verdict"
      ? { ...live, verdict: live.verdict + ev.delta }
      : { ...live, texts: { ...live.texts, [ev.target]: (live.texts[ev.target] ?? "") + ev.delta } };
  }
  return live;
}

/** The live view in the shape of a finished result, so the same component renders both. */
export function liveAsResult(live: LiveRoast): RoastResult {
  return {
    score: "…",
    verdict: live.verdict,
    findings: live.facts
      .map((f) => ({ line: f.line, sev: f.sev, text: live.texts[f.i] ?? "" }))
      .sort((a, b) => a.line - b.line),
  };
}

export type RoastEvent =
  | { type: "stage"; stage: "analyzing" | "roasting" }
  | { type: "facts"; lines: { i: number; line: number; sev: Severity }[] }
  /** Roast text as the model writes it, for fact `target` (its `i` in `facts`) or the verdict. The final `result` replaces it. */
  | { type: "text"; target: number | "verdict"; delta: string }
  | { type: "result"; result: RoastResult };

/** Thrown when the server fails after the stream has already started (its status is in `status`). */
export class RoastStreamError extends Error {
  constructor(readonly status: number) {
    super(`roast stream failed (${status})`);
  }
}

/**
 * Same roast as `roast()`, but as SSE (POST /roast/stream): stage changes and the flagged lines arrive while the
 * second LLM pass is still writing the jokes. Rejections before the stream starts (429/503/400) throw an
 * HttpError, so `roastErrorKey()` works for both. No `.retries()`: a reconnect would run the LLM again.
 */
export async function* roastStream(
  body: { code: string; filename: string; toxicity: Toxicity; language: Language },
  signal?: AbortSignal,
): AsyncGenerator<RoastEvent, void, undefined> {
  const req = api.post("/roast/stream").body(body).timeout(185_000); // timeout covers only the wait for the connection
  for await (const ev of (signal ? req.signal(signal) : req).stream()) {
    const data = ev.data as Record<string, unknown>;
    switch (ev.event) {
      case "stage":
        yield { type: "stage", stage: data.stage as "analyzing" | "roasting" };
        break;
      case "facts":
        yield { type: "facts", lines: data.lines as { i: number; line: number; sev: Severity }[] };
        break;
      case "text":
        yield { type: "text", target: data.target as number | "verdict", delta: String(data.delta) };
        break;
      case "result":
        yield { type: "result", result: data as unknown as RoastResult };
        return;
      case "error":
        throw new RoastStreamError(Number(data.status) || 500);
    }
  }
  throw new RoastStreamError(502); // closed without a result
}

/** Maps a failed /roast call to the i18n key of a message the user can act on. */
export function roastErrorKey(error: unknown): MessageKey {
  if (error instanceof RoastStreamError) return roastErrorKey(new HttpError(error.status, "{}", {}));
  if (isHttpError(error, 429)) return "roaster.err.429";
  if (isHttpError(error, 503)) return "roaster.err.503";
  if (isHttpError(error, 400)) return "roaster.err.400";
  return "roaster.err.other";
}
