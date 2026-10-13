# Conference keep-alive (cron-job.org)

This one runbook covers all six mechanics. It's the same in every mechanics repo.

Render's free services sleep after 15 minutes with no traffic, and waking up
takes about a minute. During the conference we ping each backend every 10
minutes so none of them falls asleep mid-crisis.

> **Only run this during the conference.** All free services in the Render
> workspace share 750 free hours a month. If those run out, *every* service is
> suspended until the 1st.

## Budget

6 services × 24 h × 3 days = **432 h** out of 750. A 4-day window is still fine
at 576 h. Check usage in **Render → Workspace → Billing → Free usage**.

## Before you start

- Every backend is deployed, and `/healthz` returns `{"ok":true}` for each.
- You know the conference dates. Below, **START** means one hour before opening
  ceremonies, and **END** means one hour after closing.

| Mechanic | URL to ping |
|---|---|
| FIC Ad Hoc | `https://fic-ad-hoc-api.onrender.com/healthz` |
| Digital Gold Rush | `https://digital-gold-rush-api.onrender.com/healthz` |
| Rising Idols | `https://rising-idols-api.onrender.com/healthz` |
| Fall of the Qing | `https://fall-of-the-qing-api.onrender.com/healthz` |
| LOTR | `https://lotr-api.onrender.com/healthz` |
| Marshall, Carter & Dark | `https://marshall-carter-dark-api.onrender.com/healthz` |

If Render gave a service a different `.onrender.com` name, copy it from the top
of that service's page in Render. Ping `/healthz`, not `/api/health`, because
`/api/health` needs the admin token and returns 401.

## Setup (about 10 minutes, the week before)

1. Sign up at <https://cron-job.org> with the tech@ssicsim.ca account. It's
   free.
2. Go to **Settings → Time zone** and choose `America/Toronto`.
3. Go to **Cronjobs → Create cronjob** and create one job for each row in the
   table:
   - **Title:** `keepalive <mechanic>`
   - **URL:** the `/healthz` URL
   - **Execution schedule:** Custom, every **10** minutes (`*/10 * * * *`).
     Pinging every 10 minutes rather than 14 leaves room for a missed ping.
   - **Advanced → Schedule expiry:** set it to END so the job turns itself
     off. If your account doesn't show this option, add a calendar reminder for
     END to disable the jobs.
   - **Advanced → Request timeout:** 30 s. The first ping may hit a waking
     service.
   - **Notifications:** turn on *on failure* and *when back up*, sent to
     tech@ssicsim.ca.
   - **Enable job:** **OFF** for now. Save.
4. For the other five, use **Clone** on the first job, then change the title and
   URL.

## Conference morning (START)

1. Enable all six jobs.
2. Click **Test run** on each and confirm you get `200` with `{"ok":true}`. The
   first run can take about 60 s while the service wakes.
3. Open each `https://<mechanic>.ssicsim.ca`, log in, and confirm the data loads
   quickly.

## During the conference

- **Failure email:** go to **Render → that service → Events / Logs**.
  - *Suspended* means the free hours ran out. See the troubleshooting table
    below.
  - *Deploy failed* means roll back to the previous deploy.
- The pings don't use Supabase connections, because `/healthz` doesn't touch
  the database.

## After closing (END)

- Confirm the jobs expired, or **disable all six** by hand. Don't delete them,
  so they can be reused next year.
- Check Render free usage to confirm the budget held.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Ping returns 401 | You're pinging `/api/health`. Switch to `/healthz`. |
| Ping times out on its first run | A normal cold start. The next ping should succeed. |
| Every service shows *Suspended* | Free hours are used up. Upgrade the busiest service to **Starter** for the rest of the event. Render bills by the second, so a weekend costs about $1–2 per service. |
| One crisis is slow under load | Upgrade only that service to Starter for the weekend, then downgrade. |
