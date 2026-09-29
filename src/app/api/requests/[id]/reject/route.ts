// POST /api/requests/[id]/reject — Approver rejects a pending request with a reason.
// Owner: Aditi · Task D6
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import { canDecide } from "@/lib/requests/access";
import { transition } from "@/lib/requests/transition";
import { notify } from "@/lib/notify";
import { RejectSchema } from "@/contracts/api";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let actor;
  try {
    actor = await requireRole("approver", "admin");
  } catch (e) {
    return e as Response;
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = RejectSchema.safeParse(body);
  if (!parsed.success)
    return apiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "reason is required");

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

  try {
    await transition(id, "rejected", {
      actorId: actor.id,
      action: "reject",
      note: parsed.data.reason,
      // Clear the room assignment on rejection (room_id must be null for terminal statuses per schema)
      patch: { room_id: null, decided_by: actor.id },
    });
  } catch (e) {
    return apiError(409, "TRANSITION_ERROR", (e as Error).message);
  }

  await notify(r.requester_id, {
    kind: "rejected",
    title: `"${r.title}" rejected`,
    body: parsed.data.reason,
    requestId: id,
  });

  return Response.json({ ok: true });
}
