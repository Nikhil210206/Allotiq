import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireRole, mockFrom, mockPersistPlan, mockLoadContext } = vi.hoisted(() => ({
  mockRequireRole: vi.fn(),
  mockFrom: vi.fn(),
  mockPersistPlan: vi.fn(),
  mockLoadContext: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireRole: mockRequireRole }));
vi.mock("@/lib/db/server", () => ({ db: () => ({ from: mockFrom }) }));
vi.mock("@/server/engine-adapter", () => ({ persistPlan: mockPersistPlan, loadEngineContext: mockLoadContext }));

import { POST } from "./route";
import { apiError } from "@/lib/http";

const requestInterval = { start: "2026-10-01T14:00:00+05:30", end: "2026-10-01T15:00:00+05:30" };
const requestId = "11111111-1111-4111-8111-111111111111";
const roomId = "22222222-2222-4222-8222-222222222222";
const requestState = { id: requestId, status: "approved", roomId: null, interval: requestInterval };
const input = {
  scenarioId: "clash-8",
  solvers: ["fcfs", "bnb"],
  requests: [{
    id: requestId, requesterId: "33333333-3333-4333-8333-333333333333", deptId: null, headcount: 20, minSystems: 0, features: [],
    interval: requestInterval, priority: 20, createdAt: "2026-09-29T10:00:00+05:30", history: {},
  }],
  requestStates: [requestState],
};
const output = {
  results: [{
    solver: "bnb", timedOut: false,
    assignments: [{ requestId, roomId }],
  }],
  explanation: "B&B placed one request",
};
const runId = "d9428880-8848-4b90-8a45-cf9c5a3d70c3";

function request(body: unknown = { runId }): Request {
  return new Request("http://localhost/api/lab/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function configureDb(
  requestRows: { id: string; status: string; room_id: string | null; during: string }[],
  runInput = input,
  runOutput = output,
) {
  mockFrom.mockImplementation((table: string) => {
    let filters: unknown[][] = [];
    const query: Record<string, unknown> = {
      select: () => query,
      eq: (column: string, value: unknown) => { filters.push([column, value]); return query; },
      in: (_column: string, values: string[]) => { filters.push(["ids", values]); return query; },
      maybeSingle: () => Promise.resolve(table === "engine_runs" && filters.some(([, value]) => value === "lab")
        ? { data: { input: runInput, output: runOutput }, error: null }
        : { data: null, error: null }),
      then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
        Promise.resolve({ data: requestRows, error: null }).then(resolve, reject),
    };
    return query;
  });
}

describe("POST /api/lab/apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ id: "44444444-4444-4444-8444-444444444444", role: "admin" });
    mockPersistPlan.mockResolvedValue(undefined);
    mockLoadContext.mockResolvedValue({
      rooms: [{
        id: roomId, code: "R1", buildingId: "55555555-5555-4555-8555-555555555555", type: "classroom",
        capacity: 40, systems: 0, features: [], deptId: null, access: "open",
        hours: { open: "08:00", close: "20:00", days: [1, 2, 3, 4, 5, 6, 7] }, blackouts: [], booked: [],
      }],
      buildings: [], deptBuilding: {}, weights: { capacityFit: 0.3, featureMatch: 0.1, proximity: 0.2, scarcity: 0.2, preference: 0.1, energy: 0.1 },
      now: "2026-09-29T10:00:00+05:30", tz: "Asia/Kolkata",
    });
    configureDb([{ id: requestId, status: "approved", room_id: null, during: '["2026-10-01 08:30:00+00","2026-10-01 09:30:00+00")' }]);
  });

  it("persists a complete existing-request B&B plan through persistPlan", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mockPersistPlan).toHaveBeenCalledWith(expect.objectContaining({
      kind: "lab",
      moves: [{ requestId, roomId, interval: requestInterval }],
      unplaced: [],
    }), "44444444-4444-4444-8444-444444444444", "lab_apply");
    expect(mockLoadContext).toHaveBeenCalledWith(requestInterval);
    expect(mockFrom.mock.calls.map(([table]) => table)).toEqual(["engine_runs", "requests", "requests"]);
  });

  it("refuses to invent inserts for scenario-only requests", async () => {
    configureDb([], { ...input, requestStates: [] });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "LAB_INSERTS_UNSUPPORTED" });
    expect(mockPersistPlan).not.toHaveBeenCalled();
  });

  it("rejects unauthorized users before reading runs or writing plans", async () => {
    const denied = apiError(403, "FORBIDDEN", "Requires role: admin");
    mockRequireRole.mockRejectedValue(denied);
    const response = await POST(request());
    expect(response).toBe(denied);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockPersistPlan).not.toHaveBeenCalled();
  });

  it("will not move checked-in requests or apply incomplete plans", async () => {
    configureDb([{ id: requestId, status: "checked_in", room_id: null, during: '["2026-10-01 08:30:00+00","2026-10-01 09:30:00+00")' }]);
    const checkedIn = await POST(request());
    expect(checkedIn.status).toBe(409);
    expect(mockPersistPlan).not.toHaveBeenCalled();

    const incompleteOutput = { ...output, results: [{ ...output.results[0], assignments: [{ requestId, roomId: null }] }] };
    mockFrom.mockImplementation((table: string) => {
      const query: Record<string, unknown> = {
        select: () => query,
        eq: () => query,
        maybeSingle: () => Promise.resolve({ data: { input, output: incompleteOutput }, error: null }),
      };
      if (table === "requests") query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{ id: requestId, status: "approved", room_id: null, during: '["2026-10-01 08:30:00+00","2026-10-01 09:30:00+00")' }], error: null }).then(resolve);
      return query;
    });
    const incomplete = await POST(request());
    expect(incomplete.status).toBe(409);
    expect(mockPersistPlan).not.toHaveBeenCalled();
  });

  it("refuses timed-out B&B plans without applying them", async () => {
    const timedOutOutput = { ...output, results: [{ ...output.results[0], timedOut: true }] };
    mockFrom.mockImplementation((table: string) => {
      const query: Record<string, unknown> = {
        select: () => query,
        eq: () => query,
        maybeSingle: () => Promise.resolve({ data: { input, output: timedOutOutput }, error: null }),
      };
      return query;
    });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(mockLoadContext).not.toHaveBeenCalled();
    expect(mockPersistPlan).not.toHaveBeenCalled();
  });

  it("rejects stale request state before applying the saved plan", async () => {
    configureDb([{ id: requestId, status: "pending", room_id: null, during: '["2026-10-01 08:30:00+00","2026-10-01 09:30:00+00")' }]);
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(mockLoadContext).not.toHaveBeenCalled();
    expect(mockPersistPlan).not.toHaveBeenCalled();
  });

  it("rejects plans made infeasible by current room bookings without partial apply", async () => {
    mockLoadContext.mockResolvedValueOnce({
      rooms: [{
        id: roomId, code: "R1", buildingId: "55555555-5555-4555-8555-555555555555", type: "classroom",
        capacity: 40, systems: 0, features: [], deptId: null, access: "open",
        hours: { open: "08:00", close: "20:00", days: [1, 2, 3, 4, 5, 6, 7] }, blackouts: [],
        booked: [{ requestId: "66666666-6666-4666-8666-666666666666", interval: requestInterval, priority: 20, status: "approved", movable: true }],
      }],
      buildings: [], deptBuilding: {}, weights: { capacityFit: 0.3, featureMatch: 0.1, proximity: 0.2, scarcity: 0.2, preference: 0.1, energy: 0.1 },
      now: "2026-09-29T10:00:00+05:30", tz: "Asia/Kolkata",
    });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(mockPersistPlan).not.toHaveBeenCalled();
  });

  it("returns a safe failure when apply_plan persistence fails", async () => {
    mockPersistPlan.mockRejectedValueOnce(new Error("private RPC detail"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("private RPC detail");
  });
});
