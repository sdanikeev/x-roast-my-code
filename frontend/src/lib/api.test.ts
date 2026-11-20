import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshSession, session } from "./api";

const user = { id: "1", email: "a@b.dev", name: null, avatarUrl: null };
const ok = (token: string) =>
  new Response(JSON.stringify({ accessToken: token, expiresIn: 900, user }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
const fail = (status: number) =>
  new Response(JSON.stringify({ message: "x" }), { status, headers: { "content-type": "application/json" } });

describe("refreshSession", () => {
  const fetchMock = vi.fn<(...a: unknown[]) => Promise<Response>>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    session.token = undefined;
    session.gen = 0;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("stores the access token and returns the user", async () => {
    fetchMock.mockResolvedValue(ok("tok-1"));
    await expect(refreshSession()).resolves.toEqual(user);
    expect(session.token).toBe("tok-1");
  });

  it("shares ONE request between concurrent callers (refresh tokens are single-use)", async () => {
    fetchMock.mockResolvedValue(ok("tok-1"));
    await Promise.all([refreshSession(), refreshSession(), refreshSession()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 409 (another tab rotated the cookie) and then succeeds", async () => {
    fetchMock.mockResolvedValueOnce(fail(409)).mockResolvedValueOnce(ok("tok-2"));
    await expect(refreshSession()).resolves.toEqual(user);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(session.token).toBe("tok-2");
  });

  it("a 401 means no session: clears the token", async () => {
    session.token = "stale";
    fetchMock.mockResolvedValue(fail(401));
    await expect(refreshSession()).resolves.toBeUndefined();
    expect(session.token).toBeUndefined();
  });

  it("a 5xx is not a logout: keeps the in-memory token", async () => {
    session.token = "still-good";
    fetchMock.mockResolvedValue(fail(503));
    await expect(refreshSession()).resolves.toBeUndefined();
    expect(session.token).toBe("still-good");
  });

  it("a login that completes while a refresh is in flight is not overwritten or erased", async () => {
    let release!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (release = r)));
    const pending = refreshSession();

    session.token = "fresh-login"; // what auth.ts does after a successful login
    session.gen++;
    release(fail(401)); // the stale refresh now fails
    await pending;

    expect(session.token).toBe("fresh-login");
  });
});
