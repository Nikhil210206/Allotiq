import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => ({ from: vi.fn(), lookup: vi.fn(), role: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireRole: dbState.role }));
vi.mock("@/lib/db/server", () => ({ db: () => ({ from: dbState.from }) }));

import { POST } from "./route";
import { runLabScenario } from "@/engine/lab";
import type { EngineContext, EngineRequest } from "@/contracts/engine";

const requestDraft: EngineRequest = {
  id: "11111111-1111-4111-8111-111111111111", requesterId: "22222222-2222-4222-8222-222222222222", deptId: null,
  headcount: 30, minSystems: 0, features: [], interval: { start: "2026-10-01T14:00:00+05:30", end: "2026-10-01T15:00:00+05:30" },
  priority: 20, createdAt: "2026-09-29T10:00:00+05:30", history: {},
};
const context: EngineContext = {
  rooms: [{ id: "33333333-3333-4333-8333-333333333333", code: "R1", buildingId: "44444444-4444-4444-8444-444444444444", type: "classroom", capacity: 40, systems: 0, features: [], deptId: null, access: "open", hours: { open: "08:00", close: "20:00", days: [1,2,3,4,5,6] }, blackouts: [], booked: [] }],
  buildings: [{ id: "44444444-4444-4444-8444-444444444444", lat: null, lng: null }], deptBuilding: {},
  weights: { capacityFit: .3, featureMatch: .1, proximity: .2, scarcity: .2, preference: .1, energy: .1 },
  now: "2026-09-29T10:00:00+05:30", tz: "Asia/Kolkata",
};
const runId = "55555555-5555-4555-8555-555555555555";
const makeRequest = () => new Request("http://localhost/api/lab/replay", { method: "POST", body: JSON.stringify({ runId, solvers: ["fcfs"] }) });

describe("A13 replay determinism with the real engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.role.mockResolvedValue({ role: "admin" });
    const baseline = runLabScenario([requestDraft], context, ["fcfs"]);
    dbState.lookup.mockResolvedValue({ data: {
      id: runId, kind: "lab",
      input: { scenarioId: "snapshot", solvers: ["fcfs"], requests: [requestDraft], requestStates: [], context },
      output: baseline,
    }, error: null });
    dbState.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: dbState.lookup }) }), insert: dbState.insert, update: dbState.update, delete: dbState.delete });
  });

  it("replays the immutable stored context with identical assignments, scores, reasons, and comparison", async () => {
    const first = await (await POST(makeRequest())).json();
    const second = await (await POST(makeRequest())).json();
    const stable = (body: typeof first) => ({
      baseline: { ...body.baseline, metrics: { ...body.baseline.metrics, ms: 0 } },
      results: body.results.map((result: { metrics: Record<string, number> }) => ({ ...result, metrics: { ...result.metrics, ms: 0 } })),
      explanation: body.explanation, changes: body.changes,
    });
    expect(stable(first)).toEqual(stable(second));
    expect(first.changes).toEqual([]);
    expect(first.results[0].assignments[0].score).toEqual(first.baseline.assignments[0].score);
    expect(dbState.from).toHaveBeenCalledWith("engine_runs");
    expect(dbState.insert).not.toHaveBeenCalled(); expect(dbState.update).not.toHaveBeenCalled(); expect(dbState.delete).not.toHaveBeenCalled();
  });
});
