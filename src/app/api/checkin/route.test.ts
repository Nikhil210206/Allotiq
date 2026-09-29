import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireRole, mockFrom, mockGetNow, mockTransition, mockNotify } = vi.hoisted(() => ({
  mockRequireRole: vi.fn(), mockFrom: vi.fn(), mockGetNow: vi.fn(),
  mockTransition: vi.fn(), mockNotify: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireRole: mockRequireRole }));
vi.mock("@/lib/db/server", () => ({ db: () => ({ from: mockFrom }) }));
vi.mock("@/lib/clock", () => ({ getNow: mockGetNow }));
vi.mock("@/lib/requests/transition", () => ({ transition: mockTransition }));
vi.mock("@/lib/notify", () => ({ notify: mockNotify }));

import { POST } from "./route";
import { apiError } from "@/lib/http";

const actor = { id: "requester-1", role: "requester" };
const start = "2026-10-01T10:00:00+05:30";
const end = "2026-10-01T12:00:00+05:30";
const booking = {
  id: "request-1", requester_id: actor.id, title: "Seminar",
  during: `[${start},${end})`,
};

function post(body: unknown = { roomCode: "R1", k: "secret" }) {
  return new Request("http://localhost/api/checkin", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

function configureRoomAndBooking() {
  mockFrom.mockImplementation((table: string) => {
    if (table === "rooms") {
      const query = { select: () => query, eq: () => query, single: async () => ({ data: { id: "room-1", qr_secret: "secret", name: "R1" }, error: null }) };
      return query;
    }
    const query = {
      select: () => query,
      eq: () => query,
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({ data: [booking], error: null }).then(resolve, reject),
    };
    return query;
  });
}

describe("POST /api/checkin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(actor);
    mockGetNow.mockResolvedValue(start);
    mockTransition.mockResolvedValue(undefined);
    mockNotify.mockResolvedValue(undefined);
    configureRoomAndBooking();
  });

  it("rejects unauthorized actors before loading room or booking data", async () => {
    const denied = apiError(403, "FORBIDDEN", "Authentication required");
    mockRequireRole.mockRejectedValue(denied);
    const response = await POST(post());
    expect(response).toBe(denied);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockTransition).not.toHaveBeenCalled();
  });

  it.each([
    ["2026-10-01T09:50:00+05:30", true],
    ["2026-10-01T10:15:00+05:30", true],
    ["2026-10-01T09:49:59.999+05:30", false],
    ["2026-10-01T10:15:00.001+05:30", false],
  ])("enforces the documented check-in window at %s", async (now, accepted) => {
    mockGetNow.mockResolvedValue(now);
    const response = await POST(post({ roomCode: "R1", k: "secret", status: "checked_in", requesterId: "spoofed" }));
    expect(response.status === 200).toBe(accepted);
    if (accepted) {
      expect(mockTransition).toHaveBeenCalledWith("request-1", "checked_in", {
        actorId: actor.id, expectedStatus: "approved", action: "checkin", patch: { checked_in_at: now },
      });
      expect(mockNotify).toHaveBeenCalledOnce();
    } else {
      expect(mockTransition).not.toHaveBeenCalled();
      expect(mockNotify).not.toHaveBeenCalled();
    }
  });

  it("does not send a success notification when duplicate or stale check-in is rejected", async () => {
    mockTransition.mockRejectedValue(new Error("Request state changed or this transition is not allowed."));
    const response = await POST(post());
    expect(response.status).toBe(409);
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
