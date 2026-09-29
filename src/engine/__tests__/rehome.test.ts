import { describe, expect, it } from "vitest";
import { rehomeRequests, solveRehome } from "../rehome";
import { booking, context, request, room } from "./a10-fixtures";

describe("rehomeRequests", () => {
  it("moves an existing movable booking to another feasible room at the same interval", () => {
    const item = request("booked", 30);
    const ctx = context([
      room("R1", { capacity: 80, booked: [booking(item.id, item.priority)] }),
      room("R2", { capacity: 25 }),
    ]);

    const plan = rehomeRequests([item], ctx);

    expect(plan?.kind).toBe("rehome");
    expect(plan?.moves).toEqual([{ requestId: item.id, roomId: "R2", interval: item.interval }]);
    expect(plan?.moves[0].interval).toEqual(item.interval);
  });

  it("does not rehome checked-in requests", () => {
    const item = request("checked-in", 30);
    const ctx = context([room("R1", { booked: [booking(item.id, item.priority, "checked_in")] }), room("R2")]);
    expect(rehomeRequests([item], ctx)).toBeNull();
  });

  it("returns no plan for an impossible or timed-out rehome", () => {
    const item = request("booked", 30);
    const fixed = context([room("R1", { booked: [booking(item.id, item.priority)] })]);
    expect(rehomeRequests([item], fixed)).toBeNull();

    const feasible = context([room("R1", { booked: [booking(item.id, item.priority)] }), room("R2")]);
    expect(solveRehome([item], feasible, [item.id], { nodeLimit: 0 })).toBeNull();
  });

  it("is deterministic and does not mutate the request or context", () => {
    const item = request("booked", 30);
    const ctx = context([room("R1", { booked: [booking(item.id, item.priority)] }), room("R2"), room("R3")]);
    const beforeContext = structuredClone(ctx);
    const beforeRequest = structuredClone(item);
    const first = rehomeRequests([item], ctx);

    expect(rehomeRequests([item], ctx)).toEqual(first);
    expect(ctx).toEqual(beforeContext);
    expect(item).toEqual(beforeRequest);
  });
});
