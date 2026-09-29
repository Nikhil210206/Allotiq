import { describe, expect, it } from "vitest";
import { previewDisruption, affectedDisruptionRequests } from "../disruption";
import { booking, context, request, room, SLOT, NOW } from "./a10-fixtures";

const blackout = SLOT;
const nextSlot = { start: "2026-10-01T18:00:00+05:30", end: "2026-10-01T20:00:00+05:30" };

describe("A11 disruption planning", () => {
  it("rehomes a single affected booking to a feasible room at the same time", () => {
    const affected = request("affected", 40);
    const ctx = context([room("closed", { booked: [booking(affected.id, affected.priority)] }), room("replacement")]);
    const plan = previewDisruption("closed", blackout, ctx, [affected]);

    expect(plan.moves).toEqual([{ requestId: affected.id, roomId: "replacement", interval: SLOT }]);
    expect(plan.unplaced).toEqual([]);
    expect(ctx.rooms[0].blackouts).toEqual([]);
    expect(ctx.rooms[0].booked).toHaveLength(1);
    expect(plan).not.toHaveProperty("inserts");
  });

  it("rejects destination rooms that violate hard constraints", () => {
    const affected = request("affected", 40, { headcount: 35, minSystems: 4, features: ["smart_board"], roomType: "lab", deptId: "dept-a" });
    const ctx = context([
      room("closed", { booked: [booking(affected.id, affected.priority)] }),
      room("too-small", { capacity: 20, systems: 0, features: [], type: "classroom" }),
      room("wrong-access", { access: "dept_only", deptId: "dept-b", systems: 8, features: ["smart_board"], type: "lab" }),
      room("wrong-hours", { hours: { open: "17:00", close: "20:00", days: [4] }, systems: 8, features: ["smart_board"], type: "lab" }),
      room("blocked", { blackouts: [SLOT], systems: 8, features: ["smart_board"], type: "lab" }),
      room("valid", { systems: 8, features: ["smart_board"], type: "lab", deptId: "dept-a" }),
    ]);

    const plan = previewDisruption("closed", blackout, ctx, [affected]);
    expect(plan.moves).toEqual([{ requestId: affected.id, roomId: "valid", interval: SLOT }]);
    expect(plan.unplaced).toEqual([]);
  });

  it("explicitly returns an unplaced request when no feasible rehome or offer exists", () => {
    const affected = request("affected", 20);
    const ctx = context([room("closed", { hours: { open: "16:00", close: "18:00", days: [4] }, booked: [booking(affected.id, affected.priority)] })]);
    const plan = previewDisruption("closed", blackout, ctx, [affected]);

    expect(plan.moves).toEqual([]);
    expect(plan.unplaced.map((item) => item.requestId)).toEqual([affected.id]);
    expect(plan.summary).toContain("cannot be applied");
  });

  it("does not claim a complete plan when affected request details are missing", () => {
    const affected = request("missing-details", 20);
    const ctx = context([room("closed", { booked: [booking(affected.id, affected.priority)] })]);
    const plan = previewDisruption("closed", blackout, ctx);

    expect(plan.moves).toEqual([]);
    expect(plan.unplaced).toEqual([{ requestId: affected.id, alternatives: { sameRoomOtherSlot: [], similarRoomSameSlot: [] } }]);
    expect(plan.summary).toContain("incomplete");
  });

  it("marks only active bookings in the affected room that overlap the blackout", () => {
    const ctx = context([
      room("closed", { booked: [
        booking("overlap", 20),
        booking("ends-at-start", 20, "approved", { start: "2026-10-01T14:00:00+05:30", end: SLOT.start }),
        booking("starts-at-end", 20, "approved", { start: SLOT.end, end: "2026-10-01T20:00:00+05:30" }),
        { ...booking("waitlisted", 20), status: "waitlisted" as const },
      ] }),
      room("other", { booked: [booking("other-room", 20)] }),
    ]);

    expect(affectedDisruptionRequests("closed", blackout, ctx).map(({ booking: item }) => item.requestId)).toEqual(["overlap"]);
    expect(affectedDisruptionRequests("other", blackout, ctx).map(({ booking: item }) => item.requestId)).toEqual(["other-room"]);
  });

  it("preserves two sequential unaffected allocations and moves both affected requests together", () => {
    const firstInterval = { start: "2026-10-01T14:00:00+05:30", end: "2026-10-01T15:00:00+05:30" };
    const secondInterval = { start: "2026-10-01T15:00:00+05:30", end: "2026-10-01T16:00:00+05:30" };
    const first = request("first", 50, { interval: firstInterval });
    const second = request("second", 20, { interval: secondInterval });
    const outside = request("outside", 20, { interval: nextSlot });
    const ctx = context([room("closed", {
      booked: [booking(first.id, first.priority, "approved", firstInterval), booking(second.id, second.priority, "pending", secondInterval)],
    }), room("replacement", { booked: [booking(outside.id, outside.priority, "approved", nextSlot)] })]);
    const plan = previewDisruption("closed", { start: firstInterval.start, end: secondInterval.end }, ctx, [first, second]);

    expect(plan.moves.map(({ requestId }) => requestId)).toEqual(["first", "second"]);
    expect(plan.moves.every(({ roomId }) => roomId === "replacement")).toBe(true);
    expect(plan.moves.some(({ requestId }) => requestId === outside.id)).toBe(false);
  });

  it("prefers the higher-priority request in a competing rehome and offers the other", () => {
    const high = request("high", 50);
    const low = request("low", 20);
    // This deliberately models inconsistent imported data; the solver still must
    // resolve the collision deterministically without creating a third overlap.
    const ctx = context([
      room("closed", { booked: [booking(high.id, high.priority), booking(low.id, low.priority)] }),
      room("replacement"),
    ]);
    const plan = previewDisruption("closed", blackout, ctx, [low, high]);

    expect(plan.moves.find((move) => move.requestId === high.id)?.roomId).toBe("replacement");
    expect(plan.moves.find((move) => move.requestId === low.id)).toMatchObject({ roomId: null, status: "bumped" });
    expect(plan.unplaced).toEqual([]);
  });

  it("keeps a checked-in booking immovable and blocks the whole apply plan", () => {
    const checkedIn = request("checked-in", 50);
    const ctx = context([room("closed", { booked: [booking(checkedIn.id, checkedIn.priority, "checked_in")] }), room("replacement")]);
    const plan = previewDisruption("closed", blackout, ctx, [checkedIn]);

    expect(plan.moves).toEqual([]);
    expect(plan.unplaced.map((item) => item.requestId)).toEqual([checkedIn.id]);
    expect(ctx.rooms[0].booked[0].movable).toBe(false);
  });

  it("uses the existing A10 bump rules when a rehome is blocked by a lower-priority booking", () => {
    const affected = request("affected", 50);
    const blocker = request("blocker", 20);
    const ctx = context([
      room("closed", { booked: [booking(affected.id, affected.priority)] }),
      room("replacement", { booked: [booking(blocker.id, blocker.priority)] }),
    ], { now: NOW });
    const plan = previewDisruption("closed", blackout, ctx, [affected, blocker]);

    expect(plan.moves.find((move) => move.requestId === affected.id)?.roomId).toBe("replacement");
    expect(plan.moves.find((move) => move.requestId === blocker.id)).toMatchObject({ roomId: null, status: "bumped" });
    expect(plan.moves.find((move) => move.requestId === blocker.id)?.offers).toBeDefined();
  });

  it("keeps an approved request within the 24-hour notice period blocked if it cannot rehome", () => {
    const soon = { start: "2026-10-02T09:00:00+05:30", end: "2026-10-02T10:00:00+05:30" };
    const affected = request("soon", 20, { interval: soon });
    const ctx = context([room("closed", { booked: [booking(affected.id, affected.priority, "approved", soon)] })], { now: "2026-10-01T10:00:00+05:30" });
    const plan = previewDisruption("closed", soon, ctx, [affected]);

    expect(plan.moves).toEqual([]);
    expect(plan.unplaced.map((item) => item.requestId)).toEqual([affected.id]);
  });

  it("offers a bumped status and alternatives for an approved request more than 24 hours away", () => {
    const future = { start: "2026-10-03T09:00:00+05:30", end: "2026-10-03T10:00:00+05:30" };
    const affected = request("future-approved", 20, { interval: future });
    const ctx = context([room("closed", { booked: [booking(affected.id, affected.priority, "approved", future)] })], { now: NOW });
    const plan = previewDisruption("closed", future, ctx, [affected]);

    expect(plan.moves).toMatchObject([{ requestId: affected.id, roomId: null, status: "bumped" }]);
    expect(plan.moves[0].offers?.sameRoomOtherSlot.length).toBeGreaterThan(0);
    expect(plan.unplaced).toEqual([]);
  });

  it("returns no partial moves when B&B times out", () => {
    const affected = request("affected", 20);
    const ctx = context([room("closed", { booked: [booking(affected.id, affected.priority)] }), room("replacement")]);
    const plan = previewDisruption("closed", blackout, ctx, [affected], { timeoutMs: 0 });

    expect(plan.moves).toEqual([]);
    expect(plan.unplaced.map((item) => item.requestId)).toEqual([affected.id]);
    expect(plan.summary).toContain("no partial plan");
  });

  it("is deterministic and does not mutate input requests or context", () => {
    const affected = request("affected", 20);
    const ctx = context([room("closed", { booked: [booking(affected.id, affected.priority)] }), room("replacement")]);
    const beforeContext = structuredClone(ctx);
    const beforeRequest = structuredClone(affected);

    const first = previewDisruption("closed", blackout, ctx, [affected]);
    const second = previewDisruption("closed", blackout, ctx, [affected]);

    expect(second).toEqual(first);
    expect(ctx).toEqual(beforeContext);
    expect(affected).toEqual(beforeRequest);
  });
});
