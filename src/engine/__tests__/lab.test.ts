import { describe, expect, it } from "vitest";
import { runLabScenario } from "../lab";
import { threeRequests, threeRoomCtx } from "./fixtures";

describe("runLabScenario", () => {
  it("runs the existing FCFS and B&B solvers on the brief fixture and explains their differences", () => {
    const result = runLabScenario(threeRequests, threeRoomCtx, ["fcfs", "bnb"]);

    expect(result.results.map((item) => item.solver)).toEqual(["fcfs", "bnb"]);
    expect(result.results[0].metrics.placed).toBe(2);
    expect(result.results[1].metrics.placed).toBe(3);
    expect(result.results[1].assignments.map((item) => [item.requestId, item.roomId])).toEqual([
      ["coding", "C"], ["workshop", "B"], ["ai", "A"],
    ]);
    expect(result.explanation).toContain("FCFS placed 2/3; B&B placed 3/3");
    expect(result.explanation).toContain("Coding Club moved from B to C");
  });

  it("returns deterministic assignments and leaves the original context and requests unchanged", () => {
    const contextBefore = structuredClone(threeRoomCtx);
    const requestsBefore = structuredClone(threeRequests);
    const first = runLabScenario(threeRequests, threeRoomCtx, ["fcfs", "bnb"]);
    const second = runLabScenario(threeRequests, threeRoomCtx, ["fcfs", "bnb"]);

    expect(first.results.map((item) => item.assignments)).toEqual(second.results.map((item) => item.assignments));
    expect(first.explanation).toBe(second.explanation);
    expect(threeRoomCtx).toEqual(contextBefore);
    expect(threeRequests).toEqual(requestsBefore);
  });

  it("preserves infeasible assignments and hard-constraint reasons from the production solvers", () => {
    const blockedContext = {
      ...threeRoomCtx,
      rooms: threeRoomCtx.rooms.map((room) => ({ ...room, capacity: 40 })),
    };
    const result = runLabScenario([threeRequests[2]], blockedContext, ["bnb"]);
    const assignment = result.results[0].assignments[0];

    expect(assignment.roomId).toBeNull();
    expect(blockedContext.rooms.every((room) => room.capacity < threeRequests[2].headcount)).toBe(true);
    expect(result.results[0].metrics.placed).toBe(0);
  });

  it("honors existing bookings and blackouts without mutating them", () => {
    const blockedContext = {
      ...threeRoomCtx,
      rooms: threeRoomCtx.rooms.map((room, index) => index === 0
        ? {
            ...room,
            blackouts: [threeRequests[0].interval],
            booked: [{ requestId: "existing", interval: threeRequests[0].interval, priority: 10, status: "approved" as const, movable: true }],
          }
        : room),
    };
    const before = structuredClone(blockedContext);
    const result = runLabScenario([threeRequests[0]], blockedContext, ["bnb"]);

    expect(result.results[0].assignments[0].roomId).not.toBe(blockedContext.rooms[0].id);
    expect(blockedContext).toEqual(before);
  });
});
