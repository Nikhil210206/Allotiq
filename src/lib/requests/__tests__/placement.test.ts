import { describe, expect, it, vi } from "vitest";
import type { BookingRequest } from "@/contracts/domain";

vi.mock("server-only", () => ({}));
const { placementViolations } = await import("../placement");

/** Every chained query method returns the builder; awaiting it yields the canned rows for that table. */
function fakeDb(tables: Record<string, unknown>) {
  const builder = (data: unknown): unknown =>
    new Proxy(
      {},
      {
        get: (_t, prop) =>
          prop === "then"
            ? (resolve: (v: unknown) => void) => resolve({ data, error: null })
            : () => builder(data),
      },
    );
  return { from: (table: string) => builder(tables[table]) } as never;
}

// Wednesday 10:00–11:00 IST
const during = { start: "2026-10-07T04:30:00.000Z", end: "2026-10-07T05:30:00.000Z" };

const request: BookingRequest = {
  id: "w1",
  requesterId: "u1",
  title: "DBMS lab",
  purpose: "academic",
  priority: 3,
  headcount: 30,
  minSystems: 0,
  requiredFeatures: [],
  roomType: null,
  preferredBuildingId: null,
  during,
  roomId: null,
  status: "waitlisted",
  holdExpiresAt: null,
  checkedInAt: null,
  decisionReason: null,
  unplacedReason: null,
  offeredAlternatives: null,
  scoreBreakdown: null,
  source: "form",
  createdAt: "2026-10-06T00:00:00.000Z",
};

const room = {
  id: "room1",
  code: "TP-201",
  building_id: "b1",
  type: "lab",
  capacity: 60,
  systems_count: 60,
  features: ["projector", "computers"],
  department_id: null,
  access: "open",
  open_time: "08:00:00", // Postgres `time` comes back as HH:MM:SS
  close_time: "20:00:00",
  open_days: [1, 2, 3, 4, 5, 6],
};

const tables = (over: Record<string, unknown> = {}) => ({
  rooms: room,
  room_blackouts: [],
  requests: [],
  profiles: { department_id: null },
  ...over,
});

const NOW = "2026-10-07T04:00:00.000Z";

describe("placementViolations", () => {
  it("accepts a request the room can host", async () => {
    expect(await placementViolations(fakeDb(tables()), request, "room1", NOW)).toEqual([]);
  });

  it("rejects a room that lacks a required feature", async () => {
    const v = await placementViolations(fakeDb(tables()), { ...request, requiredFeatures: ["stage"] }, "room1", NOW);
    expect(v.map((x) => x.code)).toEqual(["FEATURE"]);
  });

  it("rejects the wrong room type, too few systems and too small a room — every reason, not just the first", async () => {
    const v = await placementViolations(
      fakeDb(tables()),
      { ...request, roomType: "auditorium", minSystems: 100, headcount: 80 },
      "room1",
      NOW,
    );
    expect(v.map((x) => x.code).sort()).toEqual(["CAPACITY", "SYSTEMS", "TYPE"]);
  });

  it("rejects a slot that overlaps an active booking", async () => {
    const booked = [{ id: "other", during: `["2026-10-07 04:30:00+00","2026-10-07 05:00:00+00")`, priority: 3, status: "approved" }];
    const v = await placementViolations(fakeDb(tables({ requests: booked })), request, "room1", NOW);
    expect(v.map((x) => x.code)).toEqual(["OVERLAP"]);
  });

  it("rejects a slot inside a blackout", async () => {
    const blackouts = [{ during: `["2026-10-07 04:00:00+00","2026-10-07 06:00:00+00")` }];
    const v = await placementViolations(fakeDb(tables({ room_blackouts: blackouts })), request, "room1", NOW);
    expect(v.map((x) => x.code)).toEqual(["BLACKOUT"]);
  });

  it("rejects a room that no longer exists", async () => {
    const v = await placementViolations(fakeDb(tables({ rooms: null })), request, "gone", NOW);
    expect(v).toHaveLength(1);
  });
});
