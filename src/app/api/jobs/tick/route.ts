// POST /api/jobs/tick — Minute job: expire holds, auto-release no-shows, complete finished bookings, refill waitlist.
// Called by Supabase pg_cron every minute via pg_net (header x-cron-secret) and by the time machine after a clock jump.
// The work lives in src/lib/jobs/tick.ts.
// Owner: Aditi · Task D8
import { runTick } from "@/lib/jobs/tick";

export async function POST(req: Request) {
  // Must present CRON_SECRET. With no secret configured it is open in dev for convenience, but fails closed in production.
  const expected = process.env.CRON_SECRET;
  const authorised = expected
    ? req.headers.get("x-cron-secret") === expected
    : process.env.NODE_ENV !== "production";
  if (!authorised) return new Response("Forbidden", { status: 403 });

  return Response.json({ ok: true, ...(await runTick()) });
}
