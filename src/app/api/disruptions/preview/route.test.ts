import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireRole, mockLoadContext, mockLoadRequest, mockFrom, mockInsert, mockSingle } = vi.hoisted(() => ({
  mockRequireRole: vi.fn(), mockLoadContext: vi.fn(), mockLoadRequest: vi.fn(), mockFrom: vi.fn(), mockInsert: vi.fn(), mockSingle: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireRole: mockRequireRole }));
vi.mock("@/server/engine-adapter", () => ({ loadEngineContext: mockLoadContext, loadEngineRequest: mockLoadRequest }));
vi.mock("@/lib/db/server", () => ({ db: () => ({ from: mockFrom }) }));

import { POST } from "./route";
import { apiError } from "@/lib/http";

const roomId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const replacementId = "33333333-3333-4333-8333-333333333333";
const interval = { start: "2026-10-01T16:00:00+05:30", end: "2026-10-01T18:00:00+05:30" };
const engineRequest = {
  id: requestId, requesterId: "44444444-4444-4444-8444-444444444444", deptId: null,
  headcount: 20, minSystems: 0, features: [], interval, priority: 20,
  createdAt: "2026-09-29T10:00:00+05:30", history: {},
};
const engineContext = {
  rooms: [
    { id: roomId, code: "R1", buildingId: "building", type: "classroom", capacity: 40, systems: 0, features: [], deptId: null,
      access: "open", hours: { open: "08:00", close: "20:00", days: [1, 2, 3, 4, 5, 6, 7] }, blackouts: [],
      booked: [{ requestId, interval, priority: 20, status: "pending", movable: true }] },
    { id: replacementId, code: "R2", buildingId: "building", type: "classroom", capacity: 40, systems: 0, features: [], deptId: null,
      access: "open", hours: { open: "08:00", close: "20:00", days: [1, 2, 3, 4, 5, 6, 7] }, blackouts: [], booked: [] },
  ], buildings: [], deptBuilding: {},
  weights: { capacityFit: 0.3, featureMatch: 0.1, proximity: 0.2, scarcity: 0.2, preference: 0.1, energy: 0.1 },
  now: "2026-09-29T10:00:00+05:30", tz: "Asia/Kolkata",
};

function request(body: unknown = { roomId, during: interval, reason: "AC maintenance" }): Request {
  return new Request("http://localhost/api/disruptions/preview", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/disruptions/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ id: "admin-id", role: "admin" });
    mockLoadContext.mockResolvedValue(structuredClone(engineContext));
    mockLoadRequest.mockResolvedValue(engineRequest);
    mockSingle.mockResolvedValue({ data: { id: "55555555-5555-4555-8555-555555555555" }, error: null });
    mockInsert.mockReturnValue({ select: () => ({ single: mockSingle }) });
    mockFrom.mockImplementation(() => ({ insert: mockInsert }));
  });

  it("builds a deterministic rehome preview and writes only the engine-run record", async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.affected).toBe(1);
    expect(body.plan.moves).toEqual([{ requestId, roomId: replacementId, interval }]);
    expect(mockLoadContext).toHaveBeenCalledWith();
    expect(mockFrom).toHaveBeenCalledWith("engine_runs");
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ kind: "disruption", solver: "bnb", created_at: engineContext.now }));
    expect(mockFrom.mock.calls.map(([table]) => table)).toEqual(["engine_runs"]);
    expect(engineContext.rooms[0].blackouts).toEqual([]);
    expect(engineContext.rooms[0].booked).toHaveLength(1);
  });

  it("rejects malformed requests after admin authorization", async () => {
    const response = await POST(request({ roomId: "bad", during: interval, reason: "x" }));
    expect(response.status).toBe(400);
    expect(mockRequireRole).toHaveBeenCalledWith("admin");
    expect(mockLoadContext).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("preserves requireRole's unauthorized response and does not access the adapter or DB", async () => {
    const denied = apiError(403, "FORBIDDEN", "Requires role: admin");
    mockRequireRole.mockRejectedValue(denied);
    const response = await POST(request());
    expect(response).toBe(denied);
    expect(mockLoadContext).not.toHaveBeenCalled();
    expect(mockLoadRequest).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns a safe error when required engine data cannot be loaded", async () => {
    mockLoadContext.mockRejectedValue(new Error("private database details"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: "DISRUPTION_PREVIEW_FAILED" });
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
