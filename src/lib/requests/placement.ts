// Can this request go into this room? Loads one room from the DB and runs the engine's hard constraints
// (capacity, systems, features, type, access, hours, blackouts, overlap). Owner: Aditi · D8
import "server-only";
import { ACTIVE_STATUSES, TZ } from "@/contracts/domain";
import { DEFAULT_WEIGHTS, type EngineRoom, type Violation } from "@/contracts/engine";
import type { BookingRequest } from "@/contracts/domain";
import type { db } from "@/lib/db/server";
import { hardViolations } from "@/engine";
import { parseRange } from "@/lib/db/mappers";

export async function placementViolations(
  supabase: ReturnType<typeof db>,
  request: BookingRequest,
  roomId: string,
  now: string,
): Promise<Violation[]> {
  const range = `[${request.during.start},${request.during.end})`;
  const [{ data: room }, { data: blackouts }, { data: booked }, { data: profile }] = await Promise.all([
    supabase.from("rooms").select("*").eq("id", roomId).maybeSingle(),
    supabase.from("room_blackouts").select("during").eq("room_id", roomId).filter("during", "ov", range),
    supabase
      .from("requests")
      .select("id, during, priority, status")
      .eq("room_id", roomId)
      .in("status", [...ACTIVE_STATUSES])
      .filter("during", "ov", range),
    supabase.from("profiles").select("department_id").eq("id", request.requesterId).maybeSingle(),
  ]);
  if (!room) return [{ code: "TYPE", message: "Room not found" }];

  const engineRoom: EngineRoom = {
    id: room.id,
    code: room.code,
    buildingId: room.building_id,
    type: room.type as EngineRoom["type"],
    capacity: room.capacity,
    systems: room.systems_count ?? 0,
    features: room.features as EngineRoom["features"],
    deptId: room.department_id,
    access: room.access as EngineRoom["access"],
    hours: { open: room.open_time, close: room.close_time, days: room.open_days },
    blackouts: (blackouts ?? []).map((b) => parseRange(b.during)),
    booked: (booked ?? []).map((b) => ({
      requestId: b.id,
      interval: parseRange(b.during),
      priority: b.priority,
      status: b.status as BookingRequest["status"],
      movable: b.status !== "checked_in",
    })),
  };

  return hardViolations(
    engineRoom,
    {
      id: request.id,
      requesterId: request.requesterId,
      deptId: profile?.department_id ?? null,
      headcount: request.headcount,
      minSystems: request.minSystems,
      features: request.requiredFeatures,
      roomType: request.roomType ?? undefined,
      interval: request.during,
      priority: request.priority,
      createdAt: request.createdAt,
      history: {},
    },
    { rooms: [engineRoom], buildings: [], deptBuilding: {}, weights: DEFAULT_WEIGHTS, now, tz: TZ },
  );
}
