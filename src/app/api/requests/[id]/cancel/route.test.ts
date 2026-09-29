import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireRole, mockFrom, mockTransition, mockNotify } = vi.hoisted(() => ({
  mockRequireRole: vi.fn(), mockFrom: vi.fn(), mockTransition: vi.fn(), mockNotify: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireRole: mockRequireRole }));
vi.mock("@/lib/requests/transition", () => ({ transition: mockTransition }));
vi.mock("@/lib/notify", () => ({ notify: mockNotify }));
vi.mock("@/lib/db/server", () => ({ db: () => ({ from: mockFrom }) }));

import { POST } from "./route";

const actor = { id: "requester-1", role: "requester" };
let current = { id: "request-1", requester_id: "requester-1", status: "approved", title: "Seminar", room_id: "room-1" };

function post(body: unknown = {}) {
  return new Request("http://localhost/api/requests/request-1/cancel", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/requests/[id]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    current = { id: "request-1", requester_id: "requester-1", status: "approved", title: "Seminar", room_id: "room-1" };
    mockRequireRole.mockResolvedValue(actor);
    mockFrom.mockImplementation((table: string) => ({
      select: () => ({ eq: () => table === "requests"
        ? { single: () => Promise.resolve({ data: current, error: null }) }
        : { maybeSingle: () => Promise.resolve({ data: { approver_id: "approver-1" }, error: null }) } }),
    }));
    mockTransition.mockResolvedValue(undefined);
    mockNotify.mockResolvedValue(undefined);
  });

  it("rejects a requester who does not own the request", async () => {
    mockRequireRole.mockResolvedValue(actor);
    current = { ...current, requester_id: "someone-else" };
    const response = await POST(post({ requesterId: actor.id }), { params: Promise.resolve({ id: "request-1" }) });
    expect(response.status).toBe(403);
    expect(mockTransition).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("uses the session actor and ignores client-supplied status and identity", async () => {
    const response = await POST(post({ status: "completed", actorId: "spoofed", requesterId: "other" }), {
      params: Promise.resolve({ id: "request-1" }),
    });
    expect(response.status).toBe(200);
    expect(mockTransition).toHaveBeenCalledWith("request-1", "cancelled", {
      actorId: actor.id, expectedStatus: "approved", action: "cancel",
    });
  });

  it("does not send follow-up notifications after an invalid or stale cancellation", async () => {
    current = { ...current, status: "checked_in" };
    mockTransition.mockRejectedValue(new Error("Request state changed or this transition is not allowed."));
    const response = await POST(post(), { params: Promise.resolve({ id: "request-1" }) });
    expect(response.status).toBe(409);
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
