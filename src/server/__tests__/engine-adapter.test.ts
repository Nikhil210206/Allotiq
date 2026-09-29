import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVE_STATUSES, PURPOSE_PRIORITY, TZ } from "@/contracts/domain";
import { DEFAULT_WEIGHTS, type Plan } from "@/contracts/engine";
import type { Database } from "@/lib/db/types.gen";

const { mockFrom, mockRpc, mockGetNow } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockGetNow: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ db: () => ({ from: mockFrom, rpc: mockRpc }) }));
vi.mock("@/lib/clock", () => ({ getNow: mockGetNow }));

import { loadEngineContext, loadEngineRequest, mapRequestToEngineRequest, persistPlan } from "@/server/engine-adapter";

type Tables = Record<string, Record<string, unknown>[]>;
let tables: Tables;
const queryCalls: { table: string; filters: unknown[][] }[] = [];

function makeQuery(table: string) {
  const call = { table, filters: [] as unknown[][] };
  queryCalls.push(call);
  let rows = [...(tables[table] ?? [])];
  const query: Record<string, (...args: never[]) => unknown> = {};
  const filter = (column: string, predicate: (value: unknown) => boolean, args: unknown[]) => {
    call.filters.push(args);
    rows = rows.filter((row) => predicate(row[column]));
    return query;
  };
  query.select = (() => query) as never;
  query.update = ((payload: unknown) => {
    call.filters.push(["update", payload]);
    return query;
  }) as never;
  query.eq = ((column: string, value: unknown) => filter(column, (item) => item === value, ["eq", column, value])) as never;
  query.neq = ((column: string, value: unknown) => filter(column, (item) => item !== value, ["neq", column, value])) as never;
  query.in = ((column: string, values: unknown[]) => filter(column, (item) => values.includes(item), ["in", column, values])) as never;
  query.filter = ((column: string, operator: string, rawRange: string) => {
    call.filters.push(["filter", column, operator, rawRange]);
    if (operator === "ov") {
      const parseBounds = (range: string) => {
        const [start, end] = range.slice(1, -1).split(",").map((part) => new Date(part.replace(/"/g, "").trim()).getTime());
        return { start, end };
      };
      const requested = parseBounds(rawRange);
      rows = rows.filter((row) => {
        const stored = parseBounds(String(row[column]));
        return stored.start < requested.end && requested.start < stored.end;
      });
    }
    return query;
  }) as never;
  query.not = ((column: string, operator: string, value: unknown) =>
    filter(column, (item) => !(operator === "is" && value === "null" && item === null), ["not", column, operator, value])) as never;
  query.maybeSingle = (() => Promise.resolve({ data: rows[0] ?? null, error: null })) as never;
  query.single = (() => Promise.resolve({ data: rows[0] ?? null, error: null })) as never;
  query.then = ((resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(resolve, reject)) as never;
  return query;
}

const requestInterval = '["2026-09-29T14:00:00+05:30","2026-09-29T15:00:00+05:30")';

function room(overrides: Record<string, unknown> = {}) {
  return {
    id: "room-1",
    code: "R1",
    name: "Seminar Room",
    building_id: "building-1",
    type: "classroom",
    capacity: 80,
    systems_count: 20,
    features: ["projector"],
    department_id: "dept-1",
    access: "open",
    approver_id: null,
    open_time: "08:00:00",
    close_time: "20:00:00",
    open_days: [1, 2, 3, 4, 5],
    attributes: {},
    qr_secret: "secret",
    is_active: true,
    ...overrides,
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: "request-1",
    requester_id: "profile-1",
    title: "Exam",
    purpose: "exam",
    priority: 1,
    headcount: 60,
    min_systems: 12,
    required_features: ["projector"],
    room_type: "classroom",
    preferred_building_id: "building-2",
    during: requestInterval,
    room_id: "room-1",
    status: "pending",
    hold_expires_at: null,
    checked_in_at: null,
    decided_by: null,
    decision_reason: null,
    unplaced_reason: null,
    offered_alternatives: null,
    score_breakdown: null,
    source: "form",
    raw_input: null,
    last_actor_id: null,
    last_action: null,
    last_action_at: null,
    created_at: "2026-09-20T10:00:00Z",
    updated_at: "2026-09-20T10:00:00Z",
    ...overrides,
  };
}

function setup(data: Tables = {}) {
  tables = data;
  queryCalls.length = 0;
  mockFrom.mockImplementation((table: string) => makeQuery(table));
  mockRpc.mockResolvedValue({ error: null });
  mockGetNow.mockResolvedValue("2026-09-29T08:30:00.000Z");
}

describe("A6 engine adapter", () => {
  beforeEach(() => {
    setup();
  });

  it("maps only active rooms with buildings, departments, blackouts and active bookings", async () => {
    setup({
      rooms: [room(), room({ id: "room-inactive", is_active: false })],
      buildings: [
        { id: "building-1", lat: 19.1, lng: 72.8 },
        { id: "building-2", lat: null, lng: null },
      ],
      departments: [
        { id: "dept-1", building_id: "building-2" },
        { id: "dept-no-building", building_id: null },
      ],
      app_settings: [{ key: "engine_weights", value: DEFAULT_WEIGHTS }],
      room_blackouts: [{ id: "blackout-1", room_id: "room-1", during: requestInterval, reason: "maintenance" }],
      requests: [
        ...ACTIVE_STATUSES.map((status, index) => request({ id: `booking-${index}`, purpose: "academic", priority: 999, status })),
        ...["waitlisted", "completed", "rejected", "expired", "cancelled", "auto_released", "bumped"].map((status) =>
          request({ id: `excluded-${status}`, status }),
        ),
      ],
    });

    const context = await loadEngineContext({ start: "2026-09-29T08:30:00Z", end: "2026-09-29T10:00:00Z" });
    expect(context.rooms).toHaveLength(1);
    expect(context.rooms[0]).toMatchObject({
      id: "room-1",
      code: "R1",
      buildingId: "building-1",
      systems: 20,
      deptId: "dept-1",
      hours: { open: "08:00", close: "20:00", days: [1, 2, 3, 4, 5] },
    });
    expect(context.rooms[0].blackouts).toEqual([
      { start: "2026-09-29T08:30:00.000Z", end: "2026-09-29T09:30:00.000Z" },
    ]);
    expect(context.rooms[0].booked).toHaveLength(3);
    expect(context.rooms[0].booked.map((booking) => booking.status)).toEqual([...ACTIVE_STATUSES]);
    expect(context.rooms[0].booked.map((booking) => booking.priority)).toEqual([40, 40, 40]);
    expect(context.rooms[0].booked.map((booking) => booking.movable)).toEqual([true, true, false]);
    expect(context.rooms[0].booked[0].interval).toEqual(context.rooms[0].blackouts[0]);
    expect(context.buildings).toEqual([
      { id: "building-1", lat: 19.1, lng: 72.8 },
      { id: "building-2", lat: null, lng: null },
    ]);
    expect(context.deptBuilding).toEqual({ "dept-1": "building-2" });
    expect(context.tz).toBe(TZ);
    expect(context.now).toBe("2026-09-29T08:30:00.000Z");
    expect(queryCalls.find((call) => call.table === "requests")?.filters).toContainEqual([
      "in",
      "status",
      [...ACTIVE_STATUSES],
    ]);
  });

  it("maps request fields and derives priority from purpose rather than stored priority", () => {
    const row = request({ purpose: "meeting", priority: 500 }) as unknown as Database["public"]["Tables"]["requests"]["Row"];
    const mapped = mapRequestToEngineRequest(row, "dept-7", { "room-2": 3 });
    expect(mapped).toEqual({
      id: "request-1",
      requesterId: "profile-1",
      deptId: "dept-7",
      headcount: 60,
      minSystems: 12,
      features: ["projector"],
      roomType: "classroom",
      interval: { start: "2026-09-29T08:30:00.000Z", end: "2026-09-29T09:30:00.000Z" },
      priority: PURPOSE_PRIORITY.meeting,
      createdAt: "2026-09-20T10:00:00Z",
      preferredBuildingId: "building-2",
      history: { "room-2": 3 },
    });
  });

  it("accepts and maps a half-open database interval", () => {
    const row = request({ during: '["2026-09-29T14:00:00+05:30","2026-09-29T15:00:00+05:30")' }) as unknown as Database["public"]["Tables"]["requests"]["Row"];
    expect(mapRequestToEngineRequest(row, null).interval).toEqual({
      start: "2026-09-29T08:30:00.000Z",
      end: "2026-09-29T09:30:00.000Z",
    });
  });

  it.each([
    '["2026-09-29T14:00:00+05:30","2026-09-29T15:00:00+05:30"]',
    '("2026-09-29T14:00:00+05:30","2026-09-29T15:00:00+05:30"]',
    '("2026-09-29T14:00:00+05:30","2026-09-29T15:00:00+05:30")',
  ])("rejects non-half-open database ranges: %s", (during) => {
    const row = request({ during }) as unknown as Database["public"]["Tables"]["requests"]["Row"];
    expect(() => mapRequestToEngineRequest(row, null)).toThrow("Expected a half-open [start, end) database interval");
  });

  it("applies the requested window to both booking and blackout range results", async () => {
    setup({
      rooms: [room()],
      requests: [
        request({ id: "booking-overlap", during: '["2026-09-29T08:30:00Z","2026-09-29T09:30:00Z")' }),
        request({ id: "booking-outside", during: '["2026-09-29T10:00:00Z","2026-09-29T11:00:00Z")' }),
      ],
      room_blackouts: [
        { id: "blackout-overlap", room_id: "room-1", during: '["2026-09-29T08:30:00Z","2026-09-29T09:30:00Z")' },
        { id: "blackout-outside", room_id: "room-1", during: '["2026-09-29T10:00:00Z","2026-09-29T11:00:00Z")' },
      ],
    });

    const context = await loadEngineContext({ start: "2026-09-29T09:00:00Z", end: "2026-09-29T10:00:00Z" });
    expect(context.rooms[0].booked.map((item) => item.requestId)).toEqual(["booking-overlap"]);
    expect(context.rooms[0].blackouts).toEqual([{ start: "2026-09-29T08:30:00.000Z", end: "2026-09-29T09:30:00.000Z" }]);
  });

  it("loads department and room history from supported completed-request data", async () => {
    setup({
      requests: [
        request({ priority: 999 }),
        ...["room-old", "room-old", "room-other"].map((room_id, index) => ({
          id: `history-${index}`,
          requester_id: "profile-1",
          status: "completed",
          room_id,
        })),
      ],
      profiles: [{ id: "profile-1", department_id: "dept-1" }],
    });
    const mapped = await loadEngineRequest("request-1");
    expect(mapped.priority).toBe(PURPOSE_PRIORITY.exam);
    expect(mapped.deptId).toBe("dept-1");
    expect(mapped.history).toEqual({ "room-old": 2, "room-other": 1 });
  });

  it("uses valid configured weights and defaults for missing or malformed values", async () => {
    const configured = { ...DEFAULT_WEIGHTS, capacityFit: 0.5 };
    setup({ app_settings: [{ key: "engine_weights", value: configured }] });
    await expect(loadEngineContext()).resolves.toMatchObject({ weights: configured });

    setup();
    await expect(loadEngineContext()).resolves.toMatchObject({ weights: DEFAULT_WEIGHTS });

    setup({ app_settings: [{ key: "engine_weights", value: { capacityFit: "bad" } }] });
    await expect(loadEngineContext()).resolves.toMatchObject({ weights: DEFAULT_WEIGHTS });
  });

  it("fails rather than returning a partial context when a required read fails", async () => {
    mockFrom.mockImplementation((table: string) => {
      const query = makeQuery(table);
      if (table === "buildings") {
        query.then = ((resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: null, error: { message: "database unavailable" } }).then(resolve)) as never;
      }
      return query;
    });
    await expect(loadEngineContext()).rejects.toThrow("Failed to load buildings");
  });

  it("persists moves only through apply_plan with contract payload and virtual time", async () => {
    const offers = { sameRoomOtherSlot: [], similarRoomSameSlot: [] };
    setup({
      requests: [
        request({
          id: "unplaced-1",
          room_id: "room-1",
          status: "pending",
          during: '["2026-09-29T13:00:00Z","2026-09-29T14:00:00Z")',
        }),
      ],
    });
    const plan: Plan = {
      kind: "rehome",
      summary: "Move a request",
      moves: [
        {
          requestId: "request-1",
          roomId: "room-2",
          interval: { start: "2026-09-29T08:30:00Z", end: "2026-09-29T09:30:00Z" },
          status: "approved",
          offers: { sameRoomOtherSlot: [], similarRoomSameSlot: [] },
        },
      ],
      unplaced: [{ requestId: "unplaced-1", alternatives: offers }],
    };
    await persistPlan(plan, "actor-1", "rehome");

    expect(mockRpc).toHaveBeenCalledWith("apply_plan", {
      p_moves: [
        {
          request_id: "request-1",
          room_id: "room-2",
          s: "2026-09-29T08:30:00Z",
          e: "2026-09-29T09:30:00Z",
          status: "approved",
          offers: { sameRoomOtherSlot: [], similarRoomSameSlot: [] },
        },
        {
          request_id: "unplaced-1",
          room_id: "room-1",
          s: "2026-09-29T13:00:00.000Z",
          e: "2026-09-29T14:00:00.000Z",
          status: null,
          offers,
        },
      ],
      p_inserts: [],
      p_actor: "actor-1",
      p_action: "rehome",
      p_at: "2026-09-29T08:30:00.000Z",
    });
    expect(mockFrom).toHaveBeenCalledWith("requests");
    expect(queryCalls.find((call) => call.table === "requests")?.filters).toContainEqual([
      "in",
      "id",
      ["unplaced-1"],
    ]);
    expect(queryCalls.some((call) => call.filters.some(([operation]) => operation === "update"))).toBe(false);
  });

  it("propagates apply_plan RPC failures", async () => {
    mockRpc.mockResolvedValue({ error: { message: "constraint failed" } });
    const plan: Plan = { kind: "lab", summary: "none", moves: [], unplaced: [] };
    await expect(persistPlan(plan, "actor-1", "lab")).rejects.toThrow("constraint failed");
  });
});
