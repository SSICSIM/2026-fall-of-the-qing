# Environment setup

This project reads all of its configuration from a single `.env` file at the
repo root. `docker-compose.yml` injects it into every service (`db`,
`backend`, `frontend`) via `env_file:`, so you never need a separate
`backend/.env` or `frontend/.env.local`.

## Quick start

```bash
cp .env.example .env   # already done if you cloned this template as-is
```

Then fill in the three blank secrets described below (`ADMIN_API_TOKEN`,
`SITE_PASSWORD`, `NEXTAUTH_SECRET`) and run:

```bash
docker compose up
```

- Frontend: http://localhost:3000 (you'll be redirected to `/login`)
- Backend: http://localhost:8000 (interactive docs at `/docs`, health check
  at `/api/health`)

`.env` is gitignored — never commit it. `.env.example` is the tracked
template; keep it in sync whenever you add or rename a variable.

## How a request actually reaches the database

It helps to know the request path before the variable list makes sense:

```
browser → Next.js pages (session-gated by middleware.ts)
        → browser fetch to /api/backend/... (same origin, no CORS)
        → Next.js route handler app/api/backend/[...path]/route.ts
          - requires a valid NextAuth session (401 otherwise)
          - forwards to INTERNAL_API_BASE_URL, attaching ADMIN_API_TOKEN
        → FastAPI backend (require_admin_token dependency)
        → Postgres (DATABASE_URL)
```

The browser never talks to the FastAPI backend directly. This matters
because anything sent straight from the browser — including any
`NEXT_PUBLIC_*` variable — is visible to anyone who opens dev tools,
password screen or not. Session enforcement and the admin token both live
server-side, in the Next.js proxy route.

## Variable reference

### Backend (FastAPI)

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | backend | SQLAlchemy connection string. The `db` host only resolves inside the docker-compose network — use `localhost:5432` if you're running the backend outside Docker against the compose Postgres. |
| `API_CORS_ORIGINS` | backend | Comma-separated list of origins allowed to call the API directly (cross-origin). Not needed for the app itself (browser calls are same-origin through the proxy) — relevant if you hit the API directly from another host during development. |
| `ENVIRONMENT` | backend | `development` (default) exposes `/docs`, `/redoc`, `/openapi.json`. Set to `production` to disable them. |
| `ADMIN_API_TOKEN` | backend + frontend | Shared secret. The frontend's proxy route (`frontend/app/api/backend/[...path]/route.ts`) sends it as the `X-Admin-Token` header on every request it forwards; the backend's `require_admin_token` dependency checks it. **Blank disables the check** — fine for local dev, but set it to a real value before deploying anywhere reachable outside your own network. |
| `DB_SCHEMA` | backend | Postgres schema this mechanic's tables (and `alembic_version`) live in. **Leave blank locally.** Production sets it so all mechanics can share the admin portal's Supabase database without table-name collisions — see [deployment.md](deployment.md). |

### Postgres (docker-compose only)

| Variable | Purpose |
| --- | --- |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Passed straight to the official `postgres` image to initialize the database. Keep these in sync with the credentials embedded in `DATABASE_URL`. |

### Frontend (Next.js)

| Variable | Used by | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | browser | Inlined into the client bundle at build time. The app doesn't call it today (all data calls go through the same-origin proxy); it's kept so you can point a browser tab or a script at the backend directly, e.g. to open `/docs` from your host machine. |
| `INTERNAL_API_BASE_URL` | frontend server (Next.js route handlers) | The backend's address **as seen from inside the frontend container** — `http://backend:8000` on the docker-compose network. This is what the `/api/backend` proxy actually forwards requests to. If you run the frontend outside Docker (`npm run dev` on your host) while the backend stays in Docker, set this to `http://localhost:8000` instead. |

### Auth — password login (NextAuth v5, Credentials provider)

| Variable | Purpose |
| --- | --- |
| `SITE_PASSWORD` | The single shared password crisis staff enters at `/login`. There's no per-user account system — anyone with this password gets a session. |
| `NEXTAUTH_SECRET` | Signs and encrypts the session JWT. Generate one with: `openssl rand -base64 32`. Required — the app throws on boot without it in production, and sessions won't verify if it changes (everyone gets logged out). |
| `NEXTAUTH_URL` | The canonical URL NextAuth uses to build callback/redirect URLs. Set it to wherever the frontend is actually served (`http://localhost:3000` locally; your real domain in any deployed environment). |

## Common mistakes

- **Blank `SITE_PASSWORD` or `NEXTAUTH_SECRET`.** Login will look like it
  succeeds and then bounce you straight back to `/login` (no active session
  was actually created). Fill in both before running `docker compose up`.
- **`ADMIN_API_TOKEN` set on one service but not the other.** The proxy
  route and the backend must agree on the exact same value (or both leave it
  blank). A mismatch surfaces as every API call returning `401 Invalid admin
  token`.
- **Running the frontend outside Docker.** `INTERNAL_API_BASE_URL=http://backend:8000`
  only resolves inside the docker-compose network. If you `npm run dev` the
  frontend on your host against a Dockerized backend, override it to
  `http://localhost:8000` (e.g. in `.env`, or as an exported shell variable)
  before starting the dev server.
- **Editing `.env` and expecting Docker to pick it up without a restart.**
  `docker compose up` only re-reads `.env` when a container restarts; after
  changing a value, run `docker compose up -d --force-recreate` (or just
  `docker compose restart <service>`) rather than expecting a hot reload.
