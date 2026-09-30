// POST /api/requests/[id]/accept-offer — Requester accepts an alternative room offer (after bump/reject).
// Owner: Aditi · Task D5 / D12
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import { transition } from "@/lib/requests/transition";
import { getNow } from "@/lib/clock";
import { AcceptOfferSchema } from "@/contracts/api";
import { PURPOSE_PRIORITY, TIMING, type RequestStatus } from "@/contracts/domain";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let actor;
  try {
    actor = await requireRole("requester", "admin");
  } catch (e) {
    return e as Response;
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = AcceptOfferSchema.safeParse(body);
  if (!parsed.success)
    return apiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid body");

  const supabase = db();
  const { data: existing, error } = await supabase
    .from("requests")
    .select("id, requester_id, status, purpose, during")
    .eq("id", id)
    .single();

  if (error || !existing) return apiError(404, "NOT_FOUND", "Request not found.");
  const r = existing as Record<string, unknown>;
  if (actor.role === "requester" && r.requester_id !== actor.id)
    return apiError(403, "FORBIDDEN", "Not your request.");

  const now = await getNow();
  const nowMs = Date.parse(now);
  const startMs = Date.parse(parsed.data.during.start);
  const priority = PURPOSE_PRIORITY[r.purpose as keyof typeof PURPOSE_PRIORITY];
  const minExpiry = nowMs + TIMING.holdMinMinutes * 60_000;
  const maxExpiry = nowMs + TIMING.holdMaxMinutes * 60_000;
  const beforeStart = startMs - TIMING.holdBeforeStartMinutes * 60_000;
  const nextStatus = r.status === "bumped" ? "approved" : "pending";
  const holdExpiresAt = nextStatus === "pending"
    ? new Date(Math.max(minExpiry, Math.min(maxExpiry, beforeStart))).toISOString()
    : null;

  try {
    await transition(id, nextStatus, {
      actorId: actor.id,
      expectedStatus: r.status as RequestStatus,
      action: "accept_offer",
      patch: {
        room_id: parsed.data.roomId,
        during: `[${parsed.data.during.start},${parsed.data.during.end})`,
        priority,
        hold_expires_at: holdExpiresAt,
        offered_alternatives: null,
      },
    });
  } catch (e) {
    return apiError(409, "TRANSITION_ERROR", (e as Error).message);
  }

  return Response.json({ ok: true });
}
