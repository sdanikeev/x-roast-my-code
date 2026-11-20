# roast.sh

AI code reviewer with zero patience. Users sign in (email/password or GitHub), paste code, pick a toxicity level
(mild / medium / nuclear) and a language (en / ru), and get a roast that is grounded in real problems of their code,
with a correct fix per finding.

Monorepo (npm workspaces): `backend/` NestJS 12 (ESM) · `frontend/` Next.js 16 + React 19 + Tailwind 4 ·
Postgres 17 · Redis 7 · everything runs in Docker Compose. Git repo on branch `main` (no remote yet). After cloning run `make install env hooks`.

## Commands (use the Makefile; `make help` lists everything)

| Command | What it does |
| --- | --- |
| `make env` | create `.env`, `backend/.env`, `frontend/.env.local` from the examples + generate JWT secrets (never overwrites) |
| `make dev` | whole stack in Docker with **hot reload** (`docker-compose.yml` + `docker-compose.dev.yml`) |
| `make dev-logs s=backend` / `make dev-down` | follow logs / stop |
| `make up` / `make down` | production-like stack (built images, no hot reload) |
| `make infra-up` | only Postgres + Redis (run backend/frontend on the host with `npm run dev:backend` / `dev:frontend`) |
| `make check` | lint + typecheck + unit tests (fast gate) |
| `make test-e2e` | backend e2e against real Postgres + Redis (starts infra first) |
| `make ci` | everything CI runs except the docker job |
| `make hooks` | enable the pre-commit secret scan (`git config core.hooksPath .githooks`) |
| `make secrets-check` | scan all tracked files for secrets |
| `make psql` / `make redis-cli` | shells into the containers |

URLs: frontend <http://localhost:3000>, backend <http://localhost:4000> (`/health`). Browsers talk to the backend
**only through the frontend proxy** `/api/*` (see Gotchas). Postgres/Redis/backend ports are bound to `127.0.0.1`.

## Layout

```
backend/src/
  app.setup.ts          shared by main.ts and e2e: JSON-only body parser, Origin check (login CSRF), ValidationPipe, CORS
  auth/                 JWT auth (see below): auth.controller/service, tokens.service, github.service, jwt-auth.guard, password.ts, cookies.ts
  users/                User entity (email, passwordHash select:false, githubId, ...) + service
  roast/                roast.controller/service, roast.prompt.ts (all prompts), llm.client.ts (provider-agnostic), roast.dto.ts
  redis/                global REDIS provider (ioredis)
  health/               GET /health (checks Postgres + Redis)
backend/test/           auth.e2e-spec.ts  (real DB/Redis; the LLM is mocked via overrideProvider(LlmClient))
frontend/src/
  app/                  /, /login, /register, /roaster, /auth/callback (OAuth landing)
  components/ui/        design system primitives (Button/ButtonLink + buttonStyles, Field, Form, Page, PageHeader, Eyebrow,
                        Heading, Loading, TextLink, Panel, SeverityTag, Segmented, Cursor, Logo). Use these + the
                        `@theme` tokens (text-caption, min-h-touch, max-w-page…) instead of ad-hoc class strings.
  components/auth/      AuthProvider (session context), forms, GithubButton, RequireAuth, UserMenu
  components/roaster/   Roaster, CodePane, Findings
  lib/api.ts            @x-requests/core clients + in-memory session + single-flight refresh
  lib/auth.ts, roast.ts auth calls, /roast call + error messages
```

Design system = the "roast.sh" Claude design canvas (terminal look): JetBrains Mono, bg `#0a0b0a`, accent `#7CFF8A`,
crit `#ff6b5e`, warn `#ffd166`; tokens live in `frontend/src/app/globals.css` (`@theme`). Min touch target 44px.

## Auth design (backend/src/auth)

- **Access token**: JWT HS256, 15 min, returned in the JSON body, kept **in memory only** on the frontend.
- **Refresh token**: JWT, 7 days, **httpOnly cookie `roast_rt`** (`Path=/`, `SameSite=Lax`, `Secure` per `COOKIE_SECURE`),
  **single-use** with rotation. Cookie names are prefixed `roast_` on purpose: cookies are shared across all ports of
  `localhost`, other local apps collided with `rt`/`oauth_state`.
- Separate secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, >= 32 chars, startup fails otherwise); `typ` claim stops
  token confusion; HS256 pinned on verify.
- **Redis keys**: `rt:{jti}` valid refresh token (allowlist) · `rtu:{jti}` consumed in the last 10 s (grace window) ·
  `bl:{jti}` blacklisted access token (TTL = remaining life) · `revfam:{fid}` revoked session/family ·
  `ub:{userId}` "revoked before" cutoff for logout-everywhere · `lf:{email}:{ip}` login attempts · `rl:roast:{userId}`.
- **Rotation**: one Lua script (`CONSUME_LUA` in tokens.service.ts) does GETDEL + sets `rtu`. Result 1 = ok,
  2 = already rotated within 10 s (honest race: two tabs / lost response) -> **409, nothing revoked**, client retries;
  0 = replay after the window -> **family revoked** + 401. The controller clears the cookie only on 401 (never on 409/5xx).
- Guard (`JwtAuthGuard`) checks signature, `bl:`, `revfam:`, `ub:` in one MGET. JWT `iat` has 1 s resolution and
  revocation uses `iat <= cutoff`, hence the 1.1 s wait in `loginWithGithub` after linking (and sleeps in e2e).
- **Login throttle**: attempt reserved atomically (`INCR` + `EXPIRE NX` in MULTI) *before* the scrypt check; 5 per
  15 min per email+ip -> 429. `req.ip` ignores X-Forwarded-For unless `TRUST_PROXY` is set (the Next rewrite passes a
  client-supplied header through; only enable behind a proxy that overwrites it).
- Passwords: scrypt (N=2^15) + timing-equalised dummy check for unknown users. Registration race -> 409 via PG `23505`.
- **GitHub OAuth2** (authorization code): `GET /auth/github` sets `roast_oauth_state` cookie and redirects;
  callback verifies state (constant time), exchanges the code, uses only a **verified** email, issues the session cookie and
  redirects to `/auth/callback` (no token in URLs); the page then calls `POST /auth/refresh`. Linking to an existing
  password account **wipes the password and revokes all sessions** (blocks pre-registration hijack); an email already linked
  to a *different* GitHub id -> 409 `github_conflict`. Callback URL must equal `GITHUB_CALLBACK_URL`
  (`http://localhost:3000/api/auth/github/callback`).
- CSRF/login-CSRF: only `application/json` bodies are parsed; POST `/auth/*` with a foreign `Origin` or
  `Sec-Fetch-Site: cross-site` -> 403 (`app.setup.ts`).

## /roast pipeline (backend/src/roast)

`POST /roast {code (<=12000 chars), filename?, toxicity, language?}` (JWT required) ->
`{score: "N/10", verdict, findings: [{line, sev: CRIT|WARN, text}]}`. `text` contains the roast and `\nfix: ...`.

Two LLM passes, because one pass cannot be both a good detective and a good comedian:

1. **Analyst** (temp 0.1, no jokes, English). The schema forces reasoning **before** findings: `intent` (what the code
   is supposed to do), `trace` (hand-run on a concrete input), `returns` (does every path return?), then `findings`
   with a mandatory `quote`. Checklist puts "logic vs intent" first (this fixed misses like a wrong algorithm).
   **Server-side grounding (`ground()`)**: a finding whose quote is not on any line of the code is dropped
   (hallucination); wrong line numbers are corrected; retried once if everything was ungrounded.
2. **Roaster** (temp 0.4 / 0.7 for nuclear). Receives only the verified facts (never the raw code), gives them a voice in the
   requested tone and language (en/ru). Retried once if some facts were not voiced; on failure falls back to the plain
   verified facts. `compose()` always takes line/severity/fix from the verified facts, never from this pass.

Tone: mild = dry, no profanity · medium = sarcastic, light swearing, may tease "you" · nuclear = heavy profanity (EN/RU
mat) and direct insults at the author, each anchored to a concrete fact. **Hard limits** (prompt AND code): insult skill /
habits / choices only; no slurs or identity attacks, threats, self-harm encouragement. `FORBIDDEN` regex in
roast.service.ts replaces offending text with the neutral fact. Code is treated as DATA (prompt-injection resistant:
verified in tests and live).

Safety/ops: per-user 10 roasts/min (`ROAST_RATE_PER_MINUTE`), max parallel LLM requests (`ROAST_MAX_CONCURRENT`).

### LLM providers (llm.client.ts) — any OpenAI-compatible API

Set a key and it is auto-detected (`GROQ_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY`), or `LLM_PROVIDER=groq|openai|openrouter|ollama|custom`.
Overrides: `LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_JSON_MODE` (`json_schema`|`json_object`), `LLM_REASONING_EFFORT`,
`LLM_ANALYST_EFFORT`, `LLM_ROASTER_MODEL` (separate model for pass 2), `LLM_TIMEOUT_MS`. `ollama` uses `OLLAMA_URL`
(from Docker: `http://host.docker.internal:11434`). The client degrades `json_schema` -> `json_object` on 400, waits
`Retry-After` (<= 20 s) on 429, salvages JSON from Groq `json_validate_failed`, tolerates `<think>` blocks.

**Current local config** (`backend/.env`, not committed): Groq, `LLM_MODEL=qwen/qwen3.8-27b` (analyst: much better at logic
bugs) + `LLM_ROASTER_MODEL=openai/gpt-oss-120b` (roaster; separate rate bucket). Free Groq limits: gpt-oss 8000 TPM,
qwen only ~1000 output tokens/min => roughly 1 roast/minute, otherwise 429 "rate limited". Remove both lines to use
gpt-oss for both passes (faster, less accurate). `LLM_ANALYST_EFFORT=high` found more bugs but produced empty
generations (502) on gpt-oss; left off.

## Testing & CI

- backend: vitest (jest-compatible API; Nest 12 default). `npm run test -w backend` (unit), `test:e2e` (needs Postgres+Redis; the LLM is
  mocked), `lint` = ESLint (typescript-eslint, no-floating-promises), `typecheck`.
- frontend: vitest + Testing Library + jsdom. `lint` = eslint-config-next. `typecheck` runs `next typegen` first.
- `.github/workflows/ci.yml`: lint+typecheck · unit with coverage · e2e with Postgres/Redis services · build ·
  docker job (needs the others): `make env`, `docker compose up --build --wait`, smoke test through the frontend proxy
  (register + refresh). Dependabot for npm/docker/actions.
- Security-critical paths have dedicated tests (rotation grace/reuse, revocation, throttle, OAuth linking, CSRF, grounding,
  safety filter). An Opus review was run over the whole project; its findings were fixed (see git history/this file).

## Git workflow (gitflow)

- Branches: `main` is always releasable; work happens in short-lived `feat/…`, `fix/…`, `chore/…`, `refactor/…` branches
  and lands via PR. No direct pushes to `main`.
- **Commit format**: `<type>: <what we did>` — one line, imperative, lower-case, no trailing period.
  Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `perf`, `build`, `ci`.
  Example: `refactor: extract shared Page/Form/ButtonLink ui components`.
- **No commit body**: the description stays empty. Everything goes in the subject line (keep it ≲ 72 chars);
  the only allowed extra lines are the attribution trailers added by tooling.
- One logical change per commit; don't mix refactors with features/fixes.
- **Before every push** run the same gates CI runs and push only if all are green:
  `make ci` (secrets-check + lint + typecheck + unit tests + e2e + app builds). If infra for e2e isn't up,
  at minimum `make check` (lint, types, tests) must pass. If anything fails: fix it, don't push, never use `--no-verify`.

## Secrets policy (never commit them)

- Real env files (`.env`, `backend/.env`, `frontend/.env.local`) are git-ignored; only `*.example` templates are tracked
  (note `frontend/.gitignore` has `!.env.example` so its template is not swallowed by `.env*`).
- `scripts/check-secrets.sh` runs as the **pre-commit hook** (`.githooks/`, enable with `make hooks`), in `make check`, and as the
  first CI job (`--all`). It blocks: secret-bearing file names (`.env*`, `*.pem`, `*.key`...), known token formats (Groq `gsk_`,
  GitHub `ghp_`/`github_pat_`, `sk-`, AWS, Slack, private keys, JWTs), dotenv-style `NAME_SECRET=value` lines, and any
  **literal value copied from your local env files**. It never prints the secret, only `file:line` + the rule. A deliberate
  false positive can carry the marker `secrets-ok`. Do not bypass with `--no-verify`.
- If a secret ever lands in git: rotate it first (Groq/GitHub dashboards, regenerate JWT secrets), then rewrite history.

## Docker

- Multi-stage `backend/Dockerfile` and `frontend/Dockerfile` (build context = repo root because of the shared lockfile;
  targets `dev`, `build`, `prod`). Prod images run as non-root `node`, Next uses `output: "standalone"`.
- `docker-compose.dev.yml` bind-mounts sources; `node_modules`/`.next` are anonymous volumes (`make dev` passes
  `--renew-anon-volumes`; use `make dev-build` after dependency changes). `WATCHPACK_POLLING=true` for hot reload on macOS.
- Compose reads secrets from `backend/.env` (`env_file`) and overrides DB/Redis hosts with service names. `DB_SYNCHRONIZE`
  defaults to true (no migrations yet).

## Gotchas (learned the hard way)

- **`@x-requests/core` needs an absolute `baseUrl`** (`new URL()`): a bare `/api` fails with "Invalid URL". `lib/api.ts` builds
  it from `window.location.origin`. It also pulls `node-fetch` (-> `node:net`) into the client bundle: aliased to
  `src/lib/empty.ts` in `next.config.ts` (`turbopack.resolveAlias`). Its `HttpError` ctor is `(status, body, data?, headers?)`.
- Next `rewrites()` (the `/api` proxy) is evaluated **at build time**: `BACKEND_URL` is a build arg in the frontend image.
  The proxy times out at 30 s by default: `experimental.proxyTimeout` is raised.
- `next.config.ts` was once overwritten by mistake; it carries `cacheComponents`, `partialPrefetching` and the Tailwind
  turbopack loader rule: never replace the file, edit it.
- Backend is **ESM**: relative imports need the `.js` extension; Nest DI needs runtime (non-`type`) imports of classes.
- vitest: a function returned from `beforeEach` runs as a cleanup hook (use braces). A `Response` body can be read once
  (use `mockImplementation(async () => new Response(...))`). Never put backticks inside the prompt template strings.
- `npm` here is v12: `-ws` is invalid, use `--workspaces`. Install scripts are blocked (fsevents warning is harmless).
- React StrictMode double-runs effects: refresh is single-flight (`inflight`) because refresh tokens are single-use; a login
  that finishes while the initial refresh is in flight wins (`session.gen`).
- **SSE facts (`@x-requests/core` 0.5.0, read from its README and `dist/XRequest.js`)**: `.stream()` JSON-parses `data`
  unless `.stream({ json: false })`. `.timeout(ms)` covers only the wait for the connection, not the whole stream. After a
  failure it reconnects with `Last-Event-ID` and the server's `retry:` hint, under the same rule as POST: a POST reconnects
  only with `.idempotent()`. So the roast stream has no `.retries()` (a reconnect would re-run the LLM). A stream the server
  closes normally just ends. A fetcher without `stream()` throws `ValidationError`.
- **LLM streams can fail inside a 200**: OpenAI-style `data: {"error": ...}` arrives after the status line. `llm.client.ts`
  maps that to a 502. Text deltas are `choices[0].delta.content`; the stream ends with `data: [DONE]`.
- **Roaster output order matters for the UI**: the roaster schema lists `items` before `verdict`, and `ground()` sorts
  facts by line, so the answer streams top to bottom. The `FORBIDDEN` regex also guards the streamed text
  (`stream-text.ts` holds back 24 chars of an unfinished string).
- **Buffering**: the `/api` Next rewrite may buffer SSE. The backend sends `Cache-Control: no-transform` and
  `X-Accel-Buffering: no`. Check the live stream in a browser; a unit test cannot show buffering.
- Other projects' containers on this machine held 5432/6379/3000 (`postgres_18`, `redis_8`, `api_gateway`); they were
  stopped (`docker start ...` brings them back, but then ports conflict with this stack).

## Known limitations / TODO

- No DB migrations (TypeORM `synchronize`). Registration is not rate limited and returns 409 for existing emails.
- Redis has no password (bound to localhost). Cookie has no `__Host-` prefix; `COOKIE_SECURE` defaults to false in compose
  (set true behind HTTPS).
- Analyst reliability depends on the model (a 7B local model hallucinated and missed logic bugs; qwen3.8-27b catches the
  Fibonacci bugs ~2-3 of 4 runs). Russian `fix` text sometimes stays English.
- The `/roast` result is not persisted (no history yet).
- Never print or commit `backend/.env` (JWT secrets, `GROQ_API_KEY`, GitHub client secret).
