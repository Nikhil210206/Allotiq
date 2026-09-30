// POST /api/disruptions/apply — Persist a validated disruption plan and notify requesters
// Owner: Aaditya · Task A11
import { ACTIVE_STATUSES, REQUEST_STATUSES, TIMING, type Interval } from "@/contracts/domain";
import { IntervalSchema } from "@/contracts/api";
import type { Plan } from "@/contracts/engine";
import { affectedDisruptionRequests, previewDisruption } from "@/engine/disruption";
import { overlaps } from "@/engine/time";
import { requireRole } from "@/lib/auth/session";
import { getNow } from "@/lib/clock";
import { db } from "@/lib/db/server";
import { parseRange } from "@/lib/db/mappers";
import type { Json } from "@/lib/db/types.gen";
import { apiError } from "@/lib/http";
import { notify } from "@/lib/notify";
import { loadEngineContext, loadEngineRequest } from "@/server/engine-adapter";
import { z } from "zod";

const ApplySchema = z.object({ previewId: z.uuid() }).strict();
const StateSchema = z.object({
  id: z.uuid(),
  status: z.enum(ACTIVE_STATUSES),
  roomId: z.uuid(),
  interval: IntervalSchema,
}).strict();
const StoredInputSchema = z.object({
  roomId: z.uuid(),
  during: IntervalSchema,
  reason: z.string().min(2).max(200),
  affectedRequestIds: z.array(z.uuid()),
  requestStates: z.array(StateSchema),
}).strict();
const AlternativesSchema = z.object({
  sameRoomOtherSlot: z.array(z.object({ roomId: z.uuid(), interval: IntervalSchema }).strict()).max(3),
  similarRoomSameSlot: z.array(z.object({ roomId: z.uuid(), score: z.unknown(), why: z.array(z.string()) }).passthrough()).max(3),
}).strict();
const PlanSchema = z.object({
  kind: z.enum(["rehome", "bump_with_offer", "disruption", "waitlist_fill", "lab"]),
  moves: z.array(z.object({
    requestId: z.uuid(), roomId: z.uuid().nullable(), interval: IntervalSchema,
    status: z.enum(REQUEST_STATUSES).optional(), offers: AlternativesSchema.optional(),
  }).strict()),
  unplaced: z.array(z.object({ requestId: z.uuid(), alternatives: AlternativesSchema }).strict()),
  summary: z.string(),
}).strict();

function parseHalfOpenRange(raw: unknown): Interval {
  const value = String(raw);
  if (!value.startsWith("[") || !value.endsWith(")")) throw new Error("Invalid interval boundary");
  return parseRange(value);
}

function sameInterval(a: Interval, b: Interval): boolean {
  return Date.parse(a.start) === Date.parse(b.start) && Date.parse(a.end) === Date.parse(b.end);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value !== "object" || value === null) return JSON.stringify(value);
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
}

function planRequestIds(plan: Plan): string[] {
  return [...plan.moves.map((move) => move.requestId), ...plan.unplaced.map((item) => item.requestId)];
}

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requireRole("admin");
  } catch (error) {
    return error as Response;
  }

  const body = await request.json().catch(() => undefined);
  const parsed = ApplySchema.safeParse(body);
  if (!parsed.success) return apiError(400, "BAD_REQUEST", "Provide a valid disruption preview ID.");

  try {
    const { data: run, error: runError } = await db()
      .from("engine_runs")
      .select("input, output")
      .eq("id", parsed.data.previewId)
      .eq("kind", "disruption")
      .maybeSingle();
    if (runError) throw new Error("Unable to load disruption preview");
    if (!run) return apiError(404, "PREVIEW_NOT_FOUND", "That disruption preview was not found.");

    const input = StoredInputSchema.safeParse(run.input);
    const output = run.output as { plan?: unknown; affected?: unknown } | null;
    if (!input.success || !output || !Number.isInteger(output.affected)) {
      return apiError(409, "PREVIEW_UNAVAILABLE", "That disruption preview cannot be applied.");
    }
    const storedPlan = PlanSchema.safeParse(output.plan);
    if (!storedPlan.success) return apiError(409, "PREVIEW_UNAVAILABLE", "That disruption preview cannot be applied.");
    if (input.data.affectedRequestIds.length === 0) {
      return apiError(409, "PREVIEW_UNAVAILABLE", "There are no affected bookings to apply.");
    }

    const states = input.data.requestStates;
    const ids = states.map((state) => state.id);
    const affectedIds = input.data.affectedRequestIds;
    if (new Set(ids).size !== ids.length || new Set(affectedIds).size !== affectedIds.length || output.affected !== affectedIds.length) {
      return apiError(409, "PREVIEW_UNAVAILABLE", "That disruption preview is incomplete.");
    }
    const savedPlan = storedPlan.data as Plan;
    const coveredIds = planRequestIds(savedPlan);
    if (new Set(coveredIds).size !== coveredIds.length ||
      coveredIds.length !== ids.length || ids.some((id) => !coveredIds.includes(id))) {
      return apiError(409, "PREVIEW_UNAVAILABLE", "That disruption plan does not cover every affected booking.");
    }
    if (savedPlan.unplaced.length > 0) {
      return apiError(409, "DISRUPTION_BLOCKED", "At least one affected booking cannot be safely resolved; no changes were applied.");
    }

    const { data: currentRows, error: stateError } = await db()
      .from("requests")
      .select("id, status, room_id, during")
      .in("id", ids);
    if (stateError) throw new Error("Unable to validate affected bookings");
    if (!currentRows || currentRows.length !== states.length) {
      return apiError(409, "PREVIEW_STALE", "An affected booking changed after this preview.");
    }
    const currentById = new Map(currentRows.map((row) => [row.id, row]));
    if (states.some((state) => {
      const current = currentById.get(state.id);
      return !current || current.status !== state.status || current.room_id !== state.roomId ||
        !sameInterval(parseHalfOpenRange(current.during), state.interval);
    })) {
      return apiError(409, "PREVIEW_STALE", "An affected booking changed after this preview.");
    }

    const context = await loadEngineContext();
    const room = context.rooms.find((candidate) => candidate.id === input.data.roomId);
    if (!room || room.blackouts.some((blackout) => overlaps(blackout, input.data.during))) {
      return apiError(409, "PREVIEW_STALE", "The room availability changed after this preview.");
    }
    const currentAffected = affectedDisruptionRequests(input.data.roomId, input.data.during, context);
    if (currentAffected.length !== affectedIds.length || affectedIds.some((id) =>
      !currentAffected.some(({ booking }) => booking.requestId === id))) {
      return apiError(409, "PREVIEW_STALE", "The affected bookings changed after this preview.");
    }

    const engineRequests = await Promise.all(ids.map((id) => loadEngineRequest(id)));
    const currentPlan = previewDisruption(input.data.roomId, input.data.during, context, engineRequests);
    if (currentPlan.unplaced.length > 0 || stableJson(currentPlan) !== stableJson(savedPlan)) {
      return apiError(409, "PREVIEW_STALE", "The disruption plan is no longer valid; create a new preview.");
    }

    const now = await getNow();
    const { error: applyError } = await db().rpc("apply_disruption", {
      p_moves: savedPlan.moves.map((move) => ({
        request_id: move.requestId,
        room_id: move.roomId,
        s: move.interval.start,
        e: move.interval.end,
        status: move.status ?? null,
        offers: move.offers ?? null,
      })) as Json,
      p_expected_states: states.map((state) => ({
        request_id: state.id,
        status: state.status,
        room_id: state.roomId,
        start_at: state.interval.start,
        end_at: state.interval.end,
      })),
      p_room_id: input.data.roomId,
      p_start: input.data.during.start,
      p_end: input.data.during.end,
      p_reason: input.data.reason,
      p_actor: actor.id,
      p_action: "disruption_apply",
      p_at: now,
    });
    if (applyError) throw new Error("Unable to apply disruption");

    // A bumped booking's offers get a deadline like any hold, so the tick can expire an unanswered offer
    // (apply_plan sets the status and offers but no hold_expires_at). Not a status change, so no transition().
    const nowMs = Date.parse(now);
    await Promise.all(savedPlan.moves.filter((move) => move.status === "bumped").map((move) => {
      // Other-slot offers carry their own time; similar-room offers are for the booking's own slot.
      const starts = (move.offers?.sameRoomOtherSlot ?? []).map((offer) => Date.parse(offer.interval.start));
      if (move.offers?.similarRoomSameSlot?.length) starts.push(Date.parse(move.interval.start));
      const firstStart = starts.length ? Math.min(...starts) : Date.parse(move.interval.start);
      const expiresMs = Math.max(
        nowMs + TIMING.holdMinMinutes * 60_000,
        Math.min(nowMs + TIMING.holdMaxMinutes * 60_000, firstStart - TIMING.holdBeforeStartMinutes * 60_000),
      );
      return db().from("requests").update({ hold_expires_at: new Date(expiresMs).toISOString() })
        .eq("id", move.requestId).eq("status", "bumped")
        .then(({ error }) => { if (error) console.error("[disruption apply] offer deadline", move.requestId, error); });
    }));

    const requestById = new Map(engineRequests.map((engineRequest) => [engineRequest.id, engineRequest]));
    await Promise.all(savedPlan.moves.map((move) => {
      const engineRequest = requestById.get(move.requestId);
      if (!engineRequest) return Promise.resolve();
      const body = move.status === "bumped"
        ? "Your booking was moved because the room is unavailable. Review the alternatives in your bookings."
        : "Your booking was moved to another room because of a room disruption.";
      return notify(engineRequest.requesterId, {
        kind: "disruption",
        title: "Your booking has been updated",
        body,
        requestId: move.requestId,
      });
    }));

    return Response.json({ ok: true, summary: savedPlan.summary } as const);
  } catch {
    return apiError(500, "DISRUPTION_APPLY_FAILED", "Couldn't apply that disruption safely.");
  }
}
