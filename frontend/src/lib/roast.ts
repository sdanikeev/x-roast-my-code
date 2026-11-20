import { isHttpError } from "@x-requests/core";
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

/** Maps a failed /roast call to the i18n key of a message the user can act on. */
export function roastErrorKey(error: unknown): MessageKey {
  if (isHttpError(error, 429)) return "roaster.err.429";
  if (isHttpError(error, 503)) return "roaster.err.503";
  if (isHttpError(error, 400)) return "roaster.err.400";
  return "roaster.err.other";
}
