// POST /api/requests/[id]/cancel — Requester cancels their own request.
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
  const { data: req, error } = await supabase
    .from("requests")
    .select("id, requester_id, status, title, room_id, approver_id:rooms(approver_id)")
    .eq("id", id)
    .single();

  if (error || !req) return apiError(404, "NOT_FOUND", "Request not found.");

  const r = req as Record<string, unknown>;
  // Only the requester or an admin can cancel
  if (actor.role === "requester" && r.requester_id !== actor.id)
    return apiError(403, "FORBIDDEN", "Not your request.");

  try {
    await transition(id, "cancelled", { actorId: actor.id, action: "cancel" });
  } catch (e) {
    return apiError(409, "TRANSITION_ERROR", (e as Error).message);
  }

  // Notify approver if request was pending
  const approverRooms = r.approver_id as Array<{ approver_id: string | null }> | null;
  const approverId = approverRooms?.[0]?.approver_id;
  if (approverId) {
    await notify(approverId, {
      kind: "cancelled",
      title: `"${r.title}" was cancelled`,
      requestId: id,
    }).catch(() => {});
  }

  return Response.json({ ok: true });
}
