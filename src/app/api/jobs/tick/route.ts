// POST /api/jobs/tick — Minute job: expire holds, auto-release no-shows, complete finished bookings, refill waitlist.
// Called by Supabase pg_cron every minute via pg_net (header x-cron-secret), by the time machine after a clock jump,
// and by an admin's "Run jobs now" in the demo controls (session auth — the browser never holds the secret).
// The work lives in src/lib/jobs/tick.ts.
// Owner: Aditi · Task D8
import { requireRole } from "@/lib/auth/session";
import { runTick } from "@/lib/jobs/tick";

async function isAdmin(): Promise<boolean> {
  try {
    await requireRole("admin");
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  // Cron must present CRON_SECRET. With no secret configured it is open in dev for convenience, but fails closed in
  // production. A signed-in admin is always allowed.
  const expected = process.env.CRON_SECRET;
  const cronOk = expected
    ? req.headers.get("x-cron-secret") === expected
    : process.env.NODE_ENV !== "production";
  if (!cronOk && !(await isAdmin())) return new Response("Forbidden", { status: 403 });

  return Response.json({ ok: true, ...(await runTick()) });
}
