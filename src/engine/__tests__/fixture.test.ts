import { describe, expect, it } from "vitest";
import { getSolver } from "../solvers";
import { overlaps } from "../time";
import { threeRequests, threeRoomCtx } from "./fixtures";

const roomOf = (res: ReturnType<ReturnType<typeof getSolver>["solve"]>, id: string) =>
  res.assignments.find((a) => a.requestId === id)?.roomId ?? null;

describe("half-open intervals", () => {
  it("back-to-back slots do not overlap", () => {
    expect(
      overlaps(
        { start: "2026-10-01T16:00:00+05:30", end: "2026-10-01T18:00:00+05:30" },
        { start: "2026-10-01T18:00:00+05:30", end: "2026-10-01T20:00:00+05:30" },
      ),
    ).toBe(false);
  });
});

// CP1 gate (Aaditya): remove .skip once the solvers are implemented (task A4).
describe("brief fixture: FCFS 2/3 vs engine 3/3", () => {
  it("FCFS with tightest fit places only 2 of 3", () => {
    const res = getSolver("fcfs").solve(threeRequests, threeRoomCtx);
    expect(res.metrics.placed).toBe(2);
    expect(roomOf(res, "coding")).toBe("B");
    expect(roomOf(res, "workshop")).toBe("A");
    expect(roomOf(res, "ai")).toBeNull();
  });

  it("the engine places all 3: Coding→C, Workshop→B, AI Club→A", () => {
    const res = getSolver("bnb").solve(threeRequests, threeRoomCtx);
    expect(res.metrics.placed).toBe(3);
    expect(roomOf(res, "coding")).toBe("C");
    expect(roomOf(res, "workshop")).toBe("B");
    expect(roomOf(res, "ai")).toBe("A");
  });

  it("is deterministic", () => {
    const runs = Array.from({ length: 10 }, () => getSolver("bnb").solve(threeRequests, threeRoomCtx).assignments);
    for (const r of runs) expect(r).toEqual(runs[0]);
  });
});
