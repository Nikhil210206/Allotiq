import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireRole, mockFrom, mockLoadContext, mockLoadRequest, mockTryBump } = vi.hoisted(() => ({
  mockRequireRole: vi.fn(),
  mockFrom: vi.fn(),
  mockLoadContext: vi.fn(),
  mockLoadRequest: vi.fn(),
  mockTryBump: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireRole: mockRequireRole }));
vi.mock("@/lib/db/server", () => ({ db: () => ({ from: mockFrom }) }));
vi.mock("@/server/engine-adapter", () => ({ loadEngineContext: mockLoadContext, loadEngineRequest: mockLoadRequest }));
vi.mock("@/engine/bump", () => ({ tryBump: mockTryBump }));

import { POST } from "./route";
import { apiError } from "@/lib/http";

const targetId = "11111111-1111-4111-8111-111111111111";
const blockerId = "22222222-2222-4222-8222-222222222222";
const target = {
  id: targetId, requesterId: "33333333-3333-4333-8333-333333333333", deptId: null,
  headcount: 30, minSystems: 0, features: [], interval: { start: "2026-10-01T16:00:00+05:30", end: "2026-10-01T18:00:00+05:30" },
  priority: 50, createdAt: "2026-09-30T10:00:00+05:30", history: {},
};
const blocker = { ...target, id: blockerId, priority: 20 };
const plan = {
  kind: "bump_with_offer",
  moves: [
    { requestId: targetId, roomId: "44444444-4444-4444-8444-444444444444", interval: target.interval },
    { requestId: blockerId, roomId: null, interval: blocker.interval, status: "bumped", offers: { sameRoomOtherSlot: [], similarRoomSameSlot: [] } },
  ],
  unplaced: [],
  summary: "Priority request placed with an alternative offer.",
};

function request(id = targetId, body?: unknown) {
  return new Request(`http://localhost/api/requests/${id}/bump-check`, {
    method: "POST",
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
}

function routeContext(id = targetId) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/requests/[id]/bump-check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ id: "55555555-5555-4555-8555-555555555555", role: "admin" });
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: targetId, status: "waitlisted", room_id: null }, error: null }) }),
      }),
    });
    mockLoadRequest.mockImplementation(async (id: string) => id === targetId ? target : blocker);
    mockLoadContext.mockResolvedValue({
      rooms: [{ id: "44444444-4444-4444-8444-444444444444", booked: [{ requestId: blockerId, interval: target.interval, movable: true }] }],
    });
    mockTryBump.mockReturnValue(plan);
  });

  it("returns a read-only deterministic preview based on server-loaded priority and state", async () => {
    const response = await POST(request(targetId, { priority: 100, status: "approved", roomId: "client-room" }), routeContext());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ plan: { ...plan, moves: plan.moves.map((move) => move.requestId === targetId ? { ...move, status: "approved" } : move) } });
    expect(mockRequireRole).toHaveBeenCalledWith("admin");
    expect(mockLoadRequest).toHaveBeenCalledWith(targetId);
    expect(mockLoadContext).toHaveBeenCalledWith(target.interval);
    expect(mockTryBump).toHaveBeenCalledWith(target, expect.anything(), [blocker]);
    expect(mockFrom.mock.calls.map(([table]) => table)).toEqual(["requests"]);
  });

  it("rejects unauthorized users before any DB or engine access", async () => {
    const denied = apiError(403, "FORBIDDEN", "Requires role: admin");
    mockRequireRole.mockRejectedValue(denied);
    const response = await POST(request(), routeContext());
    expect(response).toBe(denied);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockLoadRequest).not.toHaveBeenCalled();
    expect(mockLoadContext).not.toHaveBeenCalled();
    expect(mockTryBump).not.toHaveBeenCalled();
  });

  it("rejects malformed IDs and non-waitlisted requests", async () => {
    expect((await POST(request("not-a-uuid"), routeContext("not-a-uuid"))).status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: targetId, status: "approved", room_id: "room" }, error: null }) }) }),
    });
    expect((await POST(request(), routeContext())).status).toBe(409);
    expect(mockLoadRequest).not.toHaveBeenCalled();
  });

  it("returns an explicit empty plan when no legal placement exists", async () => {
    mockTryBump.mockReturnValue(null);
    const response = await POST(request(), routeContext());
    expect(await response.json()).toEqual({ plan: null });
  });

  it("returns safe errors when the database or adapter fails", async () => {
    mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: "internal details" } }) }) }) });
    const response = await POST(request(), routeContext());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("internal details");

    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: targetId, status: "waitlisted", room_id: null }, error: null }) }) }),
    });
    mockLoadRequest.mockRejectedValueOnce(new Error("internal adapter detail"));
    const failed = await POST(request(), routeContext());
    expect(failed.status).toBe(500);
    expect(JSON.stringify(await failed.json())).not.toContain("internal adapter detail");
  });
});
