// GET /api/requests/[id] — Single request detail with room and audit timeline.
// Owner: Aditi · Task D5
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import type { BookingRequest, AuditEntry, Room } from "@/contracts/domain";
import type { RequestDetail } from "@/contracts/api";

function rowToRequest(r: Record<string, unknown>): BookingRequest {
  const dur = r.during as string;
  const clean = dur.replace(/^[\[(]|[\])]$/g, "");
  const [start, end] = clean.split(",").map((s) => s.replace(/^"|"$/g, "").trim());
  return {
    id: r.id as string,
    requesterId: r.requester_id as string,
    title: r.title as string,
    purpose: r.purpose as BookingRequest["purpose"],
    priority: r.priority as number,
    headcount: r.headcount as number,
    minSystems: (r.min_systems as number) ?? 0,
    requiredFeatures: (r.required_features as string[]) ?? [],
    roomType: (r.room_type as BookingRequest["roomType"]) ?? null,
    preferredBuildingId: (r.preferred_building_id as string) ?? null,
    during: { start, end },
    roomId: (r.room_id as string) ?? null,
    status: r.status as BookingRequest["status"],
    holdExpiresAt: (r.hold_expires_at as string) ?? null,
    checkedInAt: (r.checked_in_at as string) ?? null,
    decisionReason: (r.decision_reason as string) ?? null,
    unplacedReason: (r.unplaced_reason as string) ?? null,
    offeredAlternatives: (r.offered_alternatives as unknown) ?? null,
    scoreBreakdown: (r.score_breakdown as unknown) ?? null,
    source: (r.source as BookingRequest["source"]) ?? "form",
    createdAt: r.created_at as string,
  };
}

function rowToAudit(r: Record<string, unknown>): AuditEntry {
  return {
    id: r.id as number,
    at: r.at as string,
    actorId: (r.actor_id as string) ?? null,
    entity: r.entity as AuditEntry["entity"],
    entityId: r.entity_id as string,
    action: r.action as string,
    fromStatus: (r.from_status as AuditEntry["fromStatus"]) ?? null,
    toStatus: (r.to_status as AuditEntry["toStatus"]) ?? null,
    details: (r.details as Record<string, unknown>) ?? {},
  };
}

function rowToRoom(r: Record<string, unknown>): Room {
  return {
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    buildingId: r.building_id as string,
    type: r.type as Room["type"],
    capacity: r.capacity as number,
    systemsCount: (r.systems_count as number) ?? 0,
    features: (r.features as string[]) ?? [],
    departmentId: (r.department_id as string) ?? null,
    access: r.access as Room["access"],
    approverId: (r.approver_id as string) ?? null,
    openTime: r.open_time as string,
    closeTime: r.close_time as string,
    openDays: (r.open_days as number[]) ?? [],
    attributes: (r.attributes as Record<string, unknown>) ?? {},
    isActive: r.is_active as boolean,
  };
}

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
