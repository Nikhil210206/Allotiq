import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireRole, mockLoadContext, mockLoadScenario, mockLoadStates, mockRunLab, mockFrom, mockInsert, mockSingle } = vi.hoisted(() => ({
  mockRequireRole: vi.fn(),
  mockLoadContext: vi.fn(),
  mockLoadScenario: vi.fn(),
  mockLoadStates: vi.fn(),
  mockRunLab: vi.fn(),
  mockFrom: vi.fn(),
  mockInsert: vi.fn(),
  mockSingle: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireRole: mockRequireRole }));
vi.mock("@/server/engine-adapter", () => ({ loadEngineContext: mockLoadContext }));
vi.mock("@/server/lab-adapter", () => ({ loadLabScenario: mockLoadScenario, loadLabRequestStates: mockLoadStates }));
vi.mock("@/engine/lab", () => ({ runLabScenario: mockRunLab }));
vi.mock("@/lib/db/server", () => ({ db: () => ({ from: mockFrom }) }));

import { POST } from "./route";
import { apiError } from "@/lib/http";

const engineRequest = {
  id: "scenario-request-1",
  requesterId: "profile-1",
  deptId: null,
  headcount: 20,
  minSystems: 0,
  features: [],
  interval: { start: "2026-10-01T14:00:00+05:30", end: "2026-10-01T15:00:00+05:30" },
  priority: 20,
  createdAt: "2026-09-29T10:00:00+05:30",
  history: {},
  label: "Scenario request",
};
const requestContext = {
  rooms: [{ id: "room-1", booked: [{ requestId: "scenario-request-1", movable: true }, { requestId: "checked-in", movable: false }] }],
  now: "2026-09-29T10:00:00+05:30",
};

function request(body: unknown = { scenarioId: "clash-8", solvers: ["fcfs", "bnb"] }): Request {
  return new Request("http://localhost/api/lab/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/lab/run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ id: "admin-1", role: "admin" });
    mockLoadScenario.mockResolvedValue({ id: "clash-8", name: "Clash", description: "Fixture", requests: [engineRequest] });
    mockLoadStates.mockResolvedValue([]);
    mockLoadContext.mockResolvedValue(structuredClone(requestContext));
    mockRunLab.mockReturnValue({ results: [{ solver: "bnb", assignments: [], metrics: {}, timedOut: false, trace: [] }], explanation: "Lab explanation" });
    mockSingle.mockResolvedValue({ data: { id: "run-1" }, error: null });
    mockInsert.mockReturnValue({ select: () => ({ single: mockSingle }) });
    mockFrom.mockImplementation(() => ({ insert: mockInsert }));
  });

  it("loads a validated scenario, isolates its movable bookings, runs solvers and logs the result", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ runId: "run-1", results: [{ solver: "bnb", assignments: [], metrics: {}, timedOut: false, trace: [] }], explanation: "Lab explanation" });
    expect(mockRequireRole).toHaveBeenCalledWith("admin");
    expect(mockLoadContext).toHaveBeenCalledWith(engineRequest.interval);
    const [requests, context, solvers] = mockRunLab.mock.calls[0];
    expect(requests).toEqual([engineRequest]);
    expect(context.rooms[0].booked.map((booking: { requestId: string }) => booking.requestId)).toEqual(["checked-in"]);
    expect(solvers).toEqual(["fcfs", "bnb"]);
    expect(requestContext.rooms[0].booked).toHaveLength(2);
    expect(mockFrom).toHaveBeenCalledWith("engine_runs");
    expect(mockFrom.mock.calls.map(([table]) => table)).toEqual(["engine_runs"]);
    expect(mockLoadStates).toHaveBeenCalledWith([engineRequest.id]);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ kind: "lab", created_at: requestContext.now, input: expect.objectContaining({ requestStates: [] }) }));
    const recordedInput = mockInsert.mock.calls[0][0].input;
    expect(recordedInput.context).toEqual(context);
    expect(recordedInput.context.rooms[0].booked).toEqual([{ requestId: "checked-in", movable: false }]);
  });

  it("authorizes before parsing or loading any scenario or database context", async () => {
    const denied = apiError(403, "FORBIDDEN", "Requires role: admin");
    mockRequireRole.mockRejectedValue(denied);

    const response = await POST(request());

    expect(response).toBe(denied);
    expect(mockLoadScenario).not.toHaveBeenCalled();
    expect(mockLoadContext).not.toHaveBeenCalled();
    expect(mockLoadStates).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("rejects malformed scenarios and unsupported ILP without running the engine", async () => {
    const badScenario = await POST(request({ scenarioId: "clash-8", solvers: ["fcfs", "fcfs"] }));
    expect(badScenario.status).toBe(400);
    const unavailable = await POST(request({ scenarioId: "clash-8", solvers: ["ilp"] }));
    expect(unavailable.status).toBe(501);
    expect(mockLoadScenario).not.toHaveBeenCalled();
    expect(mockRunLab).not.toHaveBeenCalled();
  });

  it("returns safe not-found and adapter failures", async () => {
    mockLoadScenario.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(404);
    mockLoadContext.mockRejectedValueOnce(new Error("private database details"));
    const failed = await POST(request());
    expect(failed.status).toBe(500);
    expect(JSON.stringify(await failed.json())).not.toContain("private database details");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("does not report a successful run when engine_runs logging fails", async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: "private logging failure" } });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("private logging failure");
  });

  it("rejects malformed request JSON", async () => {
    const malformed = new Request("http://localhost/api/lab/run", { method: "POST", body: "{" });
    expect((await POST(malformed)).status).toBe(400);
    expect(mockLoadScenario).not.toHaveBeenCalled();
  });
});
