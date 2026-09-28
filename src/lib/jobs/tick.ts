// Minute job, called by pg_cron → /api/jobs/tick and after every clock jump. Owner: Aditi · D8
// 1) expire stale holds  2) auto-release no-shows (then engine waitlist refill)  3) complete finished bookings
import "server-only";

export async function runTick(): Promise<{ expired: number; released: number; refilled: number; completed: number }> {
  throw new Error("Not implemented yet (D8)");
}
