// POST /api/requests/[id]/approve — Approver approves a pending hold.
// Owner: Aditi · Task D6
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import { transition } from "@/lib/requests/transition";
import { notify } from "@/lib/notify";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let actor;
  try {
    actor = await requireRole("approver", "admin");
  } catch (e) {
    return e as Response;
  }

  const { id } = await params;
  const supabase = db();
  const { data: req, error } = await supabase
    .from("requests")
    .select("id, requester_id, status, title, room_id")
    .eq("id", id)
    .single();

  if (error || !req) return apiError(404, "NOT_FOUND", "Request not found.");
  const r = req as Record<string, unknown>;

  // Approvers can only approve requests for their rooms
  if (actor.role === "approver" && r.room_id) {
    const { data: room } = await supabase
      .from("rooms")
      .select("approver_id")
      .eq("id", r.room_id as string)
      .single();
    if ((room as Record<string, unknown> | null)?.approver_id !== actor.id)
      return apiError(403, "FORBIDDEN", "Not your room.");
  }

  try {
    await transition(id, "approved", { actorId: actor.id, action: "approve" });
  } catch (e) {
    return apiError(409, "TRANSITION_ERROR", (e as Error).message);
  }

  await notify(r.requester_id as string, {
    kind: "approved",
    title: `"${r.title}" approved`,
    body: "Your booking has been approved. Check in at the room when you arrive.",
    requestId: id,
  }).catch(() => {});

  return Response.json({ ok: true });
}
