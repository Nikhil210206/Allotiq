import { describe, expect, it } from "vitest";
import type { EngineRoom } from "@/contracts/engine";
import { hardViolations } from "../feasibility";
import { tryBump } from "../bump";
import { booking, context, NOW, request, room, SLOT } from "./a10-fixtures";

const hardConstraintRooms: [string, Partial<EngineRoom>][] = [
  ["systems", { systems: 1 }],
  ["features", { features: [] }],
  ["room type", { type: "classroom" }],
  ["department access", { access: "dept_only", deptId: "other-dept" }],
  ["operating hours", { hours: { open: "17:00", close: "20:00", days: [4] } }],
  ["blackout", { blackouts: [SLOT] }],
];

describe("tryBump", () => {
  it("places the higher-priority request and bumps a lower-priority pending blocker with alternatives", () => {
    const high = request("high", 50);
    const low = request("low", 20);
    const ctx = context([room("R1", { booked: [booking(low.id, low.priority)] })]);

    const plan = tryBump(high, ctx, [low]);

    expect(plan?.kind).toBe("bump_with_offer");
    expect(plan?.moves.find((move) => move.requestId === high.id)?.roomId).toBe("R1");
    expect(plan?.moves.find((move) => move.requestId === low.id)).toMatchObject({
      roomId: null,
      status: "bumped",
      interval: SLOT,
      offers: { sameRoomOtherSlot: expect.any(Array), similarRoomSameSlot: expect.any(Array) },
    });
    expect(plan?.moves.find((move) => move.requestId === low.id)?.offers?.sameRoomOtherSlot.length).toBeGreaterThan(0);
  });

  it("keeps the lower-priority request placed when another room avoids a bump", () => {
    const high = request("high", 50);
    const low = request("low", 20);
    const ctx = context([
      room("R1", { booked: [booking(low.id, low.priority)] }),
      room("R2"),
    ]);

    const plan = tryBump(high, ctx, [low]);

    expect(plan).not.toBeNull();
    expect(plan?.moves.find((move) => move.requestId === low.id)?.roomId).not.toBeNull();
    expect(plan?.moves.find((move) => move.requestId === low.id)?.status).toBeUndefined();
  });

  it("never displaces a checked-in request", () => {
    const high = request("high", 50);
    const low = request("low", 10);
    const ctx = context([room("R1", { booked: [booking(low.id, low.priority, "checked_in")] })]);
    expect(tryBump(high, ctx, [low])).toBeNull();
  });

  it("does not bump equal-priority requests and makes the result deterministic", () => {
    const high = request("high", 40);
    const equal = request("equal", 40);
    const ctx = context([room("R1", { booked: [booking(equal.id, equal.priority)] })]);
    expect(tryBump(high, ctx, [equal])).toBeNull();
    expect(tryBump(high, ctx, [equal])).toBeNull();
  });

  it("prefers same-time rehoming and bumps only blockers B&B cannot place", () => {
    const high = request("high", 50);
    const first = request("first", 20);
    const second = request("second", 10);
    const ctx = context([
      room("R1", { booked: [booking(first.id, first.priority)] }),
      room("R2", { booked: [booking(second.id, second.priority)] }),
    ]);

    const plan = tryBump(high, ctx, [first, second]);

    expect(plan?.kind).toBe("bump_with_offer");
    expect(plan?.moves.find((move) => move.requestId === high.id)?.roomId).toBeTruthy();
    expect(plan?.moves.filter((move) => move.status === "bumped")).toHaveLength(1);
    expect(plan?.moves.filter((move) => move.status === undefined && move.requestId !== high.id)).toHaveLength(1);
  });

  it("cannot bump an approved booking inside the 24-hour notice window", () => {
    const high = request("high", 50);
    const approved = request("approved", 20);
    const ctx = context([room("R1", { booked: [booking(approved.id, approved.priority, "approved", approved.interval)] })]);
    expect(tryBump(high, ctx, [approved])).toBeNull();
  });

  it("may bump an approved lower-priority booking when its start is more than 24 hours away", () => {
    const high = request("high", 50, { interval: { start: "2026-10-04T16:00:00+05:30", end: "2026-10-04T18:00:00+05:30" } });
    const approved = request("approved", 20, { interval: high.interval });
    const ctx = context([room("R1", { booked: [booking(approved.id, approved.priority, "approved", approved.interval)] })]);
    expect(tryBump(high, ctx, [approved])?.moves.find((move) => move.requestId === approved.id)?.status).toBe("bumped");
  });

  it("does not create a placement that violates a hard constraint", () => {
    const high = request("high", 50, { headcount: 100, features: ["projector"] });
    const ctx = context([room("R1", { capacity: 60 })]);
    expect(tryBump(high, ctx)).toBeNull();
  });

  it.each(hardConstraintRooms)("does not bypass the %s constraint", (_name, roomOverrides) => {
    const high = request("high", 50, {
      minSystems: 5,
      features: ["projector"],
      roomType: "lab",
      deptId: "request-dept",
    });
    const constrained = room("R1", { systems: 10, features: ["projector"], type: "lab", ...roomOverrides });
    expect(tryBump(high, context([constrained]))).toBeNull();
  });

  it("does not bump a blocker when it has no legal alternative offer", () => {
    const high = request("high", 50);
    const low = request("low", 20);
    const onlySlotRoom = room("R1", {
      hours: { open: "16:00", close: "18:00", days: [4] },
      booked: [booking(low.id, low.priority)],
    });
    expect(tryBump(high, context([onlySlotRoom]), [low])).toBeNull();
  });

  it("returns no plan when the required request cannot be placed or the solver times out", () => {
    const high = request("high", 50, { headcount: 100 });
    expect(tryBump(high, context([room("R1")]))).toBeNull();

    const feasible = request("feasible", 50);
    expect(tryBump(feasible, context([room("R1")]), [], { nodeLimit: 0 })).toBeNull();
  });

  it("is deterministic and never mutates request or context inputs", () => {
    const high = request("high", 50);
    const low = request("low", 20);
    const ctx = context([room("R1", { booked: [booking(low.id, low.priority)] }), room("R2")]);
    const beforeContext = structuredClone(ctx);
    const beforeRequests = structuredClone([high, low]);

    const first = tryBump(high, ctx, [low]);
    const second = tryBump(high, ctx, [low]);
    expect(first).toEqual(second);
    expect(ctx).toEqual(beforeContext);
    expect([high, low]).toEqual(beforeRequests);
    const isolated = {
      ...ctx,
      rooms: ctx.rooms.map((candidate) => ({
        ...candidate,
        booked: candidate.booked.filter((booking) => booking.requestId !== high.id && booking.requestId !== low.id),
      })),
    };
    for (const move of first?.moves ?? []) {
      if (!move.roomId) continue;
      const targetRoom = isolated.rooms.find((candidate) => candidate.id === move.roomId)!;
      const targetRequest = move.requestId === high.id ? high : low;
      expect(hardViolations(targetRoom, { ...targetRequest, interval: move.interval }, isolated)).toEqual([]);
    }
    expect(Date.parse(NOW)).toBeLessThan(Date.parse(high.interval.start));
  });
});
