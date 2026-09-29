# Allotiq

**Every request. The right room. Even when plans change.**

Room finders answer *"what's free?"*. Allotiq answers *"what's the best arrangement for everyone?"* — and keeps it optimal through no-shows, maintenance and priority requests.

Vision2Web 2026 · SRMIST · Industry Innovation 2 — Smart Resource Allocation System.

## Stack
Next.js 16 (App Router, TypeScript) · Tailwind + shadcn/ui · Supabase (Postgres, Auth, Realtime, pg_cron) · Groq (optional AI layer) · Vercel.

## Demo tips
Every screen works before the backend lands: any endpoint that still answers `501` is served by the mock backend in
`src/lib/mock` (state lives in your browser). **Ctrl + .** opens the demo controls anywhere (virtual clock, jump to 14:16,
reset, switch persona); `/admin/demo` has the scene shortcuts and the judges' QR. `/login?as=approver` signs straight in.

## Getting started
```bash
npm install
cp .env.example .env.local   # fill in Supabase + Groq keys
npm run dev                  # http://localhost:3000
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run typecheck` | Generate route types + `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Engine unit tests (Vitest) |
| `npm run seed` | Wipe activity and seed catalog, 4-week history and demo scenarios (`-- --dry-run` to preview) |
| `npm run db:types` | Regenerate Supabase types (after a migration) |

## Project structure
```
docs/CONTRACTS.md            Team rules, lifecycle, ownership — read first
supabase/migrations/         Schema, exclusion constraint, triggers, RLS, apply_plan()
scripts/seed/                Catalog, 4-week history, demo scenarios
src/
  contracts/                 Shared types + Zod schemas (frozen)
  engine/                    Allocation engine — pure TS (feasibility, scoring, solvers, bump/rehome/waitlist)
    solvers/                 fcfs · greedy · bnb (default) · ilp (stretch)
    __tests__/               Brief fixture: FCFS 2/3 vs engine 3/3
  server/engine-adapter.ts   DB rows ↔ engine types, plans → apply_plan()
  lib/
    api/                     Typed API client — the only way screens reach /api (falls back to mock on 501)
    mock/                    In-browser mock backend: sample bookings + canned engine/AI answers
    seed/                    Catalog + history generator (shared by the DB seed and the mock)
    ai/                      Groq: parse, transcribe, explain, ask, insight (+ fallbacks)
    analytics/               analytics_* wrappers (dashboard + "ask" tools)
    auth/ db/ requests/ jobs/  Session, Supabase clients, transition(), minute tick
    clock.ts notify.ts http.ts
  hooks/                     Realtime hooks (notifications, live request)
  components/ui/             shadcn primitives
  components/kit/            Allotiq design kit (tokens, AppShell, KPI, status, score, dither) — live at /kit
  proxy.ts                   Session refresh + auth redirect (Next 16 "proxy")
  app/
    (auth)/login  join/      Sign in, judge QR join
    r/  r/new  r/[id]        Requester: my bookings, new request, status
    availability/            Day grid
    approvals/               Approver queue (mobile-first)
    c/[roomCode]/            QR check-in (mobile-first)
    admin/                   resources · lab · disruptions · dashboard · audit · demo
    api/                     Route handlers (see docs/CONTRACTS.md)
```
