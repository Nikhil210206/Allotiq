/**
 * Shared domain vocabulary. FROZEN after Phase 0 — changes need a PR approved by all three.
 * Must stay in sync with supabase/migrations (enums, transitions, priorities).
 */

export const TZ = "Asia/Kolkata";

/** ISO-8601 timestamp with offset, e.g. "2026-10-01T14:00:00+05:30". */
export type ISO = string;
/** Half-open interval [start, end). 16:00–18:00 and 18:00–20:00 do NOT overlap. */
export interface Interval {
  start: ISO;
  end: ISO;
}

export const USER_ROLES = ["requester", "approver", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const REQUESTER_KINDS = ["faculty", "club", "department", "student"] as const;
export type RequesterKind = (typeof REQUESTER_KINDS)[number];

export const ROOM_TYPES = ["lab", "classroom", "seminar_hall", "meeting_room", "auditorium"] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export const ACCESS_RULES = ["open", "dept_only"] as const;
export type AccessRule = (typeof ACCESS_RULES)[number];

export const FEATURES = [
  "projector",
  "mic",
  "computers",
  "smart_board",
  "ac",
  "video_conf",
  "whiteboard",
  "stage",
  "recording",
] as const;
export type Feature = (typeof FEATURES)[number];

export const PURPOSES = [
  "exam",
  "academic",
  "department_event",
  "club_event",
  "meeting",
  "student_activity",
] as const;
export type Purpose = (typeof PURPOSES)[number];

/** Priority is always derived server-side from purpose — never taken from client input. */
export const PURPOSE_PRIORITY: Record<Purpose, number> = {
  exam: 50,
  academic: 40,
  department_event: 30,
  meeting: 20,
  club_event: 20,
  student_activity: 10,
};
/** Requests at or above this priority count as "priority requests" in metrics. */
export const PRIORITY_THRESHOLD = 40;

export const REQUEST_STATUSES = [
  "waitlisted",
  "pending",
  "approved",
  "checked_in",
  "completed",
  "rejected",
  "expired",
  "cancelled",
  "auto_released",
  "bumped",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Statuses that occupy a room slot (covered by the DB exclusion constraint). */
export const ACTIVE_STATUSES = ["pending", "approved", "checked_in"] as const satisfies readonly RequestStatus[];

/** Mirrors is_valid_transition() in the DB. A room change while approved is a "rehome", not a transition. */
export const TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  waitlisted: ["pending", "approved", "cancelled", "expired"],
  pending: ["approved", "rejected", "expired", "cancelled", "bumped"],
  approved: ["checked_in", "auto_released", "cancelled", "bumped"],
  checked_in: ["completed"],
  bumped: ["pending", "cancelled", "expired", "waitlisted"],
  completed: [],
  rejected: [],
  expired: [],
  cancelled: [],
  auto_released: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Timing rules (minutes). Tunable at runtime via app_settings; these are the defaults. */
export const TIMING = {
  holdMaxMinutes: 120,
  holdMinMinutes: 10,
  holdBeforeStartMinutes: 30,
  checkinEarlyMinutes: 10,
  noShowGraceMinutes: 15,
  bumpNoticeHours: 24,
} as const;

// ---------- Entities as returned by the API (camelCase) ----------

export interface Building {
  id: string;
  code: string;
  name: string;
  lat: number | null;
  lng: number | null;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  buildingId: string | null;
}

export interface Profile {
  id: string;
  fullName: string;
  role: UserRole;
  kind: RequesterKind | null;
  departmentId: string | null;
  orgName: string | null;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  buildingId: string;
  type: RoomType;
  capacity: number;
  systemsCount: number;
  features: Feature[];
  departmentId: string | null;
  access: AccessRule;
  approverId: string | null;
  openTime: string; // "HH:MM"
  closeTime: string; // "HH:MM"
  openDays: number[]; // ISO weekdays, 1 = Monday
  attributes: Record<string, unknown>;
  isActive: boolean;
}

export interface Blackout {
  id: string;
  roomId: string;
  during: Interval;
  reason: string;
}

export type RequestSource = "form" | "text" | "voice" | "lab" | "seed";

export interface BookingRequest {
  id: string;
  requesterId: string;
  title: string;
  purpose: Purpose;
  priority: number;
  headcount: number;
  minSystems: number;
  requiredFeatures: Feature[];
  roomType: RoomType | null;
  preferredBuildingId: string | null;
  during: Interval;
  roomId: string | null;
  status: RequestStatus;
  holdExpiresAt: ISO | null;
  checkedInAt: ISO | null;
  decisionReason: string | null;
  unplacedReason: string | null;
  offeredAlternatives: unknown | null; // engine Alternatives, see contracts/engine.ts
  scoreBreakdown: unknown | null; // engine ScoreBreakdown
  source: RequestSource;
  createdAt: ISO;
}

export interface AppNotification {
  id: string;
  userId: string;
  kind: string;
  title: string;
  body: string | null;
  requestId: string | null;
  createdAt: ISO;
  readAt: ISO | null;
}

export interface AuditEntry {
  id: number;
  at: ISO;
  actorId: string | null;
  entity: "request" | "room" | "blackout";
  entityId: string;
  action: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus | null;
  details: Record<string, unknown>;
}
