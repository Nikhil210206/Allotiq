import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRowsByStatus, mockFilters, mockFrom, mockGetNow, mockTransition, mockNotify, mockPlacementViolations } = vi.hoisted(() => ({
  mockRowsByStatus: { value: {} as Record<string, unknown[]> },
  mockFilters: { value: [] as Array<{ method: string; args: unknown[] }> },
  mockFrom: vi.fn(), mockGetNow: vi.fn(), mockTransition: vi.fn(), mockNotify: vi.fn(), mockPlacementViolations: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/clock", () => ({ getNow: mockGetNow }));
vi.mock("@/lib/db/server", () => ({ db: () => ({ from: mockFrom }) }));
vi.mock("@/lib/requests/transition", () => ({ transition: mockTransition }));
vi.mock("@/lib/notify", () => ({ notify: mockNotify }));
vi.mock("@/lib/requests/placement", () => ({ placementViolations: mockPlacementViolations }));
vi.mock("@/lib/db/mappers", () => ({
  parseRange: (value: unknown) => {
    const match = String(value).match(/^[[(](.*?),(.*?)[)\]]$/);
    if (!match) throw new Error("bad range");
    return { start: new Date(match[1]).toISOString(), end: new Date(match[2]).toISOString() };
  },
  rowToRequest: (row: Record<string, unknown>) => ({
    id: row.id, requesterId: row.requester_id, title: row.title, priority: row.priority,
    during: row.during, status: "waitlisted",
  }),
}));

import { runTick } from "../tick";

const now = "2026-10-01T10:00:00+05:30";
const waitlisted = {
  id: "wait-1", requester_id: "waiter", title: "Waitlisted", priority: 20,
  during: '["2026-10-01 04:30:00+00","2026-10-01 05:30:00+00")',
};

function configureQueries() {
  mockFrom.mockImplementation((table: string) => {
    let status = "";
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        if (column === "status") status = String(value);
        mockFilters.value.push({ method: "eq", args: [column, value] });
        return query;
      },
      in: (column: string, value: unknown[]) => {
        if (column === "status") status = String(value[0]);
        mockFilters.value.push({ method: "in", args: [column, value] });
        return query;
      },
      lt: (column: string, value: unknown) => { mockFilters.value.push({ method: "lt", args: [column, value] }); return query; },
      lte: (column: string, value: unknown) => { mockFilters.value.push({ method: "lte", args: [column, value] }); return query; },
      is: (column: string, value: unknown) => { mockFilters.value.push({ method: "is", args: [column, value] }); return query; },
      order: () => query,
      then: (resolve: (result: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({ data: table === "requests" ? mockRowsByStatus.value[status] ?? [] : [], error: null }).then(resolve, reject),
    };
    return query;
  });
}

describe("runTick lifecycle transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRowsByStatus.value = {};
    mockFilters.value = [];
    mockGetNow.mockResolvedValue(now);
    mockTransition.mockResolvedValue(undefined);
    mockNotify.mockResolvedValue(undefined);
    mockPlacementViolations.mockResolvedValue([]);
    configureQueries();
  });

  it("expires a hold at the exact business-time deadline", async () => {
    mockRowsByStatus.value.pending = [{
      id: "pending-1", requester_id: "requester", title: "Pending", hold_expires_at: now, status: "pending"
    }];
    await runTick();
    expect(mockFilters.value).toContainEqual({ method: "lte", args: ["hold_expires_at", now] });
    expect(mockTransition).toHaveBeenCalledWith("pending-1", "expired", {
      actorId: null, expectedStatus: "pending", action: "auto_expire",
    });
  });

  it("auto-releases at the no-show threshold, completes at the half-open end, and fills a freed slot", async () => {
    mockRowsByStatus.value.approved = [{
      id: "approved-1", requester_id: "requester", title: "No show", room_id: "room-1",
      during: '["2026-10-01 04:15:00+00","2026-10-01 06:30:00+00")',
    }]; // start 09:45 IST + 15 minutes equals business now
    mockRowsByStatus.value.checked_in = [{
      id: "checked-1", room_id: "room-2",
      during: '["2026-10-01 03:00:00+00","2026-10-01 04:30:00+00")',
    }]; // booking end equals business now
    mockRowsByStatus.value.waitlisted = [waitlisted];

    const result = await runTick();
    expect(result).toMatchObject({ released: 1, completed: 1, refilled: 1, at: now });
    expect(mockTransition).toHaveBeenCalledWith("approved-1", "auto_released", {
      actorId: null, expectedStatus: "approved", action: "auto_release",
    });
    expect(mockTransition).toHaveBeenCalledWith("checked-1", "completed", {
      actorId: null, expectedStatus: "checked_in", action: "auto_complete",
    });
    expect(mockTransition).toHaveBeenCalledWith("wait-1", "approved", {
      actorId: null, expectedStatus: "waitlisted", action: "waitlist_fill", patch: { room_id: "room-1" },
    });
    expect(mockGetNow).toHaveBeenCalledOnce();
  });
});
