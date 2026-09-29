// POST /api/requests/[id]/approve — Approver approves a pending hold.
// Owner: Aditi · Task D6
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import { canDecide } from "@/lib/requests/access";
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
  const { data: r, error } = await supabase
    .from("requests")
    .select("id, requester_id, status, title, room_id")
    .eq("id", id)
    .single();

  if (error || !r) return apiError(404, "NOT_FOUND", "Request not found.");

  // Approvers can only decide requests for rooms they manage
  if (!(await canDecide(supabase, actor, r.room_id)))
    return apiError(403, "FORBIDDEN", "Not your room.");
  if (r.status !== "pending")
    return apiError(409, "INVALID_TRANSITION", "Only pending requests can be approved here.");

  try {
    await transition(id, "approved", { actorId: actor.id, expectedStatus: "pending", action: "approve", patch: { decided_by: actor.id } });
  } catch (e) {
    return apiError(409, "TRANSITION_ERROR", (e as Error).message);
  }

  await notify(r.requester_id, {
    kind: "approved",
    title: `"${r.title}" approved`,
    body: "Your booking has been approved. Check in at the room when you arrive.",
    requestId: id,
  });

  return Response.json({ ok: true });
}
