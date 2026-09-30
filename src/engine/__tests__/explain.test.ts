import { describe, expect, it } from "vitest";
import type { EngineRequest, ScoreBreakdown, SolveResult } from "@/contracts/engine";
import { counterfactual, whyNot, whyThisRoom } from "../explain";

const defaultWeights = {
  capacityFit: 0.3,
  featureMatch: 0.1,
  proximity: 0.2,
  scarcity: 0.2,
  preference: 0.1,
  energy: 0.1,
};

function makeScore(notes: string[] = [], total = 80, wastedSeats = 0): ScoreBreakdown {
  return {
    capacityFit: 1,
    featureMatch: 1,
    proximity: 1,
    scarcity: 1,
    preference: 0,
    energy: 0,
    weights: defaultWeights,
    total,
    wastedSeats,
    notes,
  };
}

function makeRequest(
  id: string,
  label?: string,
  headcount = 20,
  deptId: string | null = null,
): EngineRequest {
  return {
    id,
    label,
    requesterId: "requester-1",
    deptId,
    headcount,
    minSystems: 0,
    features: [],
    interval: { start: "2026-10-01T14:00:00+05:30", end: "2026-10-01T16:00:00+05:30" },
    priority: 20,
    createdAt: "2026-09-29T10:00:00+05:30",
    history: {},
  };
}

function makeSolveResult(
  solver: SolveResult["solver"],
  assignments: SolveResult["assignments"],
  placed?: number,
  total?: number,
): SolveResult {
  const p = placed ?? assignments.filter((a) => a.roomId !== null).length;
  const t = total ?? assignments.length;
  return {
    solver,
    assignments,
    metrics: {
      placed: p,
      total: t,
      priorityPlaced: p,
      priorityTotal: t,
      seatsWasted: 0,
      buildingsActive: 1,
      objective: 100,
      ms: 5,
      nodes: 10,
    },
    timedOut: false,
    trace: [],
  };
}

describe("whyThisRoom & whyNot", () => {
  it("returns notes when present or a default requirement message", () => {
    expect(whyThisRoom(makeScore(["Fits 50 seats", "Has projector"]))).toEqual([
      "Fits 50 seats",
      "Has projector",
    ]);
    expect(whyThisRoom(makeScore([]))).toEqual(["Meets the request requirements"]);
  });

  it("formats whyNot exclusion reasons cleanly", () => {
    expect(
      whyNot("Room 101", [
        { code: "CAPACITY", message: "Only 30 seats (needs 50)" },
        { code: "FEATURE", message: "Missing projector" },
      ]),
    ).toBe("Room 101: Only 30 seats (needs 50); Missing projector");

    expect(whyNot("Room 101", [])).toBe("Room 101 is available");
  });
});

describe("counterfactual", () => {
  it("explains no changes when assignments are identical", () => {
    const req = makeRequest("req-1", "Coding Club");
    const fcfs = makeSolveResult("fcfs", [{ requestId: "req-1", roomId: "Room-A" }]);
    const engine = makeSolveResult("bnb", [{ requestId: "req-1", roomId: "Room-A" }]);

    const output = counterfactual(fcfs, engine, [req]);
    expect(output).toBe("FCFS placed 1/1; B&B placed 1/1. Allocations are identical.");
  });

  it("explains when no requests could be placed by either solver", () => {
    const req = makeRequest("req-1", "Coding Club");
    const fcfs = makeSolveResult("fcfs", [{ requestId: "req-1", roomId: null }]);
    const engine = makeSolveResult("bnb", [{ requestId: "req-1", roomId: null }]);

    const output = counterfactual(fcfs, engine, [req]);
    expect(output).toBe("FCFS placed 0/1; B&B placed 0/1. No requests were placed.");
  });

  it("handles room movement with human-readable labels", () => {
    const req = makeRequest("req-1", "Coding Club");
    const fcfs = makeSolveResult("fcfs", [{ requestId: "req-1", roomId: "Room-B" }]);
    const engine = makeSolveResult("bnb", [{ requestId: "req-1", roomId: "Room-C" }]);

    const output = counterfactual(fcfs, engine, [req]);
    expect(output).toContain("FCFS placed 1/1; B&B placed 1/1");
    expect(output).toContain("Coding Club moved from Room-B to Room-C");
  });

  it("explains FCFS unplaced -> engine placed (gained room)", () => {
    const req = makeRequest("req-1", "AI Club");
    const fcfs = makeSolveResult("fcfs", [{ requestId: "req-1", roomId: null }]);
    const engine = makeSolveResult("bnb", [{ requestId: "req-1", roomId: "Room-A" }]);

    const output = counterfactual(fcfs, engine, [req]);
    expect(output).toContain("AI Club gained Room-A");
  });

  it("explains FCFS placed -> engine unplaced (lost room)", () => {
    const req = makeRequest("req-1", "Workshop");
    const fcfs = makeSolveResult("fcfs", [{ requestId: "req-1", roomId: "Room-B" }]);
    const engine = makeSolveResult("bnb", [{ requestId: "req-1", roomId: null }]);

    const output = counterfactual(fcfs, engine, [req]);
    expect(output).toContain("Workshop was placed by FCFS in Room-B but not by B&B");
  });

  it("never exposes raw UUIDs when human-readable information or lookup is available", () => {
    const reqId = "11111111-1111-4111-8111-111111111111";
    const room1 = "22222222-2222-4222-8222-222222222222";
    const room2 = "33333333-3333-4333-8333-333333333333";

    const req = makeRequest(reqId, undefined, 45, "CS");
    const fcfs = makeSolveResult("fcfs", [{ requestId: reqId, roomId: room1 }]);
    const engine = makeSolveResult("bnb", [{ requestId: reqId, roomId: room2 }]);

    const roomLookup = new Map([
      [room1, "LH-1"],
      [room2, "LH-2"],
    ]);

    const output = counterfactual(fcfs, engine, [req], roomLookup);
    expect(output).not.toContain(reqId);
    expect(output).not.toContain(room1);
    expect(output).not.toContain(room2);
    expect(output).toContain("CS request moved from LH-1 to LH-2");

    // Without roomLookup, room UUIDs should fall back to "a room" rather than raw UUIDs
    const outputNoLookup = counterfactual(fcfs, engine, [req]);
    expect(outputNoLookup).not.toContain(room1);
    expect(outputNoLookup).not.toContain(room2);
    expect(outputNoLookup).toContain("CS request moved from a room to a room");
  });

  it("is strictly deterministic for identical inputs", () => {
    const req1 = makeRequest("req-1", "Club 1");
    const req2 = makeRequest("req-2", "Club 2");
    const fcfs = makeSolveResult("fcfs", [
      { requestId: "req-1", roomId: "Room-A" },
      { requestId: "req-2", roomId: null },
    ]);
    const engine = makeSolveResult("bnb", [
      { requestId: "req-1", roomId: "Room-B" },
      { requestId: "req-2", roomId: "Room-A" },
    ]);

    const first = counterfactual(fcfs, engine, [req1, req2]);
    const second = counterfactual(fcfs, engine, [req1, req2]);
    expect(first).toBe(second);
  });

  it("safely handles empty data and missing request IDs", () => {
    const emptyResult = makeSolveResult("fcfs", []);
    expect(counterfactual(emptyResult, emptyResult, [])).toBe("No requests to allocate.");

    // Assignment for a request not in reqs list
    const fcfs = makeSolveResult("fcfs", [{ requestId: "unlisted-req", roomId: "Room-A" }]);
    const engine = makeSolveResult("bnb", [{ requestId: "unlisted-req", roomId: "Room-B" }]);
    const output = counterfactual(fcfs, engine, []);
    expect(output).toContain("unlisted-req moved from Room-A to Room-B");
  });

  it("includes score and reason information only when actually present", () => {
    const req = makeRequest("req-1", "Seminar");

    // Case 1: No score or reason -> no parenthetical details
    const fcfsNoScore = makeSolveResult("fcfs", [{ requestId: "req-1", roomId: "Room-A" }]);
    const engineNoScore = makeSolveResult("bnb", [{ requestId: "req-1", roomId: "Room-B" }]);
    const outputNoScore = counterfactual(fcfsNoScore, engineNoScore, [req]);
    expect(outputNoScore).toBe(
      "FCFS placed 1/1; B&B placed 1/1. Seminar moved from Room-A to Room-B.",
    );

    // Case 2: Reason explicitly provided
    const engineWithReason = makeSolveResult("bnb", [
      { requestId: "req-1", roomId: "Room-B", reason: "Better capacity match" },
    ]);
    const outputReason = counterfactual(fcfsNoScore, engineWithReason, [req]);
    expect(outputReason).toContain("Seminar moved from Room-A to Room-B (Better capacity match)");

    // Case 3: Score notes provided
    const engineWithScore = makeSolveResult("bnb", [
      {
        requestId: "req-1",
        roomId: "Room-B",
        score: makeScore(["Tight fit: 25 seats, only 5 wasted"]),
      },
    ]);
    const outputScore = counterfactual(fcfsNoScore, engineWithScore, [req]);
    expect(outputScore).toContain(
      "Seminar moved from Room-A to Room-B (Tight fit: 25 seats, only 5 wasted)",
    );
  });
});
