# Allotiq — Deploy runbook

Production = Vercel (the Next.js app) + the **allotiq-demo** Supabase project. Supabase steps are Aditi's,
Vercel steps are Nikhil's. Work top to bottom; each step says how to check it.

Verified locally on the production build (`npm run build && npm start` with `DEMO_MODE=1`, against the dev
project): build passes, `/api/health` is ok, tick rejects calls without the secret, signed-out pages
redirect to `/login`, role cards sign in. The judge `/join` link and the wrong-role redirects were checked
on the dev server.

## 1. Supabase: the demo project (Aditi)

1. Link and migrate:
   ```bash
   supabase link --project-ref <allotiq-demo ref>
   supabase db push
   ```
   Check: Dashboard → Database → Functions lists `apply_plan`, `apply_disruption` and the `analytics_*` functions.
2. Extensions: `pg_cron` and `pg_net` must be enabled (Dashboard → Database → Extensions) — the first migration
   tries, but some projects need the toggle.
3. Seed (creates the demo accounts, the catalog, 4 weeks of history, the scenarios and the judge token). Run it
   against the **demo** project, not dev:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=<demo url> SUPABASE_SERVICE_ROLE_KEY=<demo service key> npm run seed
   ```
   Variables already set in the shell win over `.env.local`. Check: the output ends with the anchor time, and
   `lab_scenarios` has `clash-8` and `dbms`.
4. Auth → URL Configuration:
   - **Site URL:** the production URL, e.g. `https://allotiq.vercel.app`
   - **Redirect URLs:** `https://allotiq.vercel.app/**` (plus any custom domain). Without this, role cards and
     the judge QR fail with a redirect error on the live site.
5. Cron (`20260929173806_cron_tick.sql` already scheduled the job; it needs the app's URL and secret):
   ```sql
   alter database postgres set app.api_url = 'https://allotiq.vercel.app';
   alter database postgres set app.cron_secret = '<same value as CRON_SECRET in Vercel>';
   ```
   Check after a minute: `select status, return_message from cron.job_run_details order by start_time desc limit 5;`
   shows `succeeded`, and `select status_code from net._http_response order by created desc limit 5;` shows `200`.
   If Supabase refuses `alter database … set`, store both in Vault and change the job to read
   `vault.decrypted_secrets` instead.
6. Note the project's region (Settings → General). Vercel functions should run in the same region (step 2.3).

## 2. Vercel (Nikhil)

1. Import `Nikhil210206/Allotiq` from GitHub. Framework: Next.js (auto). Build command and output: defaults.
2. Environment variables (Production; add to Preview too if previews should work):

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | demo project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | demo anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | demo service-role key (server only) |
   | `NEXT_PUBLIC_APP_URL` | `https://allotiq.vercel.app` |
   | `DEMO_MODE` | `1` — without it `/api/demo/login` returns 403 and the role cards don't work |
   | `CRON_SECRET` | a long random string; same value as `app.cron_secret` in step 1.5 |
   | `GROQ_API_KEY` | Groq key (optional — parsing, explanations and Ask fall back without it; voice needs it) |
   | `GROQ_DISABLED` | `false` (set `true` to rehearse the offline fallbacks) |
   | `GROQ_MODEL_PARSE` / `GROQ_MODEL_REASON` / `GROQ_MODEL_STT` | as in `.env.example` |
   | `SEED_ANCHOR` | optional; only affects Reset demo |

   `NEXT_PUBLIC_*` values are baked in at build time — redeploy after changing them.
3. Settings → Functions → Region: the one closest to the Supabase region (e.g. Mumbai `bom1` for `ap-south-1`).
4. Deploy. `main` is production from then on.

## 3. Smoke test on the live URL

- [ ] `GET /api/health` → `"status":"ok"`, database ok, `commit` = the deployed SHA, groq ok (or disabled on purpose)
- [ ] `/` loads signed out; `/admin/dashboard` signed out → `/login?next=…`
- [ ] Each role card signs in and lands on its home (faculty/club/student → `/r/new`, approver → `/approvals`, admin → `/admin/dashboard`)
- [ ] `/admin/demo` → scan the judge QR with a phone → lands on `/approvals` as the judge
- [ ] A door QR (`/admin/resources/<room>` → print QR) scanned signed out → sign in → back on that room's check-in page
- [ ] Tick: `curl -X POST -H "x-cron-secret: $CRON_SECRET" https://allotiq.vercel.app/api/jobs/tick` → 200; without the header → 403
- [ ] Reset demo (from `/admin/demo`) → the clock jumps to the anchor; the Lab shows `clash-8`
- [ ] Walk the five demo scenes once from start to finish

## Before going on stage

- Supabase free projects pause after a week without traffic — open the dashboard and hit `/api/health` the day before and an hour before.
- Reset demo, then open every page once to warm the functions.
- Phone on the hotspot you'll use; scan the judge QR once.
