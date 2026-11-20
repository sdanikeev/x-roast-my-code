import { api, publicApi, session, type SessionUser } from "@/lib/api";

type AuthResponse = { accessToken: string; expiresIn: number; user: SessionUser };
type Credentials = { email: string; password: string };

async function authenticate(path: "/auth/login" | "/auth/register", body: Credentials) {
  const res = await publicApi.post(path).body(body).timeout(10000).result();
  if (!res.ok) return { ok: false as const, error: res.error };
  const data = res.data as AuthResponse;
  session.token = data.accessToken;
  session.gen++;
  return { ok: true as const, user: data.user };
}

export const login = (body: Credentials) => authenticate("/auth/login", body);
export const register = (body: Credentials) => authenticate("/auth/register", body);

// The local session is always dropped; the result tells the caller if the server confirmed it.
export async function logout() {
  const res = await api.post("/auth/logout").result();
  session.token = undefined;
  session.gen++;
  return res.ok;
}

export async function logoutEverywhere() {
  const res = await api.post("/auth/logout-all").result();
  session.token = undefined;
  session.gen++;
  return res.ok;
}

export const GITHUB_LOGIN_URL = "/api/auth/github";
