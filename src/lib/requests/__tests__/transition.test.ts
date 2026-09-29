import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockState, mockPayload, mockExpectedStatus, mockDbError, mockFrom, mockGetNow } = vi.hoisted(() => ({
  mockState: { status: "pending" as string },
  mockPayload: { value: {} as Record<string, unknown> },
  mockExpectedStatus: { value: "" },
  mockDbError: { value: null as { message: string } | null },
  mockFrom: vi.fn(),
  mockGetNow: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ db: () => ({ from: mockFrom }) }));
vi.mock("@/lib/clock", () => ({ getNow: mockGetNow }));

import { REQUEST_STATUSES, TRANSITIONS, type RequestStatus } from "@/contracts/domain";
import { transition } from "../transition";

const validTransitions = REQUEST_STATUSES.flatMap((from) =>
  TRANSITIONS[from].map((to) => [from, to] as const),
);

function setupQuery() {
  const query = {
    update: vi.fn((payload: Record<string, unknown>) => {
      mockPayload.value = payload;
      return query;
    }),
    eq: vi.fn((column: string, status: string) => {
      if (column === "status") mockExpectedStatus.value = status;
      return query;
    }),
    select: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: mockExpectedStatus.value === mockState.status ? { id: "request-1" } : null,
      error: mockDbError.value,
    })),
  };
  mockFrom.mockReturnValue(query);
  return query;
}

describe("transition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.status = "pending";
    mockPayload.value = {};
    mockExpectedStatus.value = "";
    mockDbError.value = null;
    mockGetNow.mockResolvedValue("2026-10-01T10:00:00+05:30");
    setupQuery();
  });

  it.each(validTransitions)("permits the contract transition %s → %s", async (from, to) => {
    mockState.status = from;
    await expect(transition("request-1", to, { actorId: "actor-1", expectedStatus: from, action: "lifecycle_test" })).resolves.toBeUndefined();
    expect(mockExpectedStatus.value).toBe(from);
    expect(mockPayload.value).toMatchObject({
      status: to,
      last_actor_id: "actor-1",
      last_action: "lifecycle_test",
      last_action_at: "2026-10-01T10:00:00+05:30",
    });
  });

  it.each([
    ["pending", "checked_in"],
    ["checked_in", "pending"],
    ["cancelled", "approved"],
    ["rejected", "checked_in"],
    ["completed", "checked_in"],
    ["approved", "approved"],
  ] as const)("rejects invalid or duplicate state %s → %s", async (from, to) => {
    mockState.status = from;
    await expect(transition("request-1", to, { actorId: "actor-1", expectedStatus: from })).rejects.toThrow(/state|transition/);
  });

  it("rejects destinations with no valid source before touching the database", async () => {
    await expect(transition("request-1", "unknown" as RequestStatus, { actorId: null, expectedStatus: "pending" })).rejects.toThrow("cannot make that transition");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("guards against stale state and duplicate transitions at the update boundary", async () => {
    mockState.status = "cancelled"; // changed after an earlier route read
    await expect(transition("request-1", "approved", { actorId: "actor-1", expectedStatus: "pending" })).rejects.toThrow("state changed");
    expect(mockExpectedStatus.value).toBe("pending");
  });

  it("rejects a different but otherwise valid source status than the one the route observed", async () => {
    mockState.status = "pending";
    await expect(transition("request-1", "cancelled", { actorId: "actor-1", expectedStatus: "approved" }))
      .rejects.toThrow("state changed");
    expect(mockExpectedStatus.value).toBe("approved");
  });

  it("does not let patch data override status or audit identity", async () => {
    mockState.status = "pending";
    await transition("request-1", "approved", {
      actorId: "session-actor",
      expectedStatus: "pending",
      action: "approve",
      patch: { status: "cancelled", last_actor_id: "spoofed", checked_in_at: "2026-10-01T10:00:00Z" },
    });
    expect(mockPayload.value).toMatchObject({
      status: "approved",
      last_actor_id: "session-actor",
      last_action: "approve",
      checked_in_at: "2026-10-01T10:00:00Z",
    });
  });

  it("returns a safe error without exposing raw database details", async () => {
    mockDbError.value = { message: "secret constraint detail from database" };
    await expect(transition("request-1", "approved", { actorId: "actor-1", expectedStatus: "pending" }))
      .rejects.toThrow("Unable to update this request.");
  });

  it("does not attempt a mutation when business time cannot be read", async () => {
    mockGetNow.mockRejectedValueOnce(new Error("private clock/database detail"));
    await expect(transition("request-1", "approved", { actorId: "actor-1", expectedStatus: "pending" }))
      .rejects.toThrow("Unable to determine business time for this request update.");
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
