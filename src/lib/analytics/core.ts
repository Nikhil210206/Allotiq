// Typed calls into the analytics_* SQL functions (supabase/analytics/analytics.sql), plus the dashboard
// built from them. Takes the query runner as an argument so it runs against Supabase in the app and against
// a plain Postgres in the parity check. Server code imports ./index, not this. Owner: Nikhil · N7
import type { RoomType } from "@/contracts/domain";
import type { DashboardFilters, DashboardMetrics } from "@/lib/api/types";
import { fmtWhen } from "@/lib/time";

/** Calls one SQL function with named arguments and returns its rows. */
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown[]>;

export type Range = { from: string; to: string; roomType?: string; buildingCode?: string };
export type GhostGroup = "room" | "requester_kind" | "weekday" | "building" | "time_band" | "none";
export type UnmetGroup = "capacity_band" | "time_band" | "room_type" | "none";

export interface RoomUtilization {
  roomId: string;
  code: string;
  name: string;
  type: RoomType;
  buildingCode: string;
  isActive: boolean;
  openHours: number;
  usedHours: number;
  bookings: number;
  occupancyPct: number;
}
export interface UnderusedRoom {
  roomId: string;
  code: string;
  name: string;
  type: RoomType;
  buildingCode: string;
  openHours: number;
  usedHours: number;
  occupancyPct: number;
}
export interface HeatmapCell { weekday: number; hour: number; booked: number; roomHours: number; occupancy: number }
export interface GhostRow { key: string; label: string; bookings: number; ghosts: number; ratePct: number }
export interface UnmetRow { key: string; label: string; requests: number; seats: number }
export interface UnmetRequest { id: string; title: string; headcount: number; start: string; end: string; roomType: string | null; reason: string }
export interface IdleBuilding { buildingCode: string; openHours: number; idleHours: number }

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);
const scope = (r: Range) => ({
  p_from: r.from,
  p_to: r.to,
  p_room_type: r.roomType ?? null,
  p_building_code: r.buildingCode ?? null,
});

export function analytics(rpc: Rpc) {
  const call = async (fn: string, args: Record<string, unknown>) => (await rpc(fn, args)) as Row[];

  const api = {
    async utilization(r: Range & { weekday?: number }): Promise<RoomUtilization[]> {
      const rows = await call("analytics_utilization", { ...scope(r), p_weekday: r.weekday ?? null });
      return rows.map((x) => ({
        roomId: x.room_id as string,
        code: x.code as string,
        name: x.name as string,
        type: x.type as RoomType,
        buildingCode: x.building_code as string,
        isActive: x.is_active as boolean,
        openHours: num(x.open_hours),
        usedHours: num(x.used_hours),
        bookings: num(x.bookings),
        occupancyPct: num(x.occupancy_pct),
      }));
    },

    async heatmap(r: Range): Promise<HeatmapCell[]> {
      const rows = await call("analytics_heatmap", scope(r));
      return rows.map((x) => ({
        weekday: num(x.weekday),
        hour: num(x.hour),
        booked: num(x.booked),
        roomHours: num(x.room_hours),
        occupancy: num(x.occupancy),
      }));
    },

    async ghostRate(r: Range & { groupBy: GhostGroup }): Promise<GhostRow[]> {
      const rows = await call("analytics_ghost_rate", { ...scope(r), p_group_by: r.groupBy });
      return rows.map((x) => ({
        key: x.group_key as string,
        label: x.label as string,
        bookings: num(x.bookings),
        ghosts: num(x.ghosts),
        ratePct: num(x.rate_pct),
      }));
    },

    async unmetDemand(r: Range & { groupBy: UnmetGroup }): Promise<UnmetRow[]> {
      const rows = await call("analytics_unmet_demand", { ...scope(r), p_group_by: r.groupBy });
      return rows.map((x) => ({ key: x.group_key as string, label: x.label as string, requests: num(x.requests), seats: num(x.seats) }));
    },

    async underusedRooms(r: Range & { thresholdPct: number; weekday?: number }): Promise<UnderusedRoom[]> {
      const rows = await call("analytics_underused_rooms", {
        ...scope(r),
        p_threshold_pct: r.thresholdPct,
        p_weekday: r.weekday ?? null,
      });
      return rows.map((x) => ({
        roomId: x.room_id as string,
        code: x.code as string,
        name: x.name as string,
        type: x.type as RoomType,
        buildingCode: x.building_code as string,
        openHours: num(x.open_hours),
        usedHours: num(x.used_hours),
        occupancyPct: num(x.occupancy_pct),
      }));
    },

    async unmetRequests(r: Range): Promise<UnmetRequest[]> {
      const rows = await call("analytics_unmet_requests", scope(r));
      return rows.map((x) => ({
        id: x.request_id as string,
        title: x.title as string,
        headcount: num(x.headcount),
        start: new Date(x.starts as string).toISOString(),
        end: new Date(x.ends as string).toISOString(),
        roomType: (x.room_type as string) ?? null,
        reason: x.reason as string,
      }));
    },

    async idleBuildingHours(r: Range): Promise<IdleBuilding[]> {
      const rows = await call("analytics_idle_building_hours", scope(r));
      return rows.map((x) => ({ buildingCode: x.building_code as string, openHours: num(x.open_hours), idleHours: num(x.idle_hours) }));
    },

    /** Everything the admin dashboard shows, for `f` and the equal-length period before it. */
    async dashboard(f: DashboardFilters): Promise<DashboardMetrics> {
      const cur: Range = { from: f.from, to: f.to, roomType: f.type, buildingCode: f.building };
      const span = Date.parse(f.to) - Date.parse(f.from);
      const prev: Range = { ...cur, from: new Date(Date.parse(f.from) - span).toISOString(), to: f.from };

      const [util, heat, byKind, byTime, byRoom, unmetList, unmetBands, idle, pUtil, pGhost, pUnmet, pIdle] = await Promise.all([
        api.utilization(cur),
        api.heatmap(cur),
        api.ghostRate({ ...cur, groupBy: "requester_kind" }),
        api.ghostRate({ ...cur, groupBy: "time_band" }),
        api.ghostRate({ ...cur, groupBy: "room" }),
        api.unmetRequests(cur),
        api.unmetDemand({ ...cur, groupBy: "capacity_band" }),
        api.idleBuildingHours(cur),
        api.utilization(prev),
        api.ghostRate({ ...prev, groupBy: "none" }),
        api.unmetDemand({ ...prev, groupBy: "none" }),
        api.idleBuildingHours(prev),
      ]);
      return buildDashboard({ util, heat, byKind, byTime, byRoom, unmetList, unmetBands, idle }, { util: pUtil, ghost: pGhost, unmet: pUnmet, idle: pIdle });
    },
  };
  return api;
}

// ── Dashboard assembly (pure) ───────────────────────────────────────────────────

const TYPES: RoomType[] = ["lab", "classroom", "seminar_hall", "meeting_room", "auditorium"];
const HEAT_DAYS = [1, 2, 3, 4, 5, 6];
const HEAT_HOURS = Array.from({ length: 12 }, (_, i) => 8 + i);
const KINDS = [
  { key: "club", label: "Clubs" },
  { key: "student", label: "Students" },
  { key: "department", label: "Departments" },
  { key: "faculty", label: "Faculty" },
];
const TIME_BANDS = [
  { key: "morning", label: "Before noon" },
  { key: "afternoon", label: "12–4 pm" },
  { key: "evening", label: "After 4 pm" },
];
/** Fewer held bookings than this in the previous period and the deltas would be noise, so they're hidden. */
const MIN_PREVIOUS_BOOKINGS = 20;

const pct = (part: number, whole: number) => (whole ? (100 * part) / whole : 0);
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
const occupancy = (rooms: RoomUtilization[]) => pct(sum(rooms, (r) => r.usedHours), sum(rooms, (r) => r.openHours));
const ghostPct = (rows: GhostRow[]) => pct(sum(rows, (r) => r.ghosts), sum(rows, (r) => r.bookings));

export function buildDashboard(
  cur: {
    util: RoomUtilization[];
    heat: HeatmapCell[];
    byKind: GhostRow[];
    byTime: GhostRow[];
    byRoom: GhostRow[];
    unmetList: UnmetRequest[];
    unmetBands: UnmetRow[];
    idle: IdleBuilding[];
  },
  prev: { util: RoomUtilization[]; ghost: GhostRow[]; unmet: UnmetRow[]; idle: IdleBuilding[] },
): DashboardMetrics {
  const summary = {
    occupancyPct: occupancy(cur.util),
    ghostRatePct: ghostPct(cur.byKind),
    unmet: cur.unmetList.length,
    idleBuildingHours: sum(cur.idle, (b) => b.idleHours),
  };
  const previous = {
    occupancyPct: occupancy(prev.util),
    ghostRatePct: ghostPct(prev.ghost),
    unmet: sum(prev.unmet, (u) => u.requests),
    idleBuildingHours: sum(prev.idle, (b) => b.idleHours),
  };
  const previousAvailable = sum(prev.util, (r) => r.bookings) > MIN_PREVIOUS_BOOKINGS;

  const group = (rows: GhostRow[], order: { key: string; label: string }[]) =>
    order.map(({ key, label }) => {
      const r = rows.find((x) => x.key === key);
      return { label, count: r?.ghosts ?? 0, ratePct: r ? pct(r.ghosts, r.bookings) : 0 };
    });

  return {
    summary: {
      ...summary,
      bookings: sum(cur.util, (r) => r.bookings),
      previous: previousAvailable ? previous : summary,
      byType: TYPES.map((type) => {
        const rooms = cur.util.filter((r) => r.type === type);
        return { type, rooms: rooms.length, occupancyPct: occupancy(rooms) };
      }).filter((t) => t.rooms > 0),
    },
    heatmap: {
      days: HEAT_DAYS,
      hours: HEAT_HOURS,
      cells: HEAT_DAYS.map((d) => HEAT_HOURS.map((h) => cur.heat.find((c) => c.weekday === d && c.hour === h)?.occupancy ?? 0)),
    },
    ghost: {
      ratePct: summary.ghostRatePct,
      byKind: group(cur.byKind, KINDS),
      byTime: group(cur.byTime, TIME_BANDS),
      topRooms: cur.byRoom
        .filter((r) => r.ghosts > 0)
        .sort((a, b) => b.ghosts - a.ghosts || a.label.localeCompare(b.label))
        .slice(0, 5)
        .map((r) => ({ roomId: r.key, code: r.label, count: r.ghosts })),
    },
    unmet: {
      total: cur.unmetList.length,
      items: cur.unmetList.map((u) => ({
        id: u.id,
        title: u.title,
        headcount: u.headcount,
        when: fmtWhen({ start: u.start, end: u.end }),
        reason: u.reason,
      })),
      byBand: cur.unmetBands.map((b) => ({ label: b.label, count: b.requests })),
    },
    underused: {
      rooms: cur.util
        .filter((r) => r.isActive && r.openHours > 0)
        .sort((a, b) => a.occupancyPct - b.occupancyPct || a.code.localeCompare(b.code))
        .slice(0, 6)
        .map((r) => ({ roomId: r.roomId, code: r.code, name: r.name, type: r.type, occupancyPct: r.occupancyPct })),
    },
    previousAvailable,
  };
}
