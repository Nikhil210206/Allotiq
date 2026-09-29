// GET /api/rooms — List all active rooms (catalog read, any authenticated user).
// POST /api/rooms — Create a room (admin only).
// Owner: Aditi · Task D4
import { requireRole, getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import { RoomInputSchema } from "@/contracts/api";
import type { Feature, Room } from "@/contracts/domain";

function rowToRoom(r: Record<string, unknown>): Room {
  return {
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    buildingId: r.building_id as string,
    type: r.type as Room["type"],
    capacity: r.capacity as number,
    systemsCount: (r.systems_count as number) ?? 0,
    features: (r.features as Feature[]) ?? [],
    departmentId: (r.department_id as string) ?? null,
    access: r.access as Room["access"],
    approverId: (r.approver_id as string) ?? null,
    openTime: r.open_time as string,
    closeTime: r.close_time as string,
    openDays: (r.open_days as number[]) ?? [],
    attributes: (r.attributes as Record<string, unknown>) ?? {},
    isActive: r.is_active as boolean,
  };
}

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
