/**
 * Allocation engine input/output. FROZEN after Phase 0.
 * The engine (src/engine) is pure TypeScript: it only ever sees these types, never the DB.
 */
import type { Feature, Interval, ISO, RequestStatus, RoomType } from "./domain";

export interface EngineBooking {
  requestId: string;
  interval: Interval;
  priority: number;
  status: RequestStatus;
  /** false for checked-in bookings — they are never moved. */
  movable: boolean;
}

export interface EngineRoom {
  id: string;
  code: string;
  buildingId: string;
  type: RoomType;
  capacity: number;
  systems: number;
  features: Feature[];
  deptId: string | null;
  access: "open" | "dept_only";
  hours: { open: string; close: string; days: number[] }; // "HH:MM", ISO weekdays
  blackouts: Interval[];
  booked: EngineBooking[];
}

export interface EngineRequest {
  id: string;
  requesterId: string;
  deptId: string | null;
  headcount: number;
  minSystems: number;
  features: Feature[];
  /** Features that are nice to have (scored, not required). */
  niceToHave?: Feature[];
  roomType?: RoomType;
  interval: Interval;
  priority: number;
  createdAt: ISO;
  preferredBuildingId?: string;
  /** roomId → number of past completed bookings by this requester. */
  history: Record<string, number>;
  /** Display label used in explanations and the Lab, e.g. "AI Club". */
  label?: string;
}

export interface Weights {
  capacityFit: number;
  featureMatch: number;
  proximity: number;
  scarcity: number;
  preference: number;
  energy: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  capacityFit: 0.3,
  featureMatch: 0.1,
  proximity: 0.2,
  scarcity: 0.2,
  preference: 0.1,
  energy: 0.1,
};

export interface EngineContext {
  rooms: EngineRoom[];
  buildings: { id: string; lat: number | null; lng: number | null }[];
  /** departmentId → buildingId, for the proximity score. */
  deptBuilding: Record<string, string>;
  weights: Weights;
  now: ISO;
  tz: "Asia/Kolkata";
}

export type ViolationCode =
  | "CAPACITY"
  | "SYSTEMS"
  | "FEATURE"
  | "TYPE"
  | "ACCESS"
  | "HOURS"
  | "BLACKOUT"
  | "OVERLAP";

export interface Violation {
  code: ViolationCode;
  message: string; // human-readable, e.g. "Only 48 systems (needs 60)"
}

export interface ScoreBreakdown {
  /** Each component is 0..1. */
  capacityFit: number;
  featureMatch: number;
  proximity: number;
  scarcity: number;
  preference: number;
  energy: number;
  weights: Weights;
  /** 0..100 */
  total: number;
  wastedSeats: number;
  /** Human reasons, best first: "Same building as C.Tech", "64 systems ≥ 60". */
  notes: string[];
}

export interface Candidate {
  roomId: string;
  score: ScoreBreakdown;
}

export interface Assignment {
  requestId: string;
  roomId: string | null;
  /** Interval actually assigned (differs from the request only for other-slot offers). */
  interval?: Interval;
  score?: ScoreBreakdown;
  reason?: string;
}

export type SolverName = "fcfs" | "greedy" | "bnb" | "ilp";

export interface SolveMetrics {
  placed: number;
  total: number;
  priorityPlaced: number;
  priorityTotal: number;
  seatsWasted: number;
  buildingsActive: number;
  objective: number;
  ms: number;
  nodes: number;
}

export type TraceEvent =
  | { type: "try"; requestId: string; roomId: string }
  | { type: "place"; requestId: string; roomId: string }
  | { type: "blocked"; requestId: string; reason: string }
  | { type: "incumbent"; objective: number; placed: number };

export interface SolveResult {
  solver: SolverName;
  assignments: Assignment[];
  metrics: SolveMetrics;
  timedOut: boolean;
  trace: TraceEvent[];
}

export interface SolveOptions {
  timeoutMs?: number; // default 1500
  nodeLimit?: number; // default 200_000
  /** Request ids that must be placed (used by bumping/rehoming). */
  mustPlace?: string[];
}

export interface Solver {
  name: SolverName;
  solve(reqs: EngineRequest[], ctx: EngineContext, opts?: SolveOptions): SolveResult;
}

// ---------- Recommendations & alternatives ----------

export interface Recommendation {
  roomId: string;
  score: ScoreBreakdown;
  /** Template "why this room" bullets (always present, no LLM needed). */
  why: string[];
}

export interface Excluded {
  roomId: string;
  violations: Violation[];
}

export interface Alternatives {
  sameRoomOtherSlot: { roomId: string; interval: Interval }[];
  similarRoomSameSlot: Recommendation[];
}

export interface RecommendResult {
  top: Recommendation[]; // up to 3
  whyNot: Excluded[]; // a few notable exclusions
  alternatives: Alternatives | null; // present when nothing is free as requested
}

// ---------- Plans (bump / rehome / waitlist / lab) ----------

export interface PlanMove {
  requestId: string;
  roomId: string | null;
  interval: Interval;
  status?: RequestStatus;
  offers?: Alternatives;
}

export interface Plan {
  kind: "rehome" | "bump_with_offer" | "disruption" | "waitlist_fill" | "lab";
  moves: PlanMove[];
  /** Requests the plan could not place, with what to offer them. */
  unplaced: { requestId: string; alternatives: Alternatives }[];
  summary: string;
}
