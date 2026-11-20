import xclient, { authMiddleware, isHttpError } from "@x-requests/core";

// @x-requests/core needs an absolute URL (it calls `new URL(...)`), so a bare "/api" would fail with
// "Invalid URL". Requests only ever happen in the browser; "/api" is proxied to NestJS by next.config.ts.
const baseUrl = `${typeof window === "undefined" ? "http://localhost:3000" : window.location.origin}/api`;

/** Access token lives in memory only (XSS can't read it from storage); the refresh token is an httpOnly cookie. */
export const session = {
  token: undefined as string | undefined,
  /** Bumped on every explicit login/register, so a slower, older refresh can't overwrite or erase the new session. */
  gen: 0,
  /** Why the last refresh failed (shown on the OAuth callback page). */
  lastRefreshError: undefined as string | undefined,
};

/** No auth middleware: used for login / register / refresh, where a 401 must not trigger a refresh. */
export const publicApi = xclient({ config: { baseUrl } });

export type SessionUser = { id: string; email: string; name: string | null; avatarUrl: string | null };
type AuthResponse = { accessToken: string; expiresIn: number; user: SessionUser };

let inflight: Promise<SessionUser | undefined> | undefined;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const describe = (e: unknown) =>
  e instanceof Error ? `${e.name}: ${e.message}${e.cause instanceof Error ? ` (${e.cause.message})` : ""}` : String(e);

async function doRefresh(attempt = 0): Promise<SessionUser | undefined> {
  const gen = session.gen;
  const res = await publicApi.post("/auth/refresh").result();
  session.lastRefreshError = [
    `url=${baseUrl}/auth/refresh`,
    `ok=${res.ok}`,
    `gen=${gen}->${session.gen}`,
    res.ok ? `data=${JSON.stringify(res.data)?.slice(0, 160)}` : `error=${describe(res.error)}`,
  ].join("\n");

  if (res.ok) {
    if (session.gen !== gen) return undefined; // a login happened meanwhile: it wins
    const data = res.data as AuthResponse;
    session.token = data.accessToken;
    return data.user;
  }
  // 409: another tab rotated the (single-use) refresh cookie a moment ago. The browser already holds the
  // new cookie, so just try again; this is not a logout.
  if (isHttpError(res.error, 409) && attempt < 3) {
    await sleep(100 * (attempt + 1));
    return doRefresh(attempt + 1);
  }
  // Only a definite 401 means "no session". Network errors / 5xx keep the current in-memory token.
  if (isHttpError(res.error, 401) && session.gen === gen) session.token = undefined;
  return undefined;
}

/**
 * Trades the refresh cookie for a new access token. Concurrent calls in this tab share one request
 * (refresh tokens are single-use); other tabs are handled by the 409 retry above.
 */
export function refreshSession(): Promise<SessionUser | undefined> {
  inflight ??= doRefresh().finally(() => {
    inflight = undefined;
  });
  return inflight;
}

/** Authenticated client: sends the bearer token and silently refreshes it once on a 401. */
export const api = xclient({
  config: {
    baseUrl,
    middleware: [
      authMiddleware({
        getToken: () => session.token,
        refresh: async () => {
          const user = await refreshSession();
          if (!user || !session.token) throw new Error("session expired");
          return session.token;
        },
      }),
    ],
  },
});

export const getHealth = () => api.get("/health").timeout(5000).retries(2).result();
