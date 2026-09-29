import { DEFAULT_WEIGHTS, type EngineContext, type EngineRequest, type EngineRoom } from "@/contracts/engine";

export const SLOT = { start: "2026-10-01T16:00:00+05:30", end: "2026-10-01T18:00:00+05:30" };
export const NOW = "2026-10-01T10:00:00+05:30";

export function request(id: string, priority: number, overrides: Partial<EngineRequest> = {}): EngineRequest {
  return {
    id,
    requesterId: `user-${id}`,
    deptId: null,
    headcount: 20,
    minSystems: 0,
    features: [],
    interval: SLOT,
    priority,
    createdAt: "2026-09-30T10:00:00+05:30",
    history: {},
    ...overrides,
  };
}

export function room(id: string, overrides: Partial<EngineRoom> = {}): EngineRoom {
  return {
    id,
    code: id,
    buildingId: "building-1",
    type: "classroom",
    capacity: 40,
    systems: 0,
    features: [],
    deptId: null,
    access: "open",
    hours: { open: "08:00", close: "20:00", days: [1, 2, 3, 4, 5, 6, 7] },
    blackouts: [],
    booked: [],
    ...overrides,
  };
}

export function context(rooms: EngineRoom[], overrides: Partial<EngineContext> = {}): EngineContext {
  return {
    rooms,
    buildings: [{ id: "building-1", lat: null, lng: null }],
    deptBuilding: {},
    weights: DEFAULT_WEIGHTS,
    now: NOW,
    tz: "Asia/Kolkata",
    ...overrides,
  };
}

export function booking(
  requestId: string,
  priority: number,
  status: "pending" | "approved" | "checked_in" = "pending",
  interval = SLOT,
) {
  return { requestId, priority, status, interval, movable: status !== "checked_in" } as const;
}
