# Allotiq — Contracts & Team Rules

Read this before writing code. If you use an AI coding assistant, point it at this file first.

## Source of truth
| What | Where | Changed by |
|---|---|---|
| Domain vocabulary, statuses, transitions, priorities | `src/contracts/domain.ts` | PR approved by all 3 |
| Engine input/output | `src/contracts/engine.ts` | PR approved by all 3 |
| API bodies (Zod) + responses | `src/contracts/api.ts` | PR approved by all 3 |
| LLM schemas | `src/contracts/ai.ts` | PR approved by all 3 |
| Database schema, triggers, RLS | `supabase/migrations/*.sql` | Aditi only (`supabase db push`) |
| Analytics functions (`analytics_*`, read-only) | `supabase/analytics/analytics.sql` — idempotent, re-run after any change | Nikhil |

The TypeScript `TRANSITIONS` table and the SQL `is_valid_transition()` must always match.

## Core rules
1. **Browsers never write to the DB.** All writes go through `/api/*` route handlers using the service-role client (`src/lib/db/server.ts`). Check permissions in code with `requireRole()`. RLS is read-only (Realtime + reads).
2. **Every status change goes through `transition()`** (`src/lib/requests/transition.ts`). The DB trigger rejects illegal transitions and writes the audit row.
3. **Business time comes from `getNow()`** (`src/lib/clock.ts`). Never use `Date.now()` / `new Date()` / SQL `now()` in logic — the demo time machine depends on it. Set `created_at` and `last_action_at` from `getNow()`.
4. **Intervals are half-open `[start, end)`**, stored as `timestamptz`, displayed in Asia/Kolkata. 16:00–18:00 and 18:00–20:00 do not clash.
5. **The LLM never decides an allocation.** It only parses, phrases, and chooses which safe analytics function to call. Every LLM output is validated with Zod; the app must fully work with `GROQ_DISABLED=true`.
6. **The engine is pure TypeScript** (`src/engine/**`): no Next.js, Supabase or `fetch` imports. It is deterministic and every decision returns a `ScoreBreakdown`.
7. **Never a bare "rejected".** Any clash or rejection returns alternatives (same room other slot, similar room same slot).
8. **Secrets stay server-side.** Files that touch keys start with `import "server-only"`.
9. **Priority is derived** from `purpose` via `PURPOSE_PRIORITY` — never read from the request body.

## Request lifecycle
```
waitlisted → pending (hold) → approved → checked_in → completed
pending   → rejected | expired | cancelled | bumped
approved  → auto_released (no check-in by start+15) | cancelled | bumped
bumped    → pending | cancelled | expired | waitlisted
waitlisted→ approved (auto-fill when a room frees up) | cancelled | expired
```
- A room change while `approved` is a **rehome** (audited as `rehomed`), not a status change.
- **Bumping policy:** pending holds may be bumped with an alternative offer. Approved bookings move only if rehomed at the same time, or if the start is more than 24h away (then they get an offer). Checked-in bookings are never bumped.

## Ownership
| Area | Owner |
|---|---|
| `src/engine/**`, `src/server/engine-adapter.ts`, `src/lib/ai/**`, recommend/parse/lab/disruption/AI APIs | Aaditya |
| `supabase/migrations`, `src/lib/{db,auth,clock,requests,jobs}`, `src/lib/notify.ts`, `src/proxy.ts`, request/room/approval/check-in/clock/demo/notification/audit APIs, Realtime wiring inside `src/hooks` | Aditi |
| **All UI** — every page and layout in `src/app` (not `src/app/api`), `src/components/**`, `src/hooks/**` (polling today), `src/lib/api` (typed client), `src/lib/mock` (in-browser mock backend), `src/lib/seed` + `scripts/seed`, `src/lib/analytics`, CI, deploy | Nikhil |

**Frontend ↔ backend:** screens only talk to `/api/*` through `src/lib/api/client.ts`. While an endpoint still returns
`501 NOT_IMPLEMENTED`, the client answers from the mock backend (same contracts, same seeded catalog ids), so every
screen works today. Implementing an endpoint switches the UI to real data with no UI change — match the contract types.

Every stub file names its owner and task id (e.g. `Owner: Aditi · D5`). Unbuilt endpoints return `501 NOT_IMPLEMENTED` with the owner.

## Git
- Branches: `aaditya/<feature>`, `aditi/<feature>`, `nikhil/<feature>`. PR into `main`; merge small and often.
- `git pull --rebase origin main` before pushing. Never force-push `main`.
- CI (typecheck, lint, tests) must be green. Vercel builds a preview for every PR; `main` is the live URL.
- After every migration: `npm run db:types` and commit `src/lib/db/types.gen.ts`.
- Mock against `src/contracts` until the real dependency lands — don't wait on each other.
