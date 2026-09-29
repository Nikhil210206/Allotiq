import { describe, expect, it } from "vitest";
import { refillFreedSlot } from "../waitlist";
import { context, request, room, SLOT } from "./a10-fixtures";

describe("refillFreedSlot", () => {
  it("selects the highest-priority eligible request wholly contained in the freed interval", () => {
    const higher = request("high", 50, { interval: { start: "2026-10-01T16:30:00+05:30", end: "2026-10-01T17:30:00+05:30" } });
    const lower = request("low", 20, { interval: { start: "2026-10-01T16:00:00+05:30", end: "2026-10-01T18:00:00+05:30" } });
    const freed = { start: "2026-10-01T16:15:00+05:30", end: "2026-10-01T18:00:00+05:30" };

    const plan = refillFreedSlot("R1", freed, [lower, higher], context([room("R1")]));

    expect(plan).toMatchObject({
      kind: "waitlist_fill",
      moves: [{ requestId: higher.id, roomId: "R1", interval: higher.interval, status: "approved" }],
    });
  });

  it("uses createdAt then request ID as deterministic equal-priority tie breakers", () => {
    const later = request("z-later", 20, { createdAt: "2026-09-30T11:00:00+05:30" });
    const first = request("a-first", 20, { createdAt: "2026-09-30T10:00:00+05:30" });
    const last = request("z-first", 20, { createdAt: "2026-09-30T10:00:00+05:30" });
    const ctx = context([room("R1")]);
    expect(refillFreedSlot("R1", SLOT, [later, last, first], ctx)?.moves[0].requestId).toBe(first.id);
    expect(refillFreedSlot("R1", SLOT, [first, later, last], ctx)?.moves[0].requestId).toBe(first.id);
  });

  it("preserves half-open booking constraints, hard feasibility, and input immutability", () => {
    const interval = { start: "2026-10-01T16:30:00+05:30", end: "2026-10-01T17:30:00+05:30" };
    const fits = request("fits", 30, { interval });
    const tooLong = request("too-long", 40, { interval: SLOT });
    const roomWithBlackout = room("R1", { blackouts: [interval] });
    const ctx = context([roomWithBlackout]);
    const before = structuredClone(ctx);

    expect(refillFreedSlot("R1", { start: "2026-10-01T16:15:00+05:30", end: SLOT.end }, [fits, tooLong], ctx)).toBeNull();
    expect(ctx).toEqual(before);
  });

  it("returns null when no request fits the freed interval or room", () => {
    const item = request("too-large", 50, { headcount: 100 });
    expect(refillFreedSlot("R1", SLOT, [item], context([room("R1", { capacity: 50 })]))).toBeNull();
    expect(refillFreedSlot("missing", SLOT, [item], context([room("R1")]))).toBeNull();
  });
});
