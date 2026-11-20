import { HttpError } from "@x-requests/core";
import { describe, expect, it } from "vitest";
import { roastErrorMessage } from "./roast";

describe("roastErrorMessage", () => {
  const err = (status: number) => new HttpError(status, "{}", {});

  it("explains rate limits, offline model and bad input", () => {
    expect(roastErrorMessage(err(429))).toMatch(/slow down/);
    expect(roastErrorMessage(err(503))).toMatch(/offline/);
    expect(roastErrorMessage(err(400))).toMatch(/12000/);
  });

  it("falls back for anything else", () => {
    expect(roastErrorMessage(new Error("boom"))).toMatch(/failed/);
  });
});
