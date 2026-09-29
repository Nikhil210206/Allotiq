// A2 — score.ts tests. Owner: Aaditya
import { describe, expect, it } from "vitest";
import type { EngineContext, EngineRequest, EngineRoom } from "@/contracts/engine";
import { DEFAULT_WEIGHTS } from "@/contracts/engine";
import { scoreRoom } from "../score";

// ── Helpers ─────────────────────────────────────────────────────

const THU_4PM = "2026-10-01T16:00:00+05:30";
const THU_6PM = "2026-10-01T18:00:00+05:30";

function makeRoom(overrides: Partial<EngineRoom> = {}): EngineRoom {
  return {
    id: "R1",
    code: "R1",
    buildingId: "B1",
    type: "seminar_hall",
    capacity: 100,
    systems: 60,
    features: ["projector", "mic"],
    deptId: null,
    access: "open",
    hours: { open: "08:00", close: "20:00", days: [1, 2, 3, 4, 5, 6] },
    blackouts: [],
    booked: [],
    ...overrides,
  };
}

function makeReq(overrides: Partial<EngineRequest> = {}): EngineRequest {
  return {
    id: "REQ1",
    requesterId: "U1",
    deptId: null,
    headcount: 50,
    minSystems: 0,
    features: [],
    niceToHave: [],
    interval: { start: THU_4PM, end: THU_6PM },
    priority: 20,
    createdAt: "2026-09-29T10:00:00+05:30",
    history: {},
    ...overrides,
  };
}

function makeCtx(overrides: Partial<EngineContext> = {}): EngineContext {
  return {
    rooms: [],
    buildings: [{ id: "B1", lat: null, lng: null }],
    deptBuilding: {},
    weights: DEFAULT_WEIGHTS,
    now: "2026-09-30T12:00:00+05:30",
    tz: "Asia/Kolkata",
    ...overrides,
  };
}

// ── Score range ─────────────────────────────────────────────────

describe("score range", () => {
  it("total is between 0 and 100", () => {
    const score = scoreRoom(makeRoom(), makeReq(), makeCtx());
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(100);
  });

  it("all components are in [0, 1]", () => {
    const score = scoreRoom(makeRoom(), makeReq(), makeCtx());
    for (const key of ["capacityFit", "featureMatch", "proximity", "scarcity", "preference", "energy"] as const) {
      expect(score[key]).toBeGreaterThanOrEqual(0);
      expect(score[key]).toBeLessThanOrEqual(1);
    }
  });
});

// ── Capacity fit ────────────────────────────────────────────────

describe("capacityFit", () => {
  it("exact fit → 1.0", () => {
    const score = scoreRoom(makeRoom({ capacity: 50 }), makeReq({ headcount: 50 }), makeCtx());
    expect(score.capacityFit).toBe(1);
    expect(score.wastedSeats).toBe(0);
  });

  it("double capacity → 0.5", () => {
    const score = scoreRoom(makeRoom({ capacity: 100 }), makeReq({ headcount: 50 }), makeCtx());
    expect(score.capacityFit).toBe(0.5);
    expect(score.wastedSeats).toBe(50);
  });

  it("insufficient capacity → 0", () => {
    const score = scoreRoom(makeRoom({ capacity: 10 }), makeReq({ headcount: 50 }), makeCtx());
    expect(score.capacityFit).toBe(0);
  });
});

// ── Feature match ───────────────────────────────────────────────

describe("featureMatch", () => {
  it("no niceToHave requested (or empty) → 1.0", () => {
    const score = scoreRoom(makeRoom(), makeReq({ niceToHave: [] }), makeCtx());
    expect(score.featureMatch).toBe(1);
  });

  it("all niceToHave features present → 1.0", () => {
    const score = scoreRoom(
      makeRoom({ features: ["projector", "mic"] }),
      makeReq({ niceToHave: ["projector", "mic"] }),
      makeCtx(),
    );
    expect(score.featureMatch).toBe(1);
  });

  it("half niceToHave features present → 0.5", () => {
    const score = scoreRoom(
      makeRoom({ features: ["projector"] }),
      makeReq({ niceToHave: ["projector", "mic"] }),
      makeCtx(),
    );
    expect(score.featureMatch).toBe(0.5);
  });
});

// ── Proximity ───────────────────────────────────────────────────

describe("proximity", () => {
  it("preferred building matches → 1.0", () => {
    const score = scoreRoom(
      makeRoom({ buildingId: "B1" }),
      makeReq({ preferredBuildingId: "B1" }),
      makeCtx(),
    );
    expect(score.proximity).toBe(1);
  });

  it("preferred building differs without coordinates → neutral 0.5", () => {
    const score = scoreRoom(
      makeRoom({ buildingId: "B2" }),
      makeReq({ preferredBuildingId: "B1" }),
      makeCtx({
        buildings: [
          { id: "B1", lat: null, lng: null },
          { id: "B2", lat: null, lng: null },
        ],
      }),
    );
    expect(score.proximity).toBe(0.5);
  });

  it("calculates haversine decay with coordinates", () => {
    const score = scoreRoom(
      makeRoom({ buildingId: "B2" }),
      makeReq({ preferredBuildingId: "B1" }),
      makeCtx({
        buildings: [
          { id: "B1", lat: 12.9716, lng: 77.5946 },
          { id: "B2", lat: 12.9726, lng: 77.5956 },
        ],
      }),
    );
    expect(score.proximity).toBeGreaterThan(0);
    expect(score.proximity).toBeLessThan(1);
  });

  it("no preference and no dept → neutral 0.5", () => {
    const score = scoreRoom(makeRoom(), makeReq(), makeCtx());
    expect(score.proximity).toBe(0.5);
  });
});

// ── Scarcity ────────────────────────────────────────────────────

describe("scarcity", () => {
  it("no overlapping bookings → 1.0", () => {
    const score = scoreRoom(makeRoom({ booked: [] }), makeReq(), makeCtx());
    expect(score.scarcity).toBe(1);
  });

  it("1 overlapping booking → 0.5", () => {
    const room = makeRoom({
      booked: [
        {
          requestId: "REQ_EXISTING_1",
          interval: { start: THU_4PM, end: THU_6PM },
          priority: 10,
          status: "approved",
          movable: true,
        },
      ],
    });
    const score = scoreRoom(room, makeReq(), makeCtx());
    expect(score.scarcity).toBe(0.5);
  });

  it("2 overlapping bookings → 0.333...", () => {
    const room = makeRoom({
      booked: [
        {
          requestId: "REQ_EXISTING_1",
          interval: { start: THU_4PM, end: THU_6PM },
          priority: 10,
          status: "approved",
          movable: true,
        },
        {
          requestId: "REQ_EXISTING_2",
          interval: { start: THU_4PM, end: THU_6PM },
          priority: 10,
          status: "approved",
          movable: true,
        },
      ],
    });
    const score = scoreRoom(room, makeReq(), makeCtx());
    expect(score.scarcity).toBeCloseTo(1 / 3, 3);
  });
});

// ── Preference (history) ────────────────────────────────────────

describe("preference", () => {
  it("no history → 0", () => {
    const score = scoreRoom(makeRoom(), makeReq({ history: {} }), makeCtx());
    expect(score.preference).toBe(0);
  });

  it("1 past booking → 0.5", () => {
    const score = scoreRoom(makeRoom({ id: "R1" }), makeReq({ history: { R1: 1 } }), makeCtx());
    expect(score.preference).toBe(0.5);
  });

  it("2 past bookings → 0.666...", () => {
    const score = scoreRoom(makeRoom({ id: "R1" }), makeReq({ history: { R1: 2 } }), makeCtx());
    expect(score.preference).toBeCloseTo(2 / 3, 3);
  });
});

// ── Energy (Building Consolidation) ────────────────────────────

describe("energy", () => {
  it("no sibling rooms in building with activity → 0", () => {
    const room = makeRoom({ id: "R1", buildingId: "B1" });
    const ctx = makeCtx({ rooms: [room] });
    const score = scoreRoom(room, makeReq(), ctx);
    expect(score.energy).toBe(0);
  });

  it("sibling room in same building has overlapping booking → 1", () => {
    const room1 = makeRoom({ id: "R1", buildingId: "B1" });
    const room2 = makeRoom({
      id: "R2",
      buildingId: "B1",
      booked: [
        {
          requestId: "REQ_SIBLING",
          interval: { start: THU_4PM, end: THU_6PM },
          priority: 10,
          status: "approved",
          movable: true,
        },
      ],
    });
    const ctx = makeCtx({ rooms: [room1, room2] });
    const score = scoreRoom(room1, makeReq(), ctx);
    expect(score.energy).toBe(1);
  });
});

// ── Determinism ─────────────────────────────────────────────────

describe("determinism", () => {
  it("scoring the same room/request 10 times produces identical results", () => {
    const room = makeRoom();
    const req = makeReq();
    const c = makeCtx();
    const first = scoreRoom(room, req, c);
    for (let i = 0; i < 10; i++) {
      expect(scoreRoom(room, req, c)).toEqual(first);
    }
  });
});

// ── Notes & wastedSeats ─────────────────────────────────────────

describe("notes and wastedSeats", () => {
  it("wastedSeats is non-negative", () => {
    const score = scoreRoom(makeRoom({ capacity: 100 }), makeReq({ headcount: 50 }), makeCtx());
    expect(score.wastedSeats).toBe(50);
  });

  it("notes is an array of strings", () => {
    const score = scoreRoom(makeRoom(), makeReq(), makeCtx());
    expect(Array.isArray(score.notes)).toBe(true);
    for (const n of score.notes) {
      expect(typeof n).toBe("string");
    }
  });
});

// ── Weights ─────────────────────────────────────────────────────

describe("weights", () => {
  it("returned weights match context weights", () => {
    const score = scoreRoom(makeRoom(), makeReq(), makeCtx());
    expect(score.weights).toEqual(DEFAULT_WEIGHTS);
  });

  it("total = 100 × Σ(weight × component)", () => {
    const score = scoreRoom(makeRoom(), makeReq(), makeCtx());
    const expected =
      100 *
      (score.weights.capacityFit * score.capacityFit +
        score.weights.featureMatch * score.featureMatch +
        score.weights.proximity * score.proximity +
        score.weights.scarcity * score.scarcity +
        score.weights.preference * score.preference +
        score.weights.energy * score.energy);
    expect(score.total).toBeCloseTo(expected, 2);
  });
});

// ── Audit-fix A3 corrections ─────────────────────────────────────

import { computeMetrics } from "../metrics";
import type { Assignment } from "@/contracts/engine";

const SLOT = { start: "2026-10-01T16:00:00+05:30", end: "2026-10-01T18:00:00+05:30" };

describe("metrics — priority threshold = 40", () => {
  const room = makeRoom({ id: "R1" });
  const ctx = makeCtx({ rooms: [room] });

  it("priority 40 is counted as priority request", () => {
    const req = makeReq({ id: "r1", priority: 40 });
    const a: Assignment = { requestId: "r1", roomId: "R1", interval: SLOT };
    const m = computeMetrics([a], [req], ctx);
    expect(m.priorityTotal).toBe(1);
    expect(m.priorityPlaced).toBe(1);
  });

  it("priority 39 is NOT counted as priority request", () => {
    const req = makeReq({ id: "r1", priority: 39 });
    const a: Assignment = { requestId: "r1", roomId: "R1", interval: SLOT };
    const m = computeMetrics([a], [req], ctx);
    expect(m.priorityTotal).toBe(0);
    expect(m.priorityPlaced).toBe(0);
  });
});

describe("scarcityScore — active-status filter", () => {
  it("inactive overlapping booking does NOT reduce scarcity (score = 1)", () => {
    const room = makeRoom({
      booked: [{
        requestId: "old",
        interval: SLOT,
        priority: 20,
        status: "cancelled" as never,
        movable: false,
      }],
    });
    const req = makeReq({ interval: SLOT });
    const ctx = makeCtx({ rooms: [room] });
    const score = scoreRoom(room, req, ctx);
    // scarcity should be 1/(1+0) = 1 because "cancelled" is not active
    expect(score.scarcity).toBeCloseTo(1, 5);
  });

  it("active overlapping booking DOES reduce scarcity (score < 1)", () => {
    const room = makeRoom({
      booked: [{
        requestId: "active",
        interval: SLOT,
        priority: 20,
        status: "approved",
        movable: true,
      }],
    });
    const req = makeReq({ interval: SLOT });
    const ctx = makeCtx({ rooms: [room] });
    const score = scoreRoom(room, req, ctx);
    // scarcity should be 1/(1+1) = 0.5
    expect(score.scarcity).toBeCloseTo(0.5, 5);
  });
});

describe("energyScore — active-status filter", () => {
  const SIBLING_ID = "R2";

  it("inactive booking in sibling room does NOT make energy = 1", () => {
    const sibling = makeRoom({
      id: SIBLING_ID,
      buildingId: "B1",
      booked: [{
        requestId: "old",
        interval: SLOT,
        priority: 20,
        status: "cancelled" as never,
        movable: false,
      }],
    });
    const room = makeRoom({ id: "R1", buildingId: "B1" });
    const ctx = makeCtx({ rooms: [room, sibling] });
    const req = makeReq({ interval: SLOT });
    const score = scoreRoom(room, req, ctx);
    expect(score.energy).toBe(0);
  });

  it("active booking in sibling room DOES make energy = 1", () => {
    const sibling = makeRoom({
      id: SIBLING_ID,
      buildingId: "B1",
      booked: [{
        requestId: "active",
        interval: SLOT,
        priority: 20,
        status: "approved",
        movable: true,
      }],
    });
    const room = makeRoom({ id: "R1", buildingId: "B1" });
    const ctx = makeCtx({ rooms: [room, sibling] });
    const req = makeReq({ interval: SLOT });
    const score = scoreRoom(room, req, ctx);
    expect(score.energy).toBe(1);
  });
});
