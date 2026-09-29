// GET /api/approvals — Pending requests for rooms this approver manages.
// Owner: Aditi · Task D6
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import { rowToRequest } from "@/lib/db/mappers";

export async function GET() {
  let actor;
  try {
    actor = await requireRole("approver", "admin");
  } catch (e) {
    return e as Response;
  }

  const supabase = db();

  let roomIds: string[] = [];
  if (actor.role === "approver") {
    const { data: myRooms } = await supabase
      .from("rooms")
      .select("id")
      .eq("approver_id", actor.id);
    roomIds = (myRooms ?? []).map((r) => (r as Record<string, unknown>).id as string);
    if (roomIds.length === 0) return Response.json([]);
  }

  let query = supabase
    .from("requests")
    .select("*")
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (actor.role === "approver") {
    query = query.in("room_id", roomIds);
  }

  const { data, error } = await query;
  if (error) return apiError(500, "DB_ERROR", error.message);
  return Response.json((data ?? []).map((r) => rowToRequest(r as Record<string, unknown>)));
}
