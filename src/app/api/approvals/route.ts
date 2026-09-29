// GET /api/approvals — Pending requests for rooms this approver manages.
// Owner: Aditi · Task D6
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import type { BookingRequest } from "@/contracts/domain";

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

export async function GET() {
  let actor;
  try {
    actor = await requireRole("approver", "admin");
  } catch (e) {
    return e as Response;
  }

  const supabase = db();

  let roomIds: string[] = [];
  if (actor.role === "approver") {
    const { data: myRooms } = await supabase
      .from("rooms")
      .select("id")
      .eq("approver_id", actor.id);
    roomIds = (myRooms ?? []).map((r) => (r as Record<string, unknown>).id as string);
    if (roomIds.length === 0) return Response.json([]);
  }

  let query = supabase
    .from("requests")
    .select("*")
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (actor.role === "approver") {
    query = query.in("room_id", roomIds);
  }

  const { data, error } = await query;
  if (error) return apiError(500, "DB_ERROR", error.message);
  return Response.json((data ?? []).map((r) => rowToRequest(r as Record<string, unknown>)));
}
