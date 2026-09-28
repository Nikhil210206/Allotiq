// Test fixtures. The 3-room fixture is from the problem brief and is the CP1 gate.
import { DEFAULT_WEIGHTS, type EngineContext, type EngineRequest, type EngineRoom } from "@/contracts/engine";

const THU_4PM = "2026-10-01T16:00:00+05:30";
const THU_6PM = "2026-10-01T18:00:00+05:30";
const slot = { start: THU_4PM, end: THU_6PM };

function room(id: string, capacity: number, features: EngineRoom["features"]): EngineRoom {
  return {
    id,
    code: id,
    buildingId: "TP",
    type: "seminar_hall",
    capacity,
    systems: 0,
    features,
    deptId: null,
    access: "open",
    hours: { open: "08:00", close: "20:00", days: [1, 2, 3, 4, 5, 6] },
    blackouts: [],
    booked: [],
  };
}

function req(id: string, label: string, headcount: number, features: EngineRequest["features"], createdAt: string): EngineRequest {
  return {
    id,
    label,
    requesterId: id,
    deptId: null,
    headcount,
    minSystems: 0,
    features,
    interval: slot,
    priority: 20,
    createdAt,
    history: {},
  };
}

export const threeRoomCtx: EngineContext = {
  rooms: [room("A", 120, ["projector"]), room("B", 60, ["projector"]), room("C", 80, [])],
  buildings: [{ id: "TP", lat: null, lng: null }],
  deptBuilding: {},
  weights: DEFAULT_WEIGHTS,
  now: "2026-09-30T13:50:00+05:30",
  tz: "Asia/Kolkata",
};

/** In submission order: Coding Club, Workshop, AI Club — all Thu 4–6 PM. */
export const threeRequests: EngineRequest[] = [
  req("coding", "Coding Club", 50, [], "2026-09-29T10:00:00+05:30"),
  req("workshop", "Workshop", 55, ["projector"], "2026-09-29T10:05:00+05:30"),
  req("ai", "AI Club", 100, ["projector"], "2026-09-29T10:10:00+05:30"),
];
