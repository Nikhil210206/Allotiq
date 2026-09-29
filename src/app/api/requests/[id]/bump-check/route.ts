// POST /api/requests/[id]/bump-check — Find a valid rehome/bump plan for a priority request
// Owner: Aaditya · Task A10
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import { overlaps } from "@/engine/time";
import { tryBump } from "@/engine/bump";
import { loadEngineContext, loadEngineRequest } from "@/server/engine-adapter";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole("admin");
  } catch (error) {
    return error as Response;
  }

  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return apiError(400, "BAD_REQUEST", "Provide a valid request ID.");
  }

  try {
    const { data: row, error } = await db()
      .from("requests")
      .select("id, status, room_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("Unable to load request");
    if (!row) return apiError(404, "NOT_FOUND", "Request not found.");
    if (row.status !== "waitlisted" || row.room_id !== null) {
      return apiError(409, "NOT_WAITLISTED", "Only a waitlisted request can be checked for a priority placement.");
    }

    const request = await loadEngineRequest(id);
    const context = await loadEngineContext(request.interval);
    const relatedIds = [...new Set(context.rooms.flatMap((room) => room.booked
      .filter((booking) => overlaps(request.interval, booking.interval))
      .map((booking) => booking.requestId)))]
      .filter((requestId) => requestId !== request.id)
      .sort();
    const relatedRequests = await Promise.all(relatedIds.map((requestId) => loadEngineRequest(requestId)));
    const plan = tryBump(request, context, relatedRequests);

    // The endpoint is a read-only preview. The transition to approved and any
    // plan persistence are owned by the existing apply workflow, never here.
    const preview = plan ? {
      ...plan,
      moves: plan.moves.map((move) => move.requestId === request.id
        ? { ...move, status: "approved" }
        : move),
    } : null;
    return Response.json({ plan: preview });
  } catch {
    return apiError(500, "BUMP_CHECK_FAILED", "Couldn't build a safe priority placement plan right now.");
  }
}
