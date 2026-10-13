# base-mechanics
A repository for a template for base mechanics for commitee development.

## Structure

- `backend/` — FastAPI app (SQLAlchemy + Alembic). No business endpoints yet —
  just a `/api/health` check and the folders (`api/`, `models/`, `services/`,
  `utilities/`) to build into.
- `frontend/` — Next.js (App Router) + Tailwind v4 + React Query, themed from
  the project's Figma design tokens. The full shadcn/ui component library is
  vendored in `components/ui/`; see them all at `/components`. The
  `hooks/`, `services/`, `stores/`, `types/`, `utils/` folders are ready to
  build into.
- `docker-compose.yml` — wires up Postgres, the backend API, and the frontend
  dev server.

## Running locally

```bash
cp .env.example .env   # already done if you cloned this template as-is
docker compose up
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000 (docs at `/docs`, health at `/api/health`)

See [`docs/environment-setup.md`](docs/deployment.md) for what each
`.env` variable does, how requests are routed, and common setup mistakes.

## Deploying

Production runs on Vercel (frontend, `https://fall-of-the-qing.ssicsim.ca`), a free Render
service (backend) and the admin portal's Supabase (schema `fall_of_the_qing`). See
[docs/deployment.md](docs/deployment.md) for setup and
[docs/conference-keepalive.md](docs/conference-keepalive.md) for the conference weekend.
