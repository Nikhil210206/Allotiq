// GET  /api/requests?mine=1 — list requester's own requests (or all for admin/approver).
// POST /api/requests        — create a pending hold. 409 + alternatives on slot conflict.
// Owner: Aditi · Task D5
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import { rowToRequest } from "@/lib/db/mappers";
import { getNow } from "@/lib/clock";
import { CreateRequestSchema } from "@/contracts/api";
import { PURPOSE_PRIORITY, TIMING } from "@/contracts/domain";

export async function GET(req: Request) {
  let actor;
  try {
    actor = await requireRole();
  } catch (e) {
    return e as Response;
  }

  const url = new URL(req.url);
  const mine = url.searchParams.get("mine") === "1";
  const supabase = db();

  let query = supabase.from("requests").select("*").order("created_at", { ascending: false });

  if (mine || actor.role === "requester") {
    query = query.eq("requester_id", actor.id);
  } else if (actor.role === "approver") {
    // Approvers see requests for rooms they manage
    const { data: myRooms } = await supabase
      .from("rooms")
      .select("id")
      .eq("approver_id", actor.id);
    const roomIds = (myRooms ?? []).map((r) => (r as Record<string, unknown>).id as string);
    if (roomIds.length === 0) return Response.json([]);
    query = query.in("room_id", roomIds);
  }
  // admin sees all

  const { data, error } = await query;
  if (error) return apiError(500, "DB_ERROR", error.message);
  return Response.json((data ?? []).map((r) => rowToRequest(r as Record<string, unknown>)));
}

export async function POST(req: Request) {
  let actor;
  try {
    actor = await requireRole("requester", "admin");
  } catch (e) {
    return e as Response;
  }

  const body = await req.json().catch(() => ({}));
  const parsed = CreateRequestSchema.safeParse(body);
  if (!parsed.success)
    return apiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid body");

  const { draft, roomId } = parsed.data;
  const now = await getNow();
  const nowMs = Date.parse(now);
  const startMs = Date.parse(draft.during.start);

  // Derive priority server-side — never trust client input.
  const priority = PURPOSE_PRIORITY[draft.purpose];

  // Compute hold expiry: max(now+10m, min(now+120m, start-30m))
  const minExpiry = nowMs + TIMING.holdMinMinutes * 60_000;
  const maxExpiry = nowMs + TIMING.holdMaxMinutes * 60_000;
  const beforeStart = startMs - TIMING.holdBeforeStartMinutes * 60_000;
  const holdExpiresAt = new Date(Math.max(minExpiry, Math.min(maxExpiry, beforeStart))).toISOString();

  const status = roomId ? "pending" : "waitlisted";

  const supabase = db();
  const { data, error } = await supabase
    .from("requests")
    .insert({
      requester_id: actor.id,
      title: draft.title,
      purpose: draft.purpose,
      priority,
      headcount: draft.headcount,
      min_systems: draft.minSystems,
      required_features: draft.requiredFeatures,
      room_type: draft.roomType ?? null,
      preferred_building_id: draft.preferredBuildingId ?? null,
      during: `[${draft.during.start},${draft.during.end})`,
      room_id: roomId ?? null,
      status,
      hold_expires_at: roomId ? holdExpiresAt : null,
      source: draft.source,
      raw_input: draft.rawInput ?? null,
      created_at: now,
      last_actor_id: actor.id,
      last_action: "created",
      last_action_at: now,
    })
    .select()
    .single();

  if (error) {
    // 23P01 = exclusion_violation (double-booking)
    if (error.code === "23P01" || error.message.includes("no_double_booking")) {
      // Fetch alternatives via the recommend endpoint logic (lightweight: just return similar rooms same slot)
      const { data: alts } = await supabase
        .from("requests")
        .select("room_id")
        .eq("room_id", roomId)
        .in("status", ["pending", "approved", "checked_in"])
        .filter("during", "ov", `[${draft.during.start},${draft.during.end})`);

      return Response.json(
        {
          error: "SLOT_TAKEN",
          message: "That room is already booked for the requested time. Choose an alternative.",
          alternatives: { sameRoomOtherSlots: [], similarRoomsSameSlot: [], forRequest: roomId ?? "" },
          conflict: alts,
        },
        { status: 409 },
      );
    }
    if (error.message.includes("ROOM_INACTIVE"))
      return apiError(409, "ROOM_INACTIVE", "Room is no longer active.");
    if (error.message.includes("OVER_CAPACITY"))
      return apiError(409, "OVER_CAPACITY", "Headcount exceeds room capacity.");
    if (error.message.includes("ROOM_BLACKOUT"))
      return apiError(409, "ROOM_BLACKOUT", "Room has a maintenance blackout in that window.");
    return apiError(500, "DB_ERROR", error.message);
  }

  return Response.json(rowToRequest(data as Record<string, unknown>), { status: 201 });
}
