import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireRole, mockCanDecide, mockFrom, mockTransition, mockNotify } = vi.hoisted(() => ({
  mockRequireRole: vi.fn(), mockCanDecide: vi.fn(), mockFrom: vi.fn(),
  mockTransition: vi.fn(), mockNotify: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireRole: mockRequireRole }));
vi.mock("@/lib/requests/access", () => ({ canDecide: mockCanDecide }));
vi.mock("@/lib/requests/transition", () => ({ transition: mockTransition }));
vi.mock("@/lib/notify", () => ({ notify: mockNotify }));
vi.mock("@/lib/db/server", () => ({ db: () => ({ from: mockFrom }) }));

import { POST } from "./route";
import { apiError } from "@/lib/http";

const actor = { id: "approver-session", role: "approver" };
const booking = { id: "request-1", requester_id: "requester-1", status: "pending", title: "Seminar", room_id: "room-1" };

function post(body: unknown = { reason: "Room unavailable" }) {
  return new Request("http://localhost/api/requests/request-1/reject", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/requests/[id]/reject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(actor);
    mockCanDecide.mockResolvedValue(true);
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: booking, error: null }) }) }),
    });
    mockTransition.mockResolvedValue(undefined);
    mockNotify.mockResolvedValue(undefined);
  });

  it("requires an approver/admin before reading or mutating a request", async () => {
    const denied = apiError(403, "FORBIDDEN", "Requires role: approver, admin");
    mockRequireRole.mockRejectedValue(denied);
    const response = await POST(post(), { params: Promise.resolve({ id: "request-1" }) });
    expect(response).toBe(denied);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockTransition).not.toHaveBeenCalled();
  });

  it("rejects a pending request through transition using session identity and the validated reason", async () => {
    const response = await POST(post({ reason: "Room unavailable", status: "approved", actorId: "spoofed" }), {
      params: Promise.resolve({ id: "request-1" }),
    });
    expect(response.status).toBe(200);
    expect(mockTransition).toHaveBeenCalledWith("request-1", "rejected", {
      actorId: actor.id,
      expectedStatus: "pending",
      action: "reject",
      note: "Room unavailable",
      patch: { room_id: null, decided_by: actor.id },
    });
    expect(mockNotify).toHaveBeenCalledOnce();
  });

  it("does not notify when the current state rejects the transition", async () => {
    mockTransition.mockRejectedValue(new Error("Request state changed or this transition is not allowed."));
    const response = await POST(post(), { params: Promise.resolve({ id: "request-1" }) });
    expect(response.status).toBe(409);
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
