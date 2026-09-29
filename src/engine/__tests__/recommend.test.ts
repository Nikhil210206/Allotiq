import { describe, expect, it } from "vitest";
import type { EngineContext, EngineRequest, EngineRoom } from "@/contracts/engine";
import { DEFAULT_WEIGHTS } from "@/contracts/engine";
import { recommend } from "../recommend";

const interval = { start: "2026-10-01T16:00:00+05:30", end: "2026-10-01T18:00:00+05:30" };

function makeRoom(overrides: Partial<EngineRoom> = {}): EngineRoom {
  return {
    id: "room-1",
    code: "R1",
    buildingId: "building-1",
    type: "classroom",
    capacity: 70,
    systems: 20,
    features: ["projector"],
    deptId: null,
    access: "open",
    hours: { open: "08:00", close: "20:00", days: [1, 2, 3, 4, 5, 6, 7] },
    blackouts: [],
    booked: [],
    ...overrides,
  };
}

function makeRequest(overrides: Partial<EngineRequest> = {}): EngineRequest {
  return {
    id: "draft",
    requesterId: "profile",
    deptId: null,
    headcount: 60,
    minSystems: 10,
    features: ["projector"],
    interval,
    priority: 40,
    createdAt: "2026-09-29T10:00:00Z",
    history: {},
    ...overrides,
  };
}

function makeContext(rooms: EngineRoom[]): EngineContext {
  return {
    rooms,
    buildings: [{ id: "building-1", lat: null, lng: null }],
    deptBuilding: {},
    weights: DEFAULT_WEIGHTS,
    now: "2026-10-01T10:00:00+05:30",
    tz: "Asia/Kolkata",
  };
}

describe("recommend", () => {
  it("returns ranked feasible rooms with score breakdowns and readable reasons", () => {
    const result = recommend(makeRequest(), makeContext([
      makeRoom(),
      makeRoom({ id: "room-2", code: "R2", capacity: 100 }),
      makeRoom({ id: "room-3", code: "R3", capacity: 120 }),
    ]));

    expect(result.top).toHaveLength(3);
    expect(result.top[0]).toMatchObject({ roomId: "room-1", score: { total: expect.any(Number), capacityFit: expect.any(Number) } });
    expect(result.top[0].why).toContain("Tight fit: 70 seats, only 10 wasted");
    expect(result.top[0].score.notes).toEqual(result.top[0].why);
    expect(result.alternatives).toBeNull();
  });

  it("returns deterministic results and stable tie ordering", () => {
    const ctx = makeContext([
      makeRoom({ id: "room-b", code: "B" }),
      makeRoom({ id: "room-a", code: "A" }),
    ]);
    expect(recommend(makeRequest(), ctx)).toEqual(recommend(makeRequest(), ctx));
    expect(recommend(makeRequest(), ctx).top.map((item) => item.roomId)).toEqual(["room-a", "room-b"]);
  });

  it("returns structured infeasibility reasons and alternatives when no room fits the slot", () => {
    const blockedRoom = makeRoom({
      booked: [{ requestId: "booking", interval, priority: 40, status: "approved", movable: true }],
    });
    const result = recommend(makeRequest(), makeContext([blockedRoom]));

    expect(result.top).toEqual([]);
    expect(result.whyNot[0].violations).toContainEqual({ code: "OVERLAP", message: "Booked 16:00–18:00" });
    expect(result.alternatives?.sameRoomOtherSlot.length).toBeGreaterThan(0);
    expect(result.alternatives?.similarRoomSameSlot).toEqual([]);
  });

  it("reports hard violations when the request is genuinely infeasible", () => {
    const result = recommend(makeRequest({ headcount: 5000 }), makeContext([makeRoom()]));
    expect(result.top).toEqual([]);
    expect(result.whyNot[0].violations).toContainEqual({ code: "CAPACITY", message: "Only 70 seats (needs 5000)" });
    expect(result.alternatives).toEqual({ sameRoomOtherSlot: [], similarRoomSameSlot: [] });
  });
});
