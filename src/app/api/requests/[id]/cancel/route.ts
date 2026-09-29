// POST /api/requests/[id]/cancel — Requester cancels their own request (admins can cancel any).
// Owner: Aditi · Task D5
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
    actor = await requireRole();
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

  // Only the requester or an admin can cancel — approvers decide, they don't cancel other people's bookings.
  if (actor.role !== "admin" && r.requester_id !== actor.id)
    return apiError(403, "FORBIDDEN", "Not your request.");

  try {
    await transition(id, "cancelled", { actorId: actor.id, expectedStatus: r.status, action: "cancel" });
  } catch (e) {
    return apiError(409, "TRANSITION_ERROR", (e as Error).message);
  }

  // Tell the room's approver when a request still waiting on them is withdrawn.
  if (r.status === "pending" && r.room_id) {
    const { data: room } = await supabase.from("rooms").select("approver_id").eq("id", r.room_id).maybeSingle();
    if (room?.approver_id && room.approver_id !== actor.id) {
      await notify(room.approver_id, {
        kind: "cancelled",
        title: `"${r.title}" was cancelled`,
        requestId: id,
      });
    }
  }

  return Response.json({ ok: true });
}
