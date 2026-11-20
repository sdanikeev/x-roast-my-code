import { HttpError } from "@x-requests/core";
import { describe, expect, it } from "vitest";
import { MESSAGES } from "./i18n/messages";
import { roastErrorKey } from "./roast";

describe("roastErrorKey", () => {
  const err = (status: number) => new HttpError(status, "{}", {});
  const en = (e: unknown) => MESSAGES.en[roastErrorKey(e)];

  it("explains rate limits, offline model and bad input", () => {
    expect(en(err(429))).toMatch(/slow down/);
    expect(en(err(503))).toMatch(/offline/);
    expect(en(err(400))).toMatch(/12000/);
  });

  it("falls back for anything else", () => {
    expect(en(new Error("boom"))).toMatch(/failed/);
  });
});
