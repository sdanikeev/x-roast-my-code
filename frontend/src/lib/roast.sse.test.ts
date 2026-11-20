import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyLive, emptyLive, liveAsResult, roastErrorKey, roastStream, RoastStreamError, type RoastEvent } from "./roast";

const body = { code: "x", filename: "a.js", toxicity: "mild", language: "en" } as const;

const sse = (...events: [string, unknown][]) =>
  new Response(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });

async function collect(gen: AsyncGenerator<RoastEvent>) {
  const out: RoastEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe("roastStream", () => {
  const fetchMock = vi.fn<(...a: unknown[]) => Promise<Response>>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const result = { score: "2/10", verdict: "v", findings: [] };

  it("yields stage, facts and the final result in order", async () => {
    fetchMock.mockResolvedValue(
      sse(
        ["stage", { stage: "analyzing" }],
        ["facts", { lines: [{ i: 0, line: 3, sev: "CRIT" }] }],
        ["stage", { stage: "roasting" }],
        ["result", result],
      ),
    );
    expect(await collect(roastStream(body))).toEqual([
      { type: "stage", stage: "analyzing" },
      { type: "facts", lines: [{ i: 0, line: 3, sev: "CRIT" }] },
      { type: "stage", stage: "roasting" },
      { type: "result", result },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1); // never reconnects: that would run the LLM again
  });

  it("maps an error event to RoastStreamError with a usable message key", async () => {
    fetchMock.mockResolvedValue(sse(["stage", { stage: "analyzing" }], ["error", { status: 503 }]));
    const err = await collect(roastStream(body)).catch((e) => e);
    expect(err).toBeInstanceOf(RoastStreamError);
    expect(roastErrorKey(err)).toBe("roaster.err.503");
  });

  it("treats a stream that ends without a result as a failure", async () => {
    fetchMock.mockResolvedValue(sse(["stage", { stage: "analyzing" }]));
    await expect(collect(roastStream(body))).rejects.toBeInstanceOf(RoastStreamError);
  });

  it("a rejection before the stream starts is a plain HttpError (429 keeps its message)", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "slow" }), { status: 429, headers: { "content-type": "application/json" } }),
    );
    const err = await collect(roastStream(body)).catch((e) => e);
    expect(roastErrorKey(err)).toBe("roaster.err.429");
  });
});

describe("live roast", () => {
  const facts: RoastEvent = { type: "facts", lines: [{ i: 0, line: 9, sev: "WARN" }, { i: 1, line: 2, sev: "CRIT" }] };
  const fold = (...evs: RoastEvent[]) => evs.reduce(applyLive, emptyLive());

  it("accumulates text per fact and for the verdict, ordered by line", () => {
    const live = fold(
      facts,
      { type: "text", target: 1, delta: "You " },
      { type: "text", target: 1, delta: "clown" },
      { type: "text", target: 0, delta: "meh" },
      { type: "text", target: "verdict", delta: "Bad." },
    );
    expect(liveAsResult(live)).toEqual({
      score: "…",
      verdict: "Bad.",
      findings: [
        { line: 2, sev: "CRIT", text: "You clown" },
        { line: 9, sev: "WARN", text: "meh" },
      ],
    });
  });

  it("a second roasting stage (the model retried) drops the half-written text", () => {
    const live = fold(
      facts,
      { type: "text", target: 0, delta: "old" },
      { type: "stage", stage: "roasting" },
      { type: "text", target: 0, delta: "new" },
    );
    expect(live.texts).toEqual({ 0: "new" });
  });
});
