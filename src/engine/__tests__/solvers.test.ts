import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, type EngineContext, type EngineRequest, type EngineRoom } from "@/contracts/engine";
import { getSolver } from "../solvers";
import { fcfsSolver } from "../solvers/fcfs";
import { greedySolver } from "../solvers/greedy";
import { bnbSolver } from "../solvers/bnb";

const slot = { start: "2026-10-01T10:00:00+05:30", end: "2026-10-01T12:00:00+05:30" };

function makeRoom(id: string, capacity: number, features: EngineRoom["features"] = []): EngineRoom {
  return {
    id,
    code: id,
    buildingId: "B1",
    type: "classroom",
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

function makeReq(
  id: string,
  headcount: number,
  priority: number = 20,
  createdAt: string = "2026-09-29T10:00:00+05:30",
  features: EngineRequest["features"] = [],
): EngineRequest {
  return {
    id,
    label: id,
    requesterId: id,
    deptId: null,
    headcount,
    minSystems: 0,
    features,
    interval: slot,
    priority,
    createdAt,
    history: {},
  };
}

const baseCtx: EngineContext = {
  rooms: [makeRoom("R1", 50), makeRoom("R2", 100)],
  buildings: [{ id: "B1", lat: null, lng: null }],
  deptBuilding: {},
  weights: DEFAULT_WEIGHTS,
  now: "2026-09-30T10:00:00+05:30",
  tz: "Asia/Kolkata",
};

describe("Solver Registry", () => {
  it("returns appropriate solver by name", () => {
    expect(getSolver("fcfs")).toBe(fcfsSolver);
    expect(getSolver("greedy")).toBe(greedySolver);
    expect(getSolver("bnb")).toBe(bnbSolver);
  });
});

describe("FCFS Solver", () => {
  it("handles empty requests list", () => {
    const res = fcfsSolver.solve([], baseCtx);
    expect(res.assignments).toEqual([]);
    expect(res.metrics.placed).toBe(0);
    expect(res.metrics.total).toBe(0);
  });

  it("assigns to tightest fit room based on submission order", () => {
    const reqs = [
      makeReq("r1", 30, 20, "2026-09-29T10:00:00+05:30"),
      makeReq("r2", 40, 20, "2026-09-29T10:05:00+05:30"),
    ];

    const res = fcfsSolver.solve(reqs, baseCtx);

    // r1 arrives first, headcount 30 -> tightest fit is R1 (50 seats, wasted 20) vs R2 (100 seats, wasted 70) -> R1
    expect(res.assignments.find((a) => a.requestId === "r1")?.roomId).toBe("R1");

    // r2 arrives second, headcount 40 -> R1 is occupied by r1, so R2 is assigned
    expect(res.assignments.find((a) => a.requestId === "r2")?.roomId).toBe("R2");
  });
});

describe("Greedy Solver", () => {
  it("prioritizes higher priority requests first", () => {
    const reqs = [
      makeReq("low_priority", 45, 10, "2026-09-29T09:00:00+05:30"),
      makeReq("high_priority", 45, 50, "2026-09-29T10:00:00+05:30"),
    ];

    const smallRoomCtx: EngineContext = {
      ...baseCtx,
      rooms: [makeRoom("R1", 50)],
    };

    const res = greedySolver.solve(reqs, smallRoomCtx);

    // High priority request gets placed in R1 despite arriving later
    expect(res.assignments.find((a) => a.requestId === "high_priority")?.roomId).toBe("R1");
    expect(res.assignments.find((a) => a.requestId === "low_priority")?.roomId).toBeNull();
  });
});

describe("Branch & Bound Solver", () => {
  it("finds globally optimal placement across conflicting requests", () => {
    const roomA = makeRoom("A", 120, ["projector"]);
    const roomB = makeRoom("B", 60, ["projector"]);
    const roomC = makeRoom("C", 80, []);

    const ctx: EngineContext = {
      ...baseCtx,
      rooms: [roomA, roomB, roomC],
    };

    const reqs = [
      makeReq("coding", 50, 20, "2026-09-29T10:00:00+05:30", []),
      makeReq("workshop", 55, 20, "2026-09-29T10:05:00+05:30", ["projector"]),
      makeReq("ai", 100, 20, "2026-09-29T10:10:00+05:30", ["projector"]),
    ];

    const res = bnbSolver.solve(reqs, ctx);
    expect(res.metrics.placed).toBe(3);
    expect(res.assignments.find((a) => a.requestId === "coding")?.roomId).toBe("C");
    expect(res.assignments.find((a) => a.requestId === "workshop")?.roomId).toBe("B");
    expect(res.assignments.find((a) => a.requestId === "ai")?.roomId).toBe("A");
  });

  it("respects nodeLimit and returns incumbent solution", () => {
    const roomA = makeRoom("A", 120, ["projector"]);
    const roomB = makeRoom("B", 60, ["projector"]);
    const ctx: EngineContext = {
      ...baseCtx,
      rooms: [roomA, roomB],
    };

    const reqs = [
      makeReq("coding", 50, 20, "2026-09-29T10:00:00+05:30", []),
      makeReq("workshop", 55, 20, "2026-09-29T10:05:00+05:30", ["projector"]),
    ];

    const res = bnbSolver.solve(reqs, ctx, { nodeLimit: 1 });
    expect(res.timedOut).toBe(true);
    expect(res.metrics.placed).toBeGreaterThan(0);
  });
});
