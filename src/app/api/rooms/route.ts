// GET /api/rooms — List all active rooms (catalog read, any authenticated user).
// POST /api/rooms — Create a room (admin only).
// Owner: Aditi · Task D4
import { requireRole, getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import { rowToRoom } from "@/lib/db/mappers";
import { RoomInputSchema } from "@/contracts/api";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Sign in required.");

  const supabase = db();
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .order("code");
  if (error) return apiError(500, "DB_ERROR", error.message);

  return Response.json((data ?? []).map(rowToRoom));
}

export async function POST(req: Request) {
  try {
    await requireRole("admin");
  } catch (e) {
    return e as Response;
  }

  const body = await req.json().catch(() => ({}));
  const parsed = RoomInputSchema.safeParse(body);
  if (!parsed.success)
    return apiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid body");

  const p = parsed.data;
  const supabase = db();
  const { data, error } = await supabase
    .from("rooms")
    .insert({
      code: p.code,
      name: p.name,
      building_id: p.buildingId,
      type: p.type,
      capacity: p.capacity,
      systems_count: p.systemsCount,
      features: p.features,
      department_id: p.departmentId,
      access: p.access,
      approver_id: p.approverId,
      open_time: p.openTime,
      close_time: p.closeTime,
      open_days: p.openDays,
      attributes: p.attributes,
      is_active: p.isActive,
    })
    .select()
    .single();

  if (error) return apiError(500, "DB_ERROR", error.message);
  return Response.json(rowToRoom(data as Record<string, unknown>), { status: 201 });
}
