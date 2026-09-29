// DB rows → EngineContext / EngineRequest, and Plan → apply_plan() RPC. Owner: Aaditya · A6
import "server-only";
import { ACTIVE_STATUSES, PURPOSE_PRIORITY, TZ, type Interval, type Purpose } from "@/contracts/domain";
import { DEFAULT_WEIGHTS, type EngineBooking, type EngineContext, type EngineRequest, type EngineRoom, type Plan, type Weights } from "@/contracts/engine";
import { getNow } from "@/lib/clock";
import { parseRange } from "@/lib/db/mappers";
import { db } from "@/lib/db/server";
import type { Database, Json } from "@/lib/db/types.gen";

type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];
type RequestRow = Database["public"]["Tables"]["requests"]["Row"];
const activeStatusSet = new Set<string>(ACTIVE_STATUSES);

function throwReadError(source: string, error: { message: string } | null): void {
  if (error) throw new Error(`Failed to load ${source}: ${error.message}`);
}

function rangeFilter(interval: Interval): string {
  return `[${interval.start},${interval.end})`;
}

/** The engine contract is half-open; never silently normalize another DB range shape. */
function parseEngineRange(raw: unknown): Interval {
  const value = String(raw);
  if (!value.startsWith("[") || !value.endsWith(")")) {
    throw new Error("Expected a half-open [start, end) database interval");
  }
  return parseRange(value);
}

function parseWeights(value: unknown): Weights | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

  const keys: (keyof Weights)[] = [
    "capacityFit",
    "featureMatch",
    "proximity",
    "scarcity",
    "preference",
    "energy",
  ];
  const source = value as Record<string, unknown>;
  const entries = keys.map((key) => source[key]);
  if (entries.some((entry) => typeof entry !== "number" || !Number.isFinite(entry) || entry < 0)) return null;
  if (entries.every((entry) => entry === 0)) return null;

  return Object.fromEntries(keys.map((key) => [key, source[key]])) as unknown as Weights;
}

function roomToEngineRoom(
  room: RoomRow,
  blackouts: Interval[],
  booked: EngineBooking[],
): EngineRoom {
  return {
    id: room.id,
    code: room.code,
    buildingId: room.building_id,
    type: room.type,
    capacity: room.capacity,
    systems: room.systems_count,
    features: room.features as EngineRoom["features"],
    deptId: room.department_id,
    access: room.access,
    hours: {
      open: room.open_time.slice(0, 5),
      close: room.close_time.slice(0, 5),
      days: room.open_days,
    },
    blackouts,
    booked,
  };
}

/** Map a typed database request row to the pure engine request contract. */
export function mapRequestToEngineRequest(
  row: RequestRow,
  deptId: string | null,
  history: Record<string, number> = {},
): EngineRequest {
  return {
    id: row.id,
    requesterId: row.requester_id,
    deptId,
    headcount: row.headcount,
    minSystems: row.min_systems,
    features: row.required_features as EngineRequest["features"],
    ...(row.room_type ? { roomType: row.room_type } : {}),
    interval: parseEngineRange(row.during),
    priority: PURPOSE_PRIORITY[row.purpose as Purpose],
    createdAt: row.created_at,
    ...(row.preferred_building_id ? { preferredBuildingId: row.preferred_building_id } : {}),
    history,
  };
}

/** Load a request with its requester department and completed-booking room history. */
export async function loadEngineRequest(requestId: string): Promise<EngineRequest> {
  const supabase = db();
  const { data: row, error: requestError } = await supabase
    .from("requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  throwReadError("request", requestError);
  if (!row) throw new Error(`Request ${requestId} was not found`);

  const [profileResult, historyResult] = await Promise.all([
    supabase.from("profiles").select("department_id").eq("id", row.requester_id).maybeSingle(),
    supabase
      .from("requests")
      .select("room_id")
      .eq("requester_id", row.requester_id)
      .eq("status", "completed")
      .neq("id", row.id)
      .not("room_id", "is", null),
  ]);
  throwReadError("requester profile", profileResult.error);
  throwReadError("request history", historyResult.error);
  if (!profileResult.data) throw new Error(`Requester profile for ${requestId} was not found`);

  const history: Record<string, number> = {};
  for (const past of historyResult.data ?? []) {
    if (past.room_id) history[past.room_id] = (history[past.room_id] ?? 0) + 1;
  }

  return mapRequestToEngineRequest(row, profileResult.data.department_id, history);
}

/** Load active rooms, catalog metadata, blackouts, and active bookings overlapping window. */
export async function loadEngineContext(window?: Interval): Promise<EngineContext> {
  const supabase = db();
  const settingsQuery = supabase
    .from("app_settings")
    .select("value")
    .eq("key", "engine_weights")
    .maybeSingle();

  const [roomsResult, buildingsResult, departmentsResult, settingsResult, now] = await Promise.all([
    supabase.from("rooms").select("*").eq("is_active", true),
    supabase.from("buildings").select("id, lat, lng"),
    supabase.from("departments").select("id, building_id"),
    settingsQuery,
    getNow(),
  ]);

  throwReadError("active rooms", roomsResult.error);
  throwReadError("buildings", buildingsResult.error);
  throwReadError("departments", departmentsResult.error);
  throwReadError("engine weights", settingsResult.error);

  const roomRows = roomsResult.data ?? [];
  const roomIds = roomRows.map((room) => room.id);
  let blackouts: Database["public"]["Tables"]["room_blackouts"]["Row"][] = [];
  let bookingRows: RequestRow[] = [];

  if (roomIds.length > 0) {
    let blackoutsQuery = supabase.from("room_blackouts").select("*").in("room_id", roomIds);
    let bookingsQuery = supabase
      .from("requests")
      .select("*")
      .in("room_id", roomIds)
      .in("status", [...ACTIVE_STATUSES]);

    if (window) {
      const range = rangeFilter(window);
      blackoutsQuery = blackoutsQuery.filter("during", "ov", range);
      bookingsQuery = bookingsQuery.filter("during", "ov", range);
    }

    const [blackoutsResult, bookingsResult] = await Promise.all([blackoutsQuery, bookingsQuery]);
    throwReadError("room blackouts", blackoutsResult.error);
    throwReadError("active bookings", bookingsResult.error);
    blackouts = blackoutsResult.data ?? [];
    bookingRows = bookingsResult.data ?? [];
  }

  const blackoutsByRoom = new Map<string, Interval[]>();
  for (const blackout of blackouts) {
    const intervals = blackoutsByRoom.get(blackout.room_id) ?? [];
    intervals.push(parseEngineRange(blackout.during));
    blackoutsByRoom.set(blackout.room_id, intervals);
  }

  const bookingsByRoom = new Map<string, EngineBooking[]>();
  for (const booking of bookingRows) {
    if (!booking.room_id || !activeStatusSet.has(booking.status)) continue;
    const roomBookings = bookingsByRoom.get(booking.room_id) ?? [];
    roomBookings.push({
      requestId: booking.id,
      interval: parseEngineRange(booking.during),
      priority: PURPOSE_PRIORITY[booking.purpose as Purpose],
      status: booking.status,
      movable: booking.status !== "checked_in",
    });
    bookingsByRoom.set(booking.room_id, roomBookings);
  }

  const weights = parseWeights(settingsResult.data?.value) ?? DEFAULT_WEIGHTS;
  return {
    rooms: roomRows.map((room) =>
      roomToEngineRoom(room, blackoutsByRoom.get(room.id) ?? [], bookingsByRoom.get(room.id) ?? []),
    ),
    buildings: (buildingsResult.data ?? []).map(({ id, lat, lng }) => ({ id, lat, lng })),
    deptBuilding: Object.fromEntries(
      (departmentsResult.data ?? [])
        .filter((department): department is typeof department & { building_id: string } => department.building_id !== null)
        .map((department) => [department.id, department.building_id]),
    ),
    weights,
    now: now.toISOString(),
    tz: TZ,
  };
}

/** Apply all plan moves atomically through the migration-owned RPC. */
export async function persistPlan(plan: Plan, actorId: string, action: string): Promise<void> {
  const now = (await getNow()).toISOString();
  type RpcMove = {
    request_id: string;
    room_id: string | null;
    s: string;
    e: string;
    status: Plan["moves"][number]["status"] | null;
    offers: Plan["unplaced"][number]["alternatives"] | Plan["moves"][number]["offers"] | null;
  };
  const movesByRequest = new Map<string, RpcMove>();
  for (const move of plan.moves) {
    movesByRequest.set(move.requestId, {
      request_id: move.requestId,
      room_id: move.roomId,
      s: move.interval.start,
      e: move.interval.end,
      status: move.status ?? null,
      offers: move.offers ?? null,
    });
  }

  const missingUnplaced = plan.unplaced.filter((item) => !movesByRequest.has(item.requestId));
  if (missingUnplaced.length > 0) {
    const supabase = db();
    const { data, error } = await supabase
      .from("requests")
      .select("id, room_id, during")
      .in("id", missingUnplaced.map((item) => item.requestId));
    throwReadError("unplaced plan requests", error);
    const rowsById = new Map((data ?? []).map((row) => [row.id, row]));

    for (const item of missingUnplaced) {
      const row = rowsById.get(item.requestId);
      if (!row) throw new Error(`Plan request ${item.requestId} was not found`);
      const interval = parseEngineRange(row.during);
      movesByRequest.set(item.requestId, {
        request_id: item.requestId,
        room_id: row.room_id,
        s: interval.start,
        e: interval.end,
        status: null,
        offers: item.alternatives,
      });
    }
  }

  for (const item of plan.unplaced) {
    const move = movesByRequest.get(item.requestId);
    if (move) move.offers = item.alternatives;
  }
  const moves = [...movesByRequest.values()];

  const { error } = await db().rpc("apply_plan", {
    p_moves: moves as unknown as Json,
    // Plan has moves for existing request IDs but no insert payload/schema; never fabricate rows.
    p_inserts: [] as Json,
    p_actor: actorId,
    p_action: action,
    p_at: now,
  });
  if (error) throw new Error(`Failed to apply allocation plan: ${error.message}`);
}
