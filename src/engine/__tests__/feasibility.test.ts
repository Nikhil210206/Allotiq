// A1 — feasibility.ts tests. Owner: Aaditya
import { describe, expect, it } from "vitest";
import type { EngineContext, EngineRequest, EngineRoom, ViolationCode } from "@/contracts/engine";
import { DEFAULT_WEIGHTS } from "@/contracts/engine";
import { hardViolations, isFeasible } from "../feasibility";

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
    interval: { start: THU_4PM, end: THU_6PM },
    priority: 20,
    createdAt: "2026-09-29T10:00:00+05:30",
    history: {},
    ...overrides,
  };
}

const ctx: EngineContext = {
  rooms: [],
  buildings: [],
  deptBuilding: {},
  weights: DEFAULT_WEIGHTS,
  now: "2026-09-30T12:00:00+05:30",
  tz: "Asia/Kolkata",
};

function codes(room: EngineRoom, req: EngineRequest): ViolationCode[] {
  return hardViolations(room, req, ctx).map((v) => v.code);
}

// ── CAPACITY ────────────────────────────────────────────────────

describe("CAPACITY", () => {
  it("exact capacity → no violation", () => {
    expect(codes(makeRoom({ capacity: 50 }), makeReq({ headcount: 50 }))).not.toContain("CAPACITY");
  });

  it("insufficient capacity → CAPACITY violation", () => {
    expect(codes(makeRoom({ capacity: 49 }), makeReq({ headcount: 50 }))).toContain("CAPACITY");
  });

  it("excess capacity → no violation", () => {
    expect(codes(makeRoom({ capacity: 200 }), makeReq({ headcount: 50 }))).not.toContain("CAPACITY");
  });
});

// ── SYSTEMS ─────────────────────────────────────────────────────

describe("SYSTEMS", () => {
  it("exact systems → no violation", () => {
    expect(codes(makeRoom({ systems: 60 }), makeReq({ minSystems: 60 }))).not.toContain("SYSTEMS");
  });

  it("insufficient systems → SYSTEMS violation", () => {
    expect(codes(makeRoom({ systems: 59 }), makeReq({ minSystems: 60 }))).toContain("SYSTEMS");
  });

  it("no systems required → no violation even with 0 systems", () => {
    expect(codes(makeRoom({ systems: 0 }), makeReq({ minSystems: 0 }))).not.toContain("SYSTEMS");
  });
});

// ── FEATURE ─────────────────────────────────────────────────────

describe("FEATURE", () => {
  it("required feature present → no violation", () => {
    expect(
      codes(makeRoom({ features: ["projector", "mic"] }), makeReq({ features: ["projector"] })),
    ).not.toContain("FEATURE");
  });

  it("required feature missing → FEATURE violation", () => {
    const violations = hardViolations(makeRoom({ features: ["mic"] }), makeReq({ features: ["smart_board"] }), ctx);
    expect(violations.map((v) => v.code)).toContain("FEATURE");
    expect(violations.find((v) => v.code === "FEATURE")?.message).toBe("No smart board");
  });

  it("multiple missing features → one violation per missing feature", () => {
    const vs = hardViolations(
      makeRoom({ features: [] }),
      makeReq({ features: ["projector", "mic"] }),
      ctx,
    );
    const featureViolations = vs.filter((v) => v.code === "FEATURE");
    expect(featureViolations).toHaveLength(2);
  });
});

// ── TYPE ────────────────────────────────────────────────────────

describe("TYPE", () => {
  it("matching type → no violation", () => {
    expect(codes(makeRoom({ type: "lab" }), makeReq({ roomType: "lab" }))).not.toContain("TYPE");
  });

  it("mismatched type → TYPE violation", () => {
    expect(codes(makeRoom({ type: "lab" }), makeReq({ roomType: "classroom" }))).toContain("TYPE");
  });

  it("no type preference → no violation", () => {
    expect(codes(makeRoom({ type: "lab" }), makeReq())).not.toContain("TYPE");
  });
});

// ── ACCESS ──────────────────────────────────────────────────────

describe("ACCESS", () => {
  it("open access → no violation", () => {
    expect(codes(makeRoom({ access: "open" }), makeReq({ deptId: "OTHER" }))).not.toContain("ACCESS");
  });

  it("dept_only, same dept → no violation", () => {
    expect(
      codes(makeRoom({ access: "dept_only", deptId: "CS" }), makeReq({ deptId: "CS" })),
    ).not.toContain("ACCESS");
  });

  it("dept_only, different dept → ACCESS violation", () => {
    const violations = hardViolations(
      makeRoom({ access: "dept_only", deptId: "123e4567-e89b-12d3-a456-426614174000" }),
      makeReq({ deptId: "223e4567-e89b-12d3-a456-426614174000" }),
      ctx,
    );
    expect(violations.find((v) => v.code === "ACCESS")?.message).toBe("Only for its own department");
  });

  it("dept_only, requester has no dept → ACCESS violation", () => {
    expect(
      codes(makeRoom({ access: "dept_only", deptId: "CS" }), makeReq({ deptId: null })),
    ).toContain("ACCESS");
  });
});

// ── HOURS ───────────────────────────────────────────────────────

describe("HOURS", () => {
  it("within hours → no violation", () => {
    expect(codes(makeRoom(), makeReq())).not.toContain("HOURS");
  });

  it("outside hours → HOURS violation", () => {
    expect(
      codes(
        makeRoom({ hours: { open: "09:00", close: "15:00", days: [1, 2, 3, 4, 5, 6] } }),
        makeReq(), // 16:00-18:00
      ),
    ).toContain("HOURS");
  });

  it("closed day → HOURS violation", () => {
    expect(
      codes(
        makeRoom({ hours: { open: "08:00", close: "20:00", days: [1, 2, 3, 5, 6] } }), // no Thursday (4)
        makeReq(), // Thursday
      ),
    ).toContain("HOURS");
  });
});

// ── BLACKOUT ────────────────────────────────────────────────────

describe("BLACKOUT", () => {
  it("no blackout → no violation", () => {
    expect(codes(makeRoom(), makeReq())).not.toContain("BLACKOUT");
  });

  it("overlapping blackout → BLACKOUT violation", () => {
    expect(
      codes(
        makeRoom({
          blackouts: [{ start: "2026-10-01T15:00:00+05:30", end: "2026-10-01T17:00:00+05:30" }],
        }),
        makeReq(),
      ),
    ).toContain("BLACKOUT");
  });

  it("touching blackout (ends when request starts) → no violation", () => {
    expect(
      codes(
        makeRoom({
          blackouts: [{ start: "2026-10-01T14:00:00+05:30", end: "2026-10-01T16:00:00+05:30" }],
        }),
        makeReq(),
      ),
    ).not.toContain("BLACKOUT");
  });
});

// ── OVERLAP ─────────────────────────────────────────────────────

describe("OVERLAP", () => {
  it("no bookings → no violation", () => {
    expect(codes(makeRoom(), makeReq())).not.toContain("OVERLAP");
  });

  it("overlapping active booking → OVERLAP violation", () => {
    const violations = hardViolations(
      makeRoom({ booked: [{
        requestId: "123e4567-e89b-12d3-a456-426614174000",
        interval: { start: THU_4PM, end: THU_6PM },
        priority: 20,
        status: "approved",
        movable: true,
      }] }),
      makeReq(),
      ctx,
    );
    expect(violations.find((v) => v.code === "OVERLAP")?.message).toBe("Booked 16:00–18:00");
    expect(violations.map((v) => v.message).join(" ")).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it("touching booking (back-to-back) → no violation", () => {
    expect(
      codes(
        makeRoom({
          booked: [
            {
              requestId: "OTHER",
              interval: {
                start: "2026-10-01T18:00:00+05:30",
                end: "2026-10-01T20:00:00+05:30",
              },
              priority: 20,
              status: "approved",
              movable: true,
            },
          ],
        }),
        makeReq(),
      ),
    ).not.toContain("OVERLAP");
  });

  it("cancelled booking does not cause overlap", () => {
    expect(
      codes(
        makeRoom({
          booked: [
            {
              requestId: "CANC",
              interval: { start: THU_4PM, end: THU_6PM },
              priority: 20,
              status: "cancelled",
              movable: false,
            },
          ],
        }),
        makeReq(),
      ),
    ).not.toContain("OVERLAP");
  });
});

// ── isFeasible ──────────────────────────────────────────────────

describe("isFeasible", () => {
  it("returns true when no violations", () => {
    expect(isFeasible(makeRoom(), makeReq(), ctx)).toBe(true);
  });

  it("returns false when any violation exists", () => {
    expect(isFeasible(makeRoom({ capacity: 10 }), makeReq({ headcount: 100 }), ctx)).toBe(false);
  });
});
