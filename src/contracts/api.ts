/**
 * API request bodies (Zod) and response shapes. FROZEN after Phase 0.
 * Every route handler validates its body with these schemas; the UI imports the same types.
 */
import { z } from "zod";
import { ACCESS_RULES, FEATURES, PURPOSES, ROOM_TYPES } from "./domain";
import type { AppNotification, AuditEntry, BookingRequest, Room } from "./domain";
import type { Alternatives, Plan, RecommendResult, SolveResult } from "./engine";

const iso = z.iso.datetime({ offset: true });
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM");

export const IntervalSchema = z
  .object({ start: iso, end: iso })
  .refine((v) => v.start < v.end, "end must be after start");

// ---------- Requests ----------

/** What the requester confirms after the parsed / manual form. */
export const RequestDraftSchema = z.object({
  title: z.string().min(2).max(120),
  purpose: z.enum(PURPOSES),
  headcount: z.int().min(1).max(5000),
  minSystems: z.int().min(0).default(0),
  requiredFeatures: z.array(z.enum(FEATURES)).default([]),
  roomType: z.enum(ROOM_TYPES).nullable().default(null),
  preferredBuildingId: z.uuid().nullable().default(null),
  during: IntervalSchema,
  source: z.enum(["form", "text", "voice"]).default("form"),
  rawInput: z.string().max(2000).nullable().default(null),
});
export type RequestDraft = z.infer<typeof RequestDraftSchema>;

export const CreateRequestSchema = z.object({
  draft: RequestDraftSchema,
  roomId: z.uuid().nullable(), // null → join the waitlist
});
export type CreateRequestBody = z.infer<typeof CreateRequestSchema>;

export const RejectSchema = z.object({ reason: z.string().min(2).max(300) });
export const AcceptOfferSchema = z.object({
  roomId: z.uuid(),
  during: IntervalSchema,
});

/** 409 body when a slot is taken — never a bare error. */
export interface ConflictResponse {
  error: "SLOT_TAKEN";
  message: string;
  alternatives: Alternatives;
}

export interface RequestDetail {
  request: BookingRequest;
  room: Room | null;
  timeline: AuditEntry[];
}

export type RecommendResponse = RecommendResult & { engineRunId: string };

// ---------- Resources ----------

export const RoomInputSchema = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(2).max(120),
  buildingId: z.uuid(),
  type: z.enum(ROOM_TYPES),
  capacity: z.int().min(1).max(5000),
  systemsCount: z.int().min(0).default(0),
  features: z.array(z.enum(FEATURES)).default([]),
  departmentId: z.uuid().nullable().default(null),
  access: z.enum(ACCESS_RULES).default("open"),
  approverId: z.uuid().nullable().default(null),
  openTime: hhmm.default("08:00"),
  closeTime: hhmm.default("20:00"),
  openDays: z.array(z.int().min(1).max(7)).default([1, 2, 3, 4, 5, 6]),
  attributes: z.record(z.string(), z.unknown()).default({}),
  isActive: z.boolean().default(true),
});
export type RoomInput = z.infer<typeof RoomInputSchema>;

export const BlackoutInputSchema = z.object({
  during: IntervalSchema,
  reason: z.string().min(2).max(200),
});

export interface AvailabilitySlot {
  start: string; // ISO
  end: string;
  state: "free" | "booked" | "held" | "blackout" | "closed";
  requestId?: string;
  label?: string;
}

// ---------- Check-in ----------

export const CheckinSchema = z.object({ roomCode: z.string(), k: z.string() });

// ---------- Lab / disruptions ----------

export const LabRunSchema = z.object({
  scenarioId: z.string(),
  solvers: z.array(z.enum(["fcfs", "greedy", "bnb", "ilp"])).default(["fcfs", "bnb"]),
});
export interface LabRunResponse {
  runId: string;
  results: SolveResult[];
  /** Counterfactual chain, e.g. "FCFS gave Coding Club room B…". */
  explanation: string;
}

export const DisruptionPreviewSchema = z.object({
  roomId: z.uuid(),
  during: IntervalSchema,
  reason: z.string().min(2).max(200),
});
export interface DisruptionPreviewResponse {
  previewId: string;
  affected: number;
  plan: Plan;
}

// ---------- Clock / demo ----------

export const ClockSchema = z.union([
  z.object({ advanceMin: z.int().min(-1440).max(1440) }),
  z.object({ setTo: iso }),
]);
export interface ClockResponse {
  now: string; // virtual now (ISO)
  offsetMs: number;
}

export const DemoLoginSchema = z.object({
  persona: z.enum(["faculty", "club", "approver", "admin", "student"]),
});

// ---------- Dashboard ----------

export const DashboardQuerySchema = z.object({
  from: iso,
  to: iso,
  type: z.enum(ROOM_TYPES).optional(),
  building: z.string().optional(),
});

// ---------- Notifications ----------

export const MarkReadSchema = z.object({ ids: z.array(z.uuid()).min(1) });
export type NotificationsResponse = { items: AppNotification[]; unread: number };

// ---------- Errors ----------

export interface ApiError {
  error: string;
  message: string;
}
