import { describe, expect, it } from "vitest";
import { analytics, buildDashboard, type GhostRow, type RoomUtilization } from "../core";

const room = (code: string, type: RoomUtilization["type"], openHours: number, usedHours: number, bookings: number, isActive = true): RoomUtilization => ({
  roomId: `id-${code}`,
  code,
  name: `${code} room`,
  type,
  buildingCode: code.split("-")[0],
  isActive,
  openHours,
  usedHours,
  bookings,
  occupancyPct: openHours ? (100 * usedHours) / openHours : 0,
});
const ghost = (key: string, bookings: number, ghosts: number, label = key): GhostRow => ({
  key,
  label,
  bookings,
  ghosts,
  ratePct: (100 * ghosts) / bookings,
});

const util = [
  room("TP-401", "lab", 100, 40, 30),
  room("TP-402", "lab", 100, 10, 8),
  room("UB-101", "classroom", 200, 50, 40),
  room("UB-999", "classroom", 100, 0, 0, false),
];

const cur = {
  util,
  heat: [{ weekday: 1, hour: 10, booked: 3, roomHours: 12, occupancy: 0.25 }],
  byKind: [ghost("club", 40, 10), ghost("faculty", 38, 2)],
  byTime: [ghost("evening", 20, 8), ghost("morning", 58, 4)],
  byRoom: [ghost("id-TP-402", 8, 1, "TP-402"), ghost("id-TP-401", 30, 6, "TP-401"), ghost("id-UB-101", 40, 0, "UB-101")],
  unmetList: [
    { id: "u1", title: "Annual meetup", headcount: 160, start: "2026-09-25T12:30:00.000Z", end: "2026-09-25T14:30:00.000Z", roomType: "seminar_hall", reason: "No hall" },
  ],
  unmetBands: [{ key: "150_plus", label: "150+ seats", requests: 1, seats: 160 }],
  idle: [
    { buildingCode: "TP", openHours: 100, idleHours: 30 },
    { buildingCode: "UB", openHours: 100, idleHours: 50 },
  ],
};
const prev = {
  util: [room("TP-401", "lab", 100, 20, 25)],
  ghost: [ghost("all", 25, 5)],
  unmet: [{ key: "all", label: "All", requests: 3, seats: 400 }],
  idle: [{ buildingCode: "TP", openHours: 100, idleHours: 90 }],
};

describe("buildDashboard", () => {
  const m = buildDashboard(cur, prev);

  it("weights occupancy by open hours, not by averaging room percentages", () => {
    expect(m.summary.occupancyPct).toBeCloseTo((100 * 100) / 500);
    expect(m.summary.byType).toEqual([
      { type: "lab", rooms: 2, occupancyPct: 25 },
      { type: "classroom", rooms: 2, occupancyPct: (100 * 50) / 300 },
    ]);
  });

  it("totals ghost rate, unmet and idle hours", () => {
    expect(m.summary.ghostRatePct).toBeCloseTo((100 * 12) / 78);
    expect(m.summary.unmet).toBe(1);
    expect(m.summary.idleBuildingHours).toBe(80);
    expect(m.summary.bookings).toBe(78);
  });

  it("compares with the previous period when it has enough bookings", () => {
    expect(m.previousAvailable).toBe(true);
    expect(m.summary.previous).toEqual({ occupancyPct: 20, ghostRatePct: 20, unmet: 3, idleBuildingHours: 90 });
  });

  it("hides the comparison when the previous period is too thin", () => {
    const thin = buildDashboard(cur, { ...prev, util: [room("TP-401", "lab", 100, 2, 3)] });
    expect(thin.previousAvailable).toBe(false);
    expect(thin.summary.previous.occupancyPct).toBe(thin.summary.occupancyPct);
  });

  it("lays the heatmap out Mon–Sat × 8:00–19:00 and fills gaps with 0", () => {
    expect(m.heatmap.days).toEqual([1, 2, 3, 4, 5, 6]);
    expect(m.heatmap.hours[0]).toBe(8);
    expect(m.heatmap.hours.at(-1)).toBe(19);
    expect(m.heatmap.cells[0][2]).toBe(0.25);
    expect(m.heatmap.cells[1][2]).toBe(0);
  });

  it("labels ghost groups in a fixed order, with zeroes for groups that had no bookings", () => {
    expect(m.ghost.byKind.map((g) => g.label)).toEqual(["Clubs", "Students", "Departments", "Faculty"]);
    expect(m.ghost.byKind[0]).toEqual({ label: "Clubs", count: 10, ratePct: 25 });
    expect(m.ghost.byKind[1]).toEqual({ label: "Students", count: 0, ratePct: 0 });
    expect(m.ghost.byTime.map((g) => g.label)).toEqual(["Before noon", "12–4 pm", "After 4 pm"]);
  });

  it("ranks ghost rooms by count and drops rooms with none", () => {
    expect(m.ghost.topRooms).toEqual([
      { roomId: "id-TP-401", code: "TP-401", count: 6 },
      { roomId: "id-TP-402", code: "TP-402", count: 1 },
    ]);
  });

  it("lists underused rooms quietest first, skipping inactive ones", () => {
    expect(m.underused.rooms.map((r) => r.code)).toEqual(["TP-402", "UB-101", "TP-401"]);
  });

  it("formats unmet requests for the list", () => {
    expect(m.unmet.items[0]).toMatchObject({ id: "u1", headcount: 160, reason: "No hall" });
    expect(m.unmet.items[0].when).toContain("·");
    expect(m.unmet.byBand).toEqual([{ label: "150+ seats", count: 1 }]);
  });
});

describe("analytics() argument mapping", () => {
  it("passes named p_* arguments, with null for missing filters", async () => {
    const calls: [string, Record<string, unknown>][] = [];
    const a = analytics(async (fn, args) => {
      calls.push([fn, args]);
      return [];
    });
    await a.underusedRooms({ from: "2026-09-01T00:00:00Z", to: "2026-09-29T00:00:00Z", roomType: "lab", thresholdPct: 20, weekday: 5 });
    await a.ghostRate({ from: "2026-09-01T00:00:00Z", to: "2026-09-29T00:00:00Z", groupBy: "room" });
    expect(calls).toEqual([
      [
        "analytics_underused_rooms",
        { p_from: "2026-09-01T00:00:00Z", p_to: "2026-09-29T00:00:00Z", p_room_type: "lab", p_building_code: null, p_threshold_pct: 20, p_weekday: 5 },
      ],
      [
        "analytics_ghost_rate",
        { p_from: "2026-09-01T00:00:00Z", p_to: "2026-09-29T00:00:00Z", p_room_type: null, p_building_code: null, p_group_by: "room" },
      ],
    ]);
  });
});
