// POST /api/admin/requests/[id]/simulate-checkin — Demo fallback: admin marks a request as checked in.
// Owner: Aditi · Task D9
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import { getNow } from "@/lib/clock";
import { transition } from "@/lib/requests/transition";
import { notify } from "@/lib/notify";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole("admin");
  } catch (e) {
    return e as Response;
  }

  const { id } = await params;
  const supabase = db();
  const { data: req, error } = await supabase
    .from("requests")
    .select("id, requester_id, title, status, room_id")
    .eq("id", id)
    .single();

  if (error || !req) return apiError(404, "NOT_FOUND", "Request not found.");
  const r = req as Record<string, unknown>;

  const now = await getNow();
  try {
    await transition(id, "checked_in", {
      actorId: null,
      action: "simulate_checkin",
      patch: { checked_in_at: now },
    });
  } catch (e) {
    return apiError(409, "TRANSITION_ERROR", (e as Error).message);
  }

  await notify(r.requester_id as string, {
    kind: "checked_in",
    title: `Checked in (simulated)`,
    body: `"${r.title}" marked as checked in by admin for demo.`,
    requestId: id,
  }).catch(() => {});

  return Response.json({ ok: true });
}
