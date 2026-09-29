// POST /api/disruptions/preview — Before/after rehome plan (writes no allocations)
// Owner: Aaditya · Task A11
import { DisruptionPreviewSchema, type DisruptionPreviewResponse } from "@/contracts/api";
import type { EngineRequest } from "@/contracts/engine";
import { affectedDisruptionRequests, previewDisruption } from "@/engine/disruption";
import { overlaps } from "@/engine/time";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import type { Json } from "@/lib/db/types.gen";
import { apiError } from "@/lib/http";
import { loadEngineContext, loadEngineRequest } from "@/server/engine-adapter";

export async function POST(request: Request) {
  try {
    await requireRole("admin");
  } catch (error) {
    return error as Response;
  }

  const body = await request.json().catch(() => undefined);
  const parsed = DisruptionPreviewSchema.safeParse(body);
  if (!parsed.success) return apiError(400, "BAD_REQUEST", "Provide a room, a valid time window, and a reason.");

  try {
    const { roomId, during, reason } = parsed.data;
    // The solver and nearby alternatives need complete current occupancy, including
    // bookings outside the blackout window that may conflict with a rehome.
    const context = await loadEngineContext();
    if (!context.rooms.some((room) => room.id === roomId)) {
      return apiError(404, "ROOM_NOT_FOUND", "That active room was not found.");
    }

    const affected = affectedDisruptionRequests(roomId, during, context);
    const affectedRequests: EngineRequest[] = await Promise.all(
      affected.map(({ booking }) => loadEngineRequest(booking.requestId)),
    );
    const affectedIntervals = affectedRequests.map((engineRequest) => engineRequest.interval);
    const relatedIds = [...new Set(context.rooms.flatMap((room) => room.booked
      .filter((booking) => affectedIntervals.some((interval) => overlaps(interval, booking.interval)))
      .map((booking) => booking.requestId)))].filter((id) => !affected.some((item) => item.booking.requestId === id)).sort();
    const relatedRequests = await Promise.all(relatedIds.map((id) => loadEngineRequest(id)));
    const requests = [...affectedRequests, ...relatedRequests];
    const startedAt = performance.now();
    const plan = previewDisruption(roomId, during, context, requests);
    const elapsedMs = Math.round(performance.now() - startedAt);
    const participantIds = [...new Set([...plan.moves.map((move) => move.requestId), ...plan.unplaced.map((item) => item.requestId)])].sort();
    const bookingById = new Map(context.rooms.flatMap((candidate) => candidate.booked.map((booking) => [booking.requestId, { booking, roomId: candidate.id }] as const)));
    const states = participantIds.map((id) => {
      const allocation = bookingById.get(id);
      if (!allocation) throw new Error("Disruption participant has no current booking");
      return { id, status: allocation.booking.status, roomId: allocation.roomId, interval: allocation.booking.interval };
    });
    const input = {
      roomId,
      during,
      reason,
      affectedRequestIds: affected.map(({ booking }) => booking.requestId),
      requestStates: states,
    };
    const { data, error } = await db()
      .from("engine_runs")
      .insert({
        kind: "disruption",
        solver: "bnb",
        input: input as unknown as Json,
        output: { plan, affected: affected.length } as unknown as Json,
        ms: elapsedMs,
        created_at: context.now,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error("Unable to save disruption preview");

    return Response.json({ previewId: data.id, affected: affected.length, plan } satisfies DisruptionPreviewResponse);
  } catch {
    return apiError(500, "DISRUPTION_PREVIEW_FAILED", "Couldn't build a safe disruption preview right now.");
  }
}
