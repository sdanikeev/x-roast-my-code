import { isHttpError } from "@x-requests/core";
import { api } from "@/lib/api";
import type { Severity } from "@/components/ui";

export const TOXICITY = ["mild", "medium", "nuclear"] as const;
export type Toxicity = (typeof TOXICITY)[number];

export const LANGUAGES = ["en", "ru"] as const;
export type Language = (typeof LANGUAGES)[number];

export type Finding = { line: number; sev: Severity; text: string };
export type RoastResult = { score: string; verdict: string; findings: Finding[] };

// Backend endpoint expected at POST /roast.
export const roast = (body: { code: string; filename: string; toxicity: Toxicity; language: Language }) =>
  api.post("/roast").body(body).timeout(185_000).result(); // generous: a local model can take long

/** Maps a failed /roast call to a message the user can act on. */
export function roastErrorMessage(error: unknown): string {
  if (isHttpError(error, 429)) return "slow down: too many roasts right now, try again in a minute";
  if (isHttpError(error, 503)) return "the reviewer is offline or not configured (check the LLM settings on the server)";
  if (isHttpError(error, 400)) return "this input was rejected: max 12000 characters";
  return "the reviewer failed. try again.";
}
