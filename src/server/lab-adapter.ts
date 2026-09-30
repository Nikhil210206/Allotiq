// Validated DB boundary for Lab scenarios. Owner: Aaditya · A9
import "server-only";
import { IntervalSchema } from "@/contracts/api";
import { FEATURES, REQUEST_STATUSES, ROOM_TYPES } from "@/contracts/domain";
import type { EngineContext, EngineRequest } from "@/contracts/engine";
import type { LabScenario } from "@/lib/api/types";
import { parseRange } from "@/lib/db/mappers";
import { db } from "@/lib/db/server";
import { z } from "zod";

const EngineRequestSchema = z.object({
  id: z.uuid(),
  requesterId: z.uuid(),
  deptId: z.uuid().nullable(),
  headcount: z.int().min(1).max(5000),
  minSystems: z.int().min(0).max(5000),
  features: z.array(z.enum(FEATURES)).max(FEATURES.length),
  niceToHave: z.array(z.enum(FEATURES)).max(FEATURES.length).optional(),
  roomType: z.enum(ROOM_TYPES).optional(),
  interval: IntervalSchema,
  priority: z.int().min(0).max(100),
  createdAt: z.iso.datetime({ offset: true }),
  preferredBuildingId: z.uuid().optional(),
  history: z.record(z.uuid(), z.int().nonnegative()),
  label: z.string().max(120).optional(),
}).strict() satisfies z.ZodType<EngineRequest>;

const ScenarioRequestsSchema = z.array(EngineRequestSchema).min(1).max(100);
const ClockTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

const EngineContextSchema: z.ZodType<EngineContext> = z.object({
  rooms: z.array(z.object({
    id: z.uuid(), code: z.string().min(1).max(40), buildingId: z.uuid(), type: z.enum(ROOM_TYPES),
    capacity: z.int().min(1).max(5000), systems: z.int().min(0).max(5000), features: z.array(z.enum(FEATURES)).max(FEATURES.length),
    deptId: z.uuid().nullable(), access: z.enum(["open", "dept_only"]),
    hours: z.object({ open: ClockTimeSchema, close: ClockTimeSchema, days: z.array(z.int().min(1).max(7)) }).strict(),
    blackouts: z.array(IntervalSchema),
    booked: z.array(z.object({ requestId: z.uuid(), interval: IntervalSchema, priority: z.int(), status: z.enum(REQUEST_STATUSES), movable: z.boolean() }).strict()),
  }).strict()),
  buildings: z.array(z.object({ id: z.uuid(), lat: z.number().nullable(), lng: z.number().nullable() }).strict()),
  deptBuilding: z.record(z.uuid(), z.uuid()),
  weights: z.object({ capacityFit: z.number().nonnegative(), featureMatch: z.number().nonnegative(), proximity: z.number().nonnegative(), scarcity: z.number().nonnegative(), preference: z.number().nonnegative(), energy: z.number().nonnegative() }).strict(),
  now: z.iso.datetime({ offset: true }), tz: z.literal("Asia/Kolkata"),
}).strict();

export const LabRunRecordInputSchema = z.object({
  scenarioId: z.string().min(1),
  solvers: z.array(z.enum(["fcfs", "greedy", "bnb", "ilp"])).min(1),
  requests: ScenarioRequestsSchema,
  requestStates: z.array(z.object({
    id: z.uuid(),
    status: z.enum(REQUEST_STATUSES),
    roomId: z.uuid().nullable(),
    interval: IntervalSchema,
  }).strict()),
  context: EngineContextSchema.optional(),
}).strict().superRefine((value, context) => {
  if (new Set(value.solvers).size !== value.solvers.length) {
    context.addIssue({ code: "custom", path: ["solvers"], message: "Duplicate Lab solver names" });
  }
  const requestIds = new Set(value.requests.map((request) => request.id));
  if (requestIds.size !== value.requests.length) {
    context.addIssue({ code: "custom", path: ["requests"], message: "Duplicate Lab request IDs" });
  }
  const snapshotIds = new Set(value.requestStates.map((state) => state.id));
  if (snapshotIds.size !== value.requestStates.length || value.requestStates.some((state) => !requestIds.has(state.id))) {
    context.addIssue({ code: "custom", path: ["requestStates"], message: "Invalid Lab request state snapshot" });
  }
});

export const LabRunInputSchema = LabRunRecordInputSchema;
export type LabRunInput = z.infer<typeof LabRunInputSchema>;

export function parseLabInterval(raw: unknown) {
  const value = String(raw);
  if (!value.startsWith("[") || !value.endsWith(")")) {
    throw new Error("Expected a half-open Lab request interval");
  }
  return parseRange(value);
}

/** Snapshot of persisted rows at simulation time, used to reject stale apply attempts. */
export async function loadLabRequestStates(requestIds: string[]): Promise<LabRunInput["requestStates"]> {
  const { data, error } = await db()
    .from("requests")
    .select("id, status, room_id, during")
    .in("id", requestIds);
  if (error) throw new Error("Unable to validate Lab request state");
  return (data ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    roomId: row.room_id,
    interval: parseLabInterval(row.during),
  })).sort((a, b) => a.id.localeCompare(b.id));
}

// The requests column holds either the requests array or { roomIds, requests } to limit the Lab to a room pool.
const ScenarioPoolSchema = z.object({ roomIds: z.array(z.uuid()).min(1).max(100), requests: z.unknown() }).strict();

function mapScenario(row: { id: string; name: string; description: string | null; requests: unknown }): LabScenario {
  const pooled = ScenarioPoolSchema.safeParse(row.requests);
  const requests = validateScenarioRequests(pooled.success ? pooled.data.requests : row.requests);
  return { id: row.id, name: row.name, description: row.description ?? "", requests, ...(pooled.success ? { roomIds: pooled.data.roomIds } : {}) };
}

export function validateScenarioRequests(value: unknown): EngineRequest[] {
  const requests = ScenarioRequestsSchema.parse(value);
  const ids = new Set<string>();
  for (const request of requests) {
    if (ids.has(request.id)) throw new Error("Scenario contains duplicate request IDs");
    ids.add(request.id);
  }
  return requests;
}

export async function listLabScenarios(): Promise<LabScenario[]> {
  const { data, error } = await db()
    .from("lab_scenarios")
    .select("id, name, description, requests")
    .order("name", { ascending: true });
  if (error) throw new Error("Unable to load Lab scenarios");
  const scenarios = (data ?? []).map(mapScenario);
  // Scenario-only requests can't be applied (apply has no insert payload), so the UI hides Apply for them.
  const allIds = scenarios.flatMap((scenario) => scenario.requests.map((request) => request.id));
  const existing = new Set<string>();
  if (allIds.length) {
    const { data: rows, error: rowsError } = await db().from("requests").select("id").in("id", allIds);
    if (rowsError) throw new Error("Unable to load Lab scenarios");
    for (const row of rows ?? []) existing.add(row.id);
  }
  return scenarios.map((scenario) => ({ ...scenario, sandbox: !scenario.requests.some((request) => existing.has(request.id)) }));
}

export async function loadLabScenario(scenarioId: string): Promise<LabScenario | null> {
  const { data, error } = await db()
    .from("lab_scenarios")
    .select("id, name, description, requests")
    .eq("id", scenarioId)
    .maybeSingle();
  if (error) throw new Error("Unable to load Lab scenario");
  return data ? mapScenario(data) : null;
}

