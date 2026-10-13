# Deploying Fall of the Qing to production

| Piece | Where | Cost |
|---|---|---|
| Frontend (Next.js) | Vercel → `https://fall-of-the-qing.ssicsim.ca` | Free (Hobby) |
| Backend (FastAPI) | Render free web service `fall-of-the-qing-api` | Free |
| Database | The admin portal's Supabase project, Postgres schema `fall_of_the_qing` | Already paid for / free |

```
browser → https://fall-of-the-qing.ssicsim.ca (Vercel, password login)
        → /api/backend/... proxy (server-side, adds x-admin-token)
        → https://fall-of-the-qing-api.onrender.com (Render free)
        → Supabase Postgres, schema "fall_of_the_qing"
```

The browser never calls Render directly, so the backend doesn't need a custom
domain.

Each mechanic has its own Postgres **schema** inside the admin portal's Supabase
project. The admin portal's tables live in `public`, and every mechanic has
tables with the same names (`characters`, `crisis_notes`, …). Setting
`DB_SCHEMA` pins every connection's `search_path` to this mechanic's schema, so
tables, enums and `alembic_version` all live there and never touch `public` or
another mechanic. Locally `DB_SCHEMA` is blank, so docker-compose behaves exactly
as before.

---

## One-time setup

Do these steps in order. You need access to the SSICSIM Supabase, Render,
Vercel, GitHub and GoDaddy accounts.

### 1. Generate secrets

```bash
openssl rand -hex 32      # ADMIN_API_TOKEN, used on both Render and Vercel
openssl rand -base64 32   # NEXTAUTH_SECRET, used on Vercel only
```

Use a **different** `ADMIN_API_TOKEN` and `NEXTAUTH_SECRET` for each mechanic.

### 2. Supabase: get the connection string

1. Open the admin portal's Supabase project and click **Connect** (top bar).
2. Copy the **Session pooler** string (port **5432**).
   - Don't use *Direct connection*. It's IPv6-only, and Render's free plan
     can't reach it.
   - Don't use *Transaction pooler* (port 6543). It doesn't keep per-connection
     settings, and the app pins each connection to its schema with
     `SET search_path`.
3. Add `+psycopg2` to the scheme and `?sslmode=require` to the end:

   ```
   postgresql+psycopg2://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
   ```

You don't need to create the schema. The first migration run creates
`fall_of_the_qing` automatically.

### 3. Render: create the backend service

1. Go to **New → Blueprint**, pick this repo, and click **Apply**. `render.yaml`
   creates `fall-of-the-qing-api` on the free plan.
   - If the Supabase project isn't in a US-East region, edit `region:` in
     `render.yaml` before applying. The region can't be changed later.
2. When prompted, fill in:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the session pooler string from step 2 |
   | `ADMIN_API_TOKEN` | the hex token from step 1 |

   `ENVIRONMENT=production` and `DB_SCHEMA=fall_of_the_qing` come from `render.yaml`.
3. The first build may fail its health check or fail on a missing table. That's
   expected, because migrations haven't run yet.
4. Go to **Service → Settings → Deploy Hook** and copy the URL.
5. Copy the service URL from the top of the page, e.g.
   `https://fall-of-the-qing-api.onrender.com`. Render adds a suffix if the name is
   already taken.

### 4. GitHub: secrets for the deploy workflow

In **Repo → Settings → Secrets and variables → Actions → New repository
secret**, add:

| Secret | Value |
|---|---|
| `PRODUCTION_DATABASE_URL` | the same session pooler string |
| `RENDER_DEPLOY_HOOK` | the deploy hook URL from step 3 |

Then go to **Actions → Deploy backend → Run workflow** on `main`. It runs the
tests, creates the `fall_of_the_qing` schema, applies all migrations and redeploys
Render. Check that `https://<render-url>/healthz` returns `{"ok":true}`.

### 5. Vercel: create the frontend project

1. Go to **Add New → Project** and import this repo.
2. Set **Root Directory** to `frontend`. The framework preset is Next.js.
3. Add these environment variables (Production):

   | Key | Value |
   |---|---|
   | `INTERNAL_API_BASE_URL` | the Render URL, **without** `/api` (e.g. `https://fall-of-the-qing-api.onrender.com`) |
   | `ADMIN_API_TOKEN` | **same** value as on Render |
   | `SITE_PASSWORD` | the staff password for this committee |
   | `NEXTAUTH_SECRET` | the base64 secret from step 1 |
   | `NEXTAUTH_URL` | `https://fall-of-the-qing.ssicsim.ca` |

   Never prefix `ADMIN_API_TOKEN` with `NEXT_PUBLIC_`.
4. Click **Deploy**.

### 6. GoDaddy: the subdomain

1. In Vercel, go to **Project → Settings → Domains → Add** and enter
   `fall-of-the-qing.ssicsim.ca`. Vercel shows the record it expects.
2. In GoDaddy, go to **My Products → ssicsim.ca → DNS → Add New Record**:

   | Type | Name | Value | TTL |
   |---|---|---|---|
   | CNAME | `fall-of-the-qing` | value shown by Vercel (usually `cname.vercel-dns.com`) | 600 |

3. Back in Vercel, click **Verify**. Propagation takes 5–30 minutes, and SSL is
   automatic. Don't touch the existing `admin` record or any other records.

### 7. Smoke test

1. Open `https://fall-of-the-qing.ssicsim.ca`, log in with `SITE_PASSWORD`, then create
   and read back a character.
2. In Supabase, go to **Table Editor**, switch the schema dropdown to
   `fall_of_the_qing`, and confirm the row is there. `public` should be untouched.

---

## Everyday updates

- **Frontend:** merge to `main`. Vercel deploys it automatically.
- **Backend:** merge to `main`. The **Deploy backend** workflow tests, migrates,
  then redeploys Render. If the tests or the migration fail, nothing is
  deployed. Check the run under the **Actions** tab.
- **Rollback:**
  - Render: go to **Service → Events**, pick an earlier deploy, and click
    **Rollback**. The free plan keeps the last 2 deploys.
  - Vercel: go to **Deployments → ⋯ → Promote**.
  - A database rollback is manual. Run `alembic downgrade -1` from `backend/`
    with `DATABASE_URL` and `DB_SCHEMA=fall_of_the_qing` set.

## Free-plan limits to know about

- The service **sleeps after 15 minutes with no traffic**. The next request
  wakes it in about a minute. The page just loads slowly; nothing is lost.
  Nothing is rebuilt, because the existing image restarts.
- All free services in the Render workspace share **750 instance-hours per
  month**. If they run out, *every* free service is suspended until the 1st.
  Sleeping services don't use hours. Never leave a keep-alive pinger running
  outside the conference.
- Each free service gets about 0.1 CPU and 512 MB of RAM. If this crisis is
  slow during the conference, upgrade **only this service** to Starter for
  the weekend, then downgrade. Render bills by the second, so that costs about
  $1–2.
- For the conference weekend, follow
  [conference-keepalive.md](conference-keepalive.md).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Every API call returns `401 Invalid admin token` | `ADMIN_API_TOKEN` differs between Vercel and Render. |
| Login bounces back to `/login` | `NEXTAUTH_SECRET` or `SITE_PASSWORD` is missing on Vercel. |
| `502 Backend is unreachable` | `INTERNAL_API_BASE_URL` is wrong (it should have no trailing `/api`), or the service is suspended. |
| First load takes about 1 minute | The service was asleep. This is normal on the free plan. |
| `relation "…" does not exist` | Migrations haven't run. Re-run the **Deploy backend** workflow. |
| Workflow warns "skipping migrate and deploy" | The GitHub secrets from step 4 are missing. |
| All free services show *Suspended* | Free hours are used up. Upgrade a service, or wait for the 1st. |
