// POST /api/checkin { roomCode, k } — QR check-in. Window: start−10 min … start+15 min.
// Owner: Aditi · Task D9
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import { getNow } from "@/lib/clock";
import { transition } from "@/lib/requests/transition";
import { notify } from "@/lib/notify";
import { CheckinSchema } from "@/contracts/api";
import { TIMING } from "@/contracts/domain";

export async function POST(req: Request) {
  let actor;
  try {
    actor = await requireRole();
  } catch (e) {
    return e as Response;
  }

  const body = await req.json().catch(() => ({}));
  const parsed = CheckinSchema.safeParse(body);
  if (!parsed.success)
    return apiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid body");

  const { roomCode, k } = parsed.data;
  const supabase = db();

  // 1. Find room by code and verify the QR secret
  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    .select("id, qr_secret, name")
    .eq("code", roomCode)
    .single();

  if (roomErr || !room) return apiError(404, "NOT_FOUND", "Room not found.");
  if ((room as Record<string, unknown>).qr_secret !== k)
    return apiError(401, "INVALID_QR", "Invalid QR code.");

  const roomId = (room as Record<string, unknown>).id as string;
  const now = await getNow();
  const nowMs = Date.parse(now);

  // 2. Find an approved booking for this room belonging to this user within the check-in window
  const { data: requests } = await supabase
    .from("requests")
    .select("id, requester_id, title, during")
    .eq("room_id", roomId)
    .eq("status", "approved");

  const earlyMs = TIMING.checkinEarlyMinutes * 60_000;
  const graceMs = TIMING.noShowGraceMinutes * 60_000;

  let targetRequest: Record<string, unknown> | null = null;
  for (const r of requests ?? []) {
    const dur = r.during as string;
    const clean = dur.replace(/^[\[(]|[\])]$/g, "");
    const [start] = clean.split(",").map((s: string) => s.replace(/^"|"$/g, "").trim());
    const startMs = Date.parse(start);

    // Window: [start - 10min, start + 15min]
    if (nowMs >= startMs - earlyMs && nowMs <= startMs + graceMs) {
      // Prefer the requester's own booking; fall back to any booking in the window (for admins)
      if (r.requester_id === actor.id || actor.role === "admin") {
        targetRequest = r as Record<string, unknown>;
        break;
      }
    }
  }

  if (!targetRequest)
    return apiError(409, "NO_BOOKING", "No approved booking found in the check-in window for this room.");

  try {
    await transition(targetRequest.id as string, "checked_in", {
      actorId: actor.id,
      action: "checkin",
      patch: { checked_in_at: now },
    });
  } catch (e) {
    return apiError(409, "TRANSITION_ERROR", (e as Error).message);
  }

  await notify(targetRequest.requester_id as string, {
    kind: "checked_in",
    title: `Checked in to ${(room as Record<string, unknown>).name}`,
    body: `"${targetRequest.title}" is now active.`,
    requestId: targetRequest.id as string,
  }).catch(() => {});

  return Response.json({ ok: true, requestId: targetRequest.id });
}
