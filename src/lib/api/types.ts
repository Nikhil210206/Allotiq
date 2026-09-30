// UI-facing response shapes that the frozen contracts leave open. Everything here is additive to
// src/contracts — backend handlers can return exactly these (extra fields are fine). Owner: Nikhil
import type { AuditEntry, BookingRequest, Building, Department, Profile, Room, RoomType } from "@/contracts/domain";
import type { EngineRequest, SolveResult, SolverName } from "@/contracts/engine";

/** GET /api/requests, GET /api/approvals rows: the request plus who asked (for cards and queues). */
export type RequestRow = BookingRequest & {
  requester?: Pick<Profile, "fullName" | "kind" | "orgName" | "departmentId">;
};

/** GET /api/rooms → Room[]; the catalog bits screens need alongside it. */
export interface Catalog {
  rooms: Room[];
  buildings: Building[];
  departments: Department[];
}

/** GET /api/lab/scenarios rows (lab_scenarios table). `rooms` limits the board to those room ids. */
export interface LabScenario {
  id: string;
  name: string;
  description: string;
  requests: EngineRequest[];
  roomIds?: string[];
  /** Scenarios may bring their own rooms (e.g. the brief's A/B/C fixture). */
  rooms?: Room[];
  /** Requests exist only in the scenario, so its plan can be shown but not applied to real bookings. */
  sandbox?: boolean;
}

/** POST /api/lab/replay: re-solves a recorded Lab run from its stored snapshot and diffs it with the recording. */
export interface LabReplayResponse {
  runId: string;
  baseline: SolveResult;
  results: SolveResult[];
  explanation: string;
  comparison: {
    baselineSolver: SolverName;
    replaySolver: SolverName;
    changes: { requestId: string; beforeRoomId: string | null; afterRoomId: string | null }[];
  };
}

// ---------- Dashboard (GET /api/dashboard/{metric}) ----------

export interface DashboardFilters {
  from: string;
  to: string;
  type?: RoomType;
  building?: string;
}

export interface SummaryMetric {
  occupancyPct: number;
  ghostRatePct: number;
  unmet: number;
  idleBuildingHours: number;
  bookings: number;
  /** Same metrics for the equal-length period before `from`. */
  previous: { occupancyPct: number; ghostRatePct: number; unmet: number; idleBuildingHours: number };
  byType: { type: RoomType; occupancyPct: number; rooms: number }[];
}

export interface HeatmapMetric {
  /** ISO weekdays shown as rows (Mon–Sat). */
  days: number[];
  /** Hour starts shown as columns (8…19). */
  hours: number[];
  /** cells[dayIndex][hourIndex] = occupancy 0…1 */
  cells: number[][];
}

export interface GhostMetric {
  ratePct: number;
  byKind: { label: string; ratePct: number; count: number }[];
  byTime: { label: string; ratePct: number; count: number }[];
  topRooms: { roomId: string; code: string; count: number }[];
}

export interface UnmetMetric {
  total: number;
  items: { id: string; title: string; headcount: number; when: string; reason: string }[];
  byBand: { label: string; count: number }[];
}

export interface UnderusedMetric {
  rooms: { roomId: string; code: string; name: string; type: RoomType; occupancyPct: number }[];
}

export interface DashboardMetrics {
  summary: SummaryMetric;
  heatmap: HeatmapMetric;
  ghost: GhostMetric;
  unmet: UnmetMetric;
  underused: UnderusedMetric;
  /** False when there's no earlier period to compare with (deltas are hidden). */
  previousAvailable: boolean;
}

/** GET /api/audit rows, with a readable line for feeds. */
export type AuditRow = AuditEntry & { summary?: string };
