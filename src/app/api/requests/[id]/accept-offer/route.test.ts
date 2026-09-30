import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRANSITIONS } from "@/contracts/domain";

const { mockRequireRole, mockFrom, mockTransition } = vi.hoisted(() => ({
  mockRequireRole: vi.fn(), mockFrom: vi.fn(), mockTransition: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireRole: mockRequireRole }));
vi.mock("@/lib/requests/transition", () => ({ transition: mockTransition }));
vi.mock("@/lib/clock", () => ({ getNow: () => Promise.resolve("2026-10-01T08:00:00.000Z") }));
vi.mock("@/lib/db/server", () => ({ db: () => ({ from: mockFrom }) }));

import { POST } from "./route";

const actor = { id: "requester-1", role: "requester" };
const offer = {
  roomId: "2a67af5b-b611-54ad-940f-06f77266d8b9",
  during: { start: "2026-10-01T12:30:00.000Z", end: "2026-10-01T14:30:00.000Z" },
};
let current: Record<string, unknown>;

function post(body: unknown = offer) {
  return new Request("http://localhost/api/requests/request-1/accept-offer", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "request-1" }) };

describe("POST /api/requests/[id]/accept-offer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    current = { id: "request-1", requester_id: "requester-1", status: "bumped", purpose: "club_event", during: "" };
    mockRequireRole.mockResolvedValue(actor);
    mockFrom.mockImplementation(() => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: current, error: null }) }) }),
    }));
    mockTransition.mockResolvedValue(undefined);
  });

  it("turns an accepted bumped offer into a fresh hold on the offered room and time", async () => {
    const response = await POST(post(), ctx);
    expect(response.status).toBe(200);
    const [id, to, opts] = mockTransition.mock.calls[0];
    expect(id).toBe("request-1");
    expect(to).toBe("pending");
    expect(opts).toMatchObject({
      actorId: actor.id,
      expectedStatus: "bumped",
      action: "accept_offer",
      patch: { room_id: offer.roomId, during: `[${offer.during.start},${offer.during.end})`, offered_alternatives: null },
    });
    expect(opts.patch.hold_expires_at).toEqual(expect.any(String));
  });

  it("only asks for a transition the lifecycle allows", async () => {
    for (const status of ["bumped", "waitlisted"] as const) {
      mockTransition.mockClear();
      current = { ...current, status };
      await POST(post(), ctx);
      const to = mockTransition.mock.calls[0][1];
      expect(TRANSITIONS[status]).toContain(to);
    }
  });

  it("refuses someone else's request", async () => {
    current = { ...current, requester_id: "someone-else" };
    const response = await POST(post(), ctx);
    expect(response.status).toBe(403);
    expect(mockTransition).not.toHaveBeenCalled();
  });
});
