// GET /api/requests/[id] — Single request detail with room and audit timeline.
// Owner: Aditi · Task D5
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import { rowToAudit, rowToRequest, rowToRoom } from "@/lib/db/mappers";
import type { Room } from "@/contracts/domain";
import type { RequestDetail } from "@/contracts/api";

export async function GET(
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
    .select("*")
    .eq("id", id)
    .single();

  if (error || !req) return apiError(404, "NOT_FOUND", "Request not found.");

  const r = req as Record<string, unknown>;
  // Access check: requesters can only see their own requests
  if (actor.role === "requester" && r.requester_id !== actor.id)
    return apiError(403, "FORBIDDEN", "Access denied.");

  const request = rowToRequest(r);

  // Fetch room if assigned
  let room: Room | null = null;
  if (request.roomId) {
    const { data: roomData } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", request.roomId)
      .single();
    if (roomData) room = rowToRoom(roomData as Record<string, unknown>);
  }

  // Fetch audit timeline
  const { data: auditData } = await supabase
    .from("audit_log")
    .select("*")
    .eq("entity_id", id)
    .eq("entity", "request")
    .order("at", { ascending: true });

  const timeline = (auditData ?? []).map((a) => rowToAudit(a as Record<string, unknown>));

  return Response.json({ request, room, timeline } satisfies RequestDetail);
}
