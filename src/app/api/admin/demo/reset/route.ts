// POST /api/admin/demo/reset — Wipe demo activity, reseed catalog + 4-week history + scenarios, and put the
// virtual clock back on the demo anchor (Wednesday 13:50 IST). Same pipeline as `npm run seed`.
// Owner: Aditi · Task D11
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import { resetDemo } from "@/lib/seed/reset";

export async function POST() {
  try {
    await requireRole("admin");
  } catch (e) {
    return e as Response;
  }

  try {
    const anchor = await resetDemo(db());
    return Response.json({ ok: true, anchor });
  } catch (e) {
    console.error("[demo/reset]", e);
    return apiError(500, "RESET_FAILED", e instanceof Error ? e.message : "Reset failed.");
  }
}
