// DB row → API shape (snake_case → camelCase). One copy, shared by every route. Owner: Aditi
import type { AuditEntry, Blackout, BookingRequest, Interval, Room } from "@/contracts/domain";

type Row = Record<string, unknown>;

/**
 * Postgres tstzrange text — `["2026-10-07 08:20:00+00","2026-10-07 09:20:00+00")` — to ISO-8601.
 * The raw form parses in Node but not in Safari, and the API contract promises ISO, so normalise once here.
 */
export function parseRange(raw: unknown): Interval {
  const [start, end] = String(raw)
    .slice(1, -1)
    .split(",")
    .map((s) => new Date(s.replace(/"/g, "").trim()).toISOString());
  return { start, end };
}

export function rowToRequest(r: Row): BookingRequest {
  return {
    id: r.id as string,
    requesterId: r.requester_id as string,
    title: r.title as string,
    purpose: r.purpose as BookingRequest["purpose"],
    priority: r.priority as number,
    headcount: r.headcount as number,
    minSystems: (r.min_systems as number) ?? 0,
    requiredFeatures: (r.required_features as BookingRequest["requiredFeatures"]) ?? [],
    roomType: (r.room_type as BookingRequest["roomType"]) ?? null,
    preferredBuildingId: (r.preferred_building_id as string) ?? null,
    during: parseRange(r.during),
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

export function rowToRoom(r: Row): Room {
  return {
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    buildingId: r.building_id as string,
    type: r.type as Room["type"],
    capacity: r.capacity as number,
    systemsCount: (r.systems_count as number) ?? 0,
    features: (r.features as Room["features"]) ?? [],
    departmentId: (r.department_id as string) ?? null,
    access: r.access as Room["access"],
    approverId: (r.approver_id as string) ?? null,
    openTime: String(r.open_time).slice(0, 5), // "HH:MM" — Postgres time is HH:MM:SS
    closeTime: String(r.close_time).slice(0, 5),
    openDays: (r.open_days as number[]) ?? [],
    attributes: (r.attributes as Record<string, unknown>) ?? {},
    isActive: r.is_active as boolean,
  };
}

export function rowToAudit(r: Row): AuditEntry {
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

export function rowToBlackout(r: Row): Blackout {
  return {
    id: r.id as string,
    roomId: r.room_id as string,
    during: parseRange(r.during),
    reason: r.reason as string,
  };
}
