import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireRole, mockLoadContext, mockLoadRequest, mockGetNow, mockNotify,
  mockFrom, mockRpc,
} = vi.hoisted(() => ({
  mockRequireRole: vi.fn(), mockLoadContext: vi.fn(), mockLoadRequest: vi.fn(),
  mockGetNow: vi.fn(), mockNotify: vi.fn(), mockFrom: vi.fn(), mockRpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireRole: mockRequireRole }));
vi.mock("@/server/engine-adapter", () => ({ loadEngineContext: mockLoadContext, loadEngineRequest: mockLoadRequest }));
vi.mock("@/lib/clock", () => ({ getNow: mockGetNow }));
vi.mock("@/lib/notify", () => ({ notify: mockNotify }));
vi.mock("@/lib/db/server", () => ({ db: () => ({ from: mockFrom, rpc: mockRpc }) }));

import { POST } from "./route";
import { apiError } from "@/lib/http";

const roomId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const replacementId = "33333333-3333-4333-8333-333333333333";
const requesterId = "44444444-4444-4444-8444-444444444444";
const previewId = "55555555-5555-4555-8555-555555555555";
const interval = { start: "2026-10-01T16:00:00+05:30", end: "2026-10-01T18:00:00+05:30" };
const pgInterval = '["2026-10-01 10:30:00+00","2026-10-01 12:30:00+00")';
const engineRequest = {
  id: requestId, requesterId, deptId: null, headcount: 20, minSystems: 0, features: [], interval,
  priority: 20, createdAt: "2026-09-29T10:00:00+05:30", history: {},
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
const plan = {
  kind: "disruption" as const,
  moves: [{ requestId, roomId: replacementId, interval }],
  unplaced: [],
  summary: "1 booking was rehomed and 0 offered alternatives.",
};
const storedInput = {
  roomId, during: interval, reason: "AC maintenance", affectedRequestIds: [requestId],
  requestStates: [{ id: requestId, status: "pending", roomId, interval }],
};
const storedOutput = { plan, affected: 1 };

function request(body: unknown = { previewId }): Request {
  return new Request("http://localhost/api/disruptions/apply", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

function configureDb(options?: { input?: unknown; output?: unknown; states?: unknown[]; applyError?: { message: string } | null }) {
  mockFrom.mockImplementation((table: string) => {
    const query: Record<string, unknown> = {
      select: () => query,
      eq: () => query,
      in: () => query,
      maybeSingle: () => Promise.resolve({ data: table === "engine_runs"
        ? { input: options?.input ?? storedInput, output: options?.output ?? storedOutput }
        : null, error: null }),
      then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
        Promise.resolve({ data: options?.states ?? [{ id: requestId, status: "pending", room_id: roomId, during: pgInterval }], error: null }).then(resolve, reject),
    };
    return query;
  });
  mockRpc.mockResolvedValue({ error: options?.applyError ?? null });
}

describe("POST /api/disruptions/apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ id: "66666666-6666-4666-8666-666666666666", role: "admin" });
    mockLoadContext.mockResolvedValue(structuredClone(engineContext));
    mockLoadRequest.mockResolvedValue(engineRequest);
    mockGetNow.mockResolvedValue("2026-09-29T10:00:00+05:30");
    mockNotify.mockResolvedValue(undefined);
    configureDb();
  });

  it("revalidates current state and applies moves plus blackout through one atomic RPC", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, summary: plan.summary });
    expect(mockRequireRole).toHaveBeenCalledWith("admin");
    expect(mockLoadContext).toHaveBeenCalledWith();
    expect(mockGetNow).toHaveBeenCalledOnce();
    expect(mockFrom.mock.calls.map(([table]) => table)).toEqual(["engine_runs", "requests"]);
    expect(mockRpc).toHaveBeenCalledWith("apply_disruption", {
      p_moves: [{ request_id: requestId, room_id: replacementId, s: interval.start, e: interval.end, status: null, offers: null }],
      p_expected_states: [{ request_id: requestId, status: "pending", room_id: roomId, start_at: interval.start, end_at: interval.end }],
      p_room_id: roomId, p_start: interval.start, p_end: interval.end, p_reason: "AC maintenance",
      p_actor: "66666666-6666-4666-8666-666666666666", p_action: "disruption_apply", p_at: "2026-09-29T10:00:00+05:30",
    });
    expect(mockFrom).not.toHaveBeenCalledWith("room_blackouts");
    expect(mockNotify).toHaveBeenCalledWith(requesterId, expect.objectContaining({ requestId, kind: "disruption" }));
    expect(mockFrom).not.toHaveBeenCalledWith("requests", "update");
  });

  it("rejects unauthorized actors before loading a preview or touching data", async () => {
    const denied = apiError(403, "FORBIDDEN", "Requires role: admin");
    mockRequireRole.mockRejectedValue(denied);
    const response = await POST(request());
    expect(response).toBe(denied);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects malformed apply input", async () => {
    const response = await POST(request({ previewId: "bad" }));
    expect(response.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("rejects a stale request without applying any part of the plan", async () => {
    configureDb({ states: [{ id: requestId, status: "approved", room_id: roomId, during: pgInterval }] });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "PREVIEW_STALE" });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("blocks checked-in or otherwise unresolved previews before persistence", async () => {
    const unresolved = { ...storedInput, requestStates: [{ ...storedInput.requestStates[0], status: "checked_in" }] };
    const blockedOutput = { affected: 1, plan: { kind: "disruption", moves: [], unplaced: [{ requestId, alternatives: { sameRoomOtherSlot: [], similarRoomSameSlot: [] } }], summary: "Blocked" } };
    configureDb({ input: unresolved, output: blockedOutput });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "DISRUPTION_BLOCKED" });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects a plan made infeasible by current room occupancy", async () => {
    mockLoadContext.mockResolvedValue({
      ...structuredClone(engineContext),
      rooms: engineContext.rooms.map((room, index) => index === 1 ? {
        ...room,
        booked: [{ requestId: "77777777-7777-4777-8777-777777777777", interval, priority: 50, status: "approved", movable: true }],
      } : room),
    });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "PREVIEW_STALE" });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("does not notify or expose internals if the atomic RPC fails", async () => {
    mockRpc.mockResolvedValueOnce({ error: { message: "private RPC failure" } });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).not.toHaveProperty("message", "private RPC failure");
    expect(mockRpc).toHaveBeenCalledOnce();
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
