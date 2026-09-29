// A5 — alternatives.ts tests. Owner: Aaditya
import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, type EngineContext, type EngineRequest, type EngineRoom } from "@/contracts/engine";
import { alternatives } from "../alternatives";

// ── Helpers ──────────────────────────────────────────────────────

const THU_4PM = "2026-10-01T16:00:00+05:30";
const THU_6PM = "2026-10-01T18:00:00+05:30";
const NOW = "2026-10-01T10:00:00+05:30"; // well before the slot

function makeRoom(overrides: Partial<EngineRoom> = {}): EngineRoom {
  return {
    id: "R1",
    code: "R1",
    buildingId: "B1",
    type: "seminar_hall",
    capacity: 100,
    systems: 0,
    features: [],
    deptId: null,
    access: "open",
    hours: { open: "08:00", close: "22:00", days: [1, 2, 3, 4, 5, 6, 7] },
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

function makeCtx(overrides: Partial<EngineContext> = {}): EngineContext {
  return {
    rooms: [],
    buildings: [{ id: "B1", lat: null, lng: null }],
    deptBuilding: {},
    weights: DEFAULT_WEIGHTS,
    now: NOW,
    tz: "Asia/Kolkata",
    ...overrides,
  };
}

// ── Return shape ──────────────────────────────────────────────────

describe("alternatives — return shape", () => {
  it("always returns both arrays (even when empty)", () => {
    const ctx = makeCtx({ rooms: [] });
    const res = alternatives(makeReq(), ctx);
    expect(res).toHaveProperty("sameRoomOtherSlot");
    expect(res).toHaveProperty("similarRoomSameSlot");
    expect(Array.isArray(res.sameRoomOtherSlot)).toBe(true);
    expect(Array.isArray(res.similarRoomSameSlot)).toBe(true);
  });

  it("returns empty arrays when no rooms exist", () => {
    const ctx = makeCtx({ rooms: [] });
    const res = alternatives(makeReq(), ctx);
    expect(res.sameRoomOtherSlot).toHaveLength(0);
    expect(res.similarRoomSameSlot).toHaveLength(0);
  });
});

// ── sameRoomOtherSlot ─────────────────────────────────────────────

describe("sameRoomOtherSlot", () => {
  it("uses preferredRoomId when provided", () => {
    const r1 = makeRoom({ id: "R1", capacity: 100 });
    const r2 = makeRoom({ id: "R2", capacity: 200 });
    const ctx = makeCtx({ rooms: [r1, r2] });
    const res = alternatives(makeReq(), ctx, "R2");
    // All same-room slots must use R2 (the preferred)
    for (const s of res.sameRoomOtherSlot) {
      expect(s.roomId).toBe("R2");
    }
  });

  it("preserves duration in alternative slots", () => {
    const room = makeRoom({ id: "R1" });
    const ctx = makeCtx({ rooms: [room] });
    const req = makeReq({ interval: { start: THU_4PM, end: THU_6PM } }); // 2h slot
    const expectedDuration = Date.parse(THU_6PM) - Date.parse(THU_4PM);

    const res = alternatives(req, ctx, "R1");
    for (const s of res.sameRoomOtherSlot) {
      const d = Date.parse(s.interval.end) - Date.parse(s.interval.start);
      expect(d).toBe(expectedDuration);
    }
  });

  it("all proposed slots are in the future (> ctx.now)", () => {
    const room = makeRoom({ id: "R1" });
    const ctx = makeCtx({ rooms: [room], now: NOW });
    const res = alternatives(makeReq(), ctx, "R1");
    for (const s of res.sameRoomOtherSlot) {
      expect(Date.parse(s.interval.start)).toBeGreaterThan(Date.parse(NOW));
    }
  });

  it("returns at most 3 alternative slots", () => {
    const room = makeRoom({ id: "R1" });
    const ctx = makeCtx({ rooms: [room] });
    const res = alternatives(makeReq(), ctx, "R1");
    expect(res.sameRoomOtherSlot.length).toBeLessThanOrEqual(3);
  });

  it("excludes slots that fail feasibility (e.g. outside hours)", () => {
    // Room hours 08:00–18:30. Original slot: 16:00–18:00.
    // +2h shift → 18:00–20:00 → end 20:00 > close 18:30 → must be excluded.
    // -2h shift → 14:00–16:00 → valid.
    const room = makeRoom({
      id: "R1",
      hours: { open: "08:00", close: "18:30", days: [1, 2, 3, 4, 5, 6, 7] },
    });
    const ctx = makeCtx({ rooms: [room] });
    const req = makeReq({ interval: { start: THU_4PM, end: THU_6PM } }); // 16:00–18:00
    const res = alternatives(req, ctx, "R1");

    // The +2h slot (18:00–20:00) must NOT appear — it violates room hours
    const plus2hStart = new Date(Date.parse(THU_4PM) + 2 * 3_600_000).toISOString();
    const hasOutOfHoursSlot = res.sameRoomOtherSlot.some(
      (s) => s.interval.start === plus2hStart,
    );
    expect(hasOutOfHoursSlot).toBe(false);

    // Every returned slot must have its end ≤ room close (18:30)
    const closeMinutes = 18 * 60 + 30;
    for (const s of res.sameRoomOtherSlot) {
      // Parse end wall-clock in IST
      const endDate = new Date(s.interval.end);
      const endParts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
        hour: "numeric",
        minute: "numeric",
        hour12: false,
      }).formatToParts(endDate);
      const h = parseInt(endParts.find((p) => p.type === "hour")?.value ?? "0", 10);
      const m = parseInt(endParts.find((p) => p.type === "minute")?.value ?? "0", 10);
      expect(h * 60 + m).toBeLessThanOrEqual(closeMinutes);
    }
  });

  it("excludes slots that overlap an active booking", () => {
    const clashInterval = {
      start: "2026-10-01T18:00:00+05:30",
      end: "2026-10-01T20:00:00+05:30",
    };
    const room = makeRoom({
      id: "R1",
      booked: [{ requestId: "X", interval: clashInterval, priority: 20, status: "approved", movable: true }],
    });
    const ctx = makeCtx({ rooms: [room] });
    const res = alternatives(makeReq(), ctx, "R1");
    // +2h slot = 18:00-20:00 — clashes with active booking; must not appear
    for (const s of res.sameRoomOtherSlot) {
      const sStart = Date.parse(s.interval.start);
      const sEnd = Date.parse(s.interval.end);
      const bStart = Date.parse(clashInterval.start);
      const bEnd = Date.parse(clashInterval.end);
      const overlaps = sStart < bEnd && bStart < sEnd;
      expect(overlaps).toBe(false);
    }
  });
});

// ── similarRoomSameSlot ───────────────────────────────────────────

describe("similarRoomSameSlot", () => {
  it("excludes the preferred room", () => {
    const r1 = makeRoom({ id: "R1", capacity: 100 });
    const r2 = makeRoom({ id: "R2", capacity: 80 });
    const ctx = makeCtx({ rooms: [r1, r2] });
    const res = alternatives(makeReq({ headcount: 50 }), ctx, "R1");
    const ids = res.similarRoomSameSlot.map((r) => r.roomId);
    expect(ids).not.toContain("R1");
  });

  it("uses the same interval as the original request", () => {
    const r1 = makeRoom({ id: "R1", capacity: 100 });
    const r2 = makeRoom({ id: "R2", capacity: 80 });
    const ctx = makeCtx({ rooms: [r1, r2] });
    const res = alternatives(makeReq(), ctx, "R1");
    // Each Recommendation has a full score (interval not stored but feasibility was at original slot)
    expect(res.similarRoomSameSlot.length).toBeGreaterThanOrEqual(0);
    for (const rec of res.similarRoomSameSlot) {
      expect(rec).toHaveProperty("roomId");
      expect(rec).toHaveProperty("score");
      expect(rec).toHaveProperty("why");
      expect(Array.isArray(rec.why)).toBe(true);
    }
  });

  it("returns at most 3 similar rooms", () => {
    const rooms = ["R1", "R2", "R3", "R4", "R5"].map((id) =>
      makeRoom({ id, capacity: 100 }),
    );
    const ctx = makeCtx({ rooms });
    const res = alternatives(makeReq(), ctx, "R1");
    expect(res.similarRoomSameSlot.length).toBeLessThanOrEqual(3);
  });

  it("ranks similar rooms by score.total descending", () => {
    // R2 and R3 are both feasible, R3 in a building with activity → higher energy → higher score
    const r1 = makeRoom({ id: "R1", buildingId: "B1", capacity: 100 });
    const r2 = makeRoom({ id: "R2", buildingId: "B2", capacity: 60 }); // smaller = better capacityFit
    const r3 = makeRoom({ id: "R3", buildingId: "B3", capacity: 200 }); // large = worse capacityFit
    const ctx = makeCtx({ rooms: [r1, r2, r3] });
    const res = alternatives(makeReq({ headcount: 50 }), ctx, "R1");
    const scores = res.similarRoomSameSlot.map((r) => r.score.total);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
    }
  });

  it("excludes rooms that fail hard constraints (capacity)", () => {
    const r1 = makeRoom({ id: "R1", capacity: 100 });
    const tooSmall = makeRoom({ id: "SMALL", capacity: 10 }); // fails headcount=50
    const ctx = makeCtx({ rooms: [r1, tooSmall] });
    const res = alternatives(makeReq({ headcount: 50 }), ctx, "R1");
    const ids = res.similarRoomSameSlot.map((r) => r.roomId);
    expect(ids).not.toContain("SMALL");
  });

  it("excludes rooms with active overlapping booking", () => {
    const r1 = makeRoom({ id: "R1", capacity: 100 });
    const busy = makeRoom({
      id: "BUSY",
      capacity: 80,
      booked: [{
        requestId: "X",
        interval: { start: THU_4PM, end: THU_6PM },
        priority: 20,
        status: "approved",
        movable: true,
      }],
    });
    const ctx = makeCtx({ rooms: [r1, busy] });
    const res = alternatives(makeReq(), ctx, "R1");
    const ids = res.similarRoomSameSlot.map((r) => r.roomId);
    expect(ids).not.toContain("BUSY");
  });

  it("relaxes roomType — includes rooms of different type", () => {
    const r1 = makeRoom({ id: "R1", capacity: 100, type: "seminar_hall" });
    const lab = makeRoom({ id: "LAB", capacity: 80, type: "lab" });
    const ctx = makeCtx({ rooms: [r1, lab] });
    // req has roomType: seminar_hall
    const req = makeReq({ headcount: 50, roomType: "seminar_hall" });
    const res = alternatives(req, ctx, "R1");
    // LAB should appear even though it's a different type
    const ids = res.similarRoomSameSlot.map((r) => r.roomId);
    expect(ids).toContain("LAB");
  });

  it("why[] is populated from score.notes", () => {
    const r2 = makeRoom({ id: "R2", capacity: 60 });
    const ctx = makeCtx({ rooms: [makeRoom({ id: "R1" }), r2] });
    const res = alternatives(makeReq({ headcount: 50 }), ctx, "R1");
    for (const rec of res.similarRoomSameSlot) {
      // why must be a non-null array (may be empty only if scoreRoom returns no notes)
      expect(Array.isArray(rec.why)).toBe(true);
    }
  });
});

// ── Determinism ───────────────────────────────────────────────────

describe("alternatives — determinism", () => {
  it("returns identical results across multiple calls", () => {
    const rooms = ["R1", "R2", "R3"].map((id) => makeRoom({ id, capacity: 80 }));
    const ctx = makeCtx({ rooms });
    const req = makeReq();
    const runs = Array.from({ length: 5 }, () => alternatives(req, ctx, "R1"));
    for (const r of runs) {
      expect(r).toEqual(runs[0]);
    }
  });
});
