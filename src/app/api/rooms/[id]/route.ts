// GET /api/rooms/[id] — Single room detail.
// PATCH /api/rooms/[id] — Update a room (admin only).
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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Sign in required.");

  const { id } = await params;
  const supabase = db();
  const { data, error } = await supabase.from("rooms").select("*").eq("id", id).single();
  if (error || !data) return apiError(404, "NOT_FOUND", "Room not found.");
  return Response.json(rowToRoom(data as Record<string, unknown>));
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole("admin");
  } catch (e) {
    return e as Response;
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = RoomInputSchema.partial().safeParse(body);
  if (!parsed.success)
    return apiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid body");

  const p = parsed.data;
  const patch: Record<string, unknown> = {};
  if (p.code !== undefined) patch.code = p.code;
  if (p.name !== undefined) patch.name = p.name;
  if (p.buildingId !== undefined) patch.building_id = p.buildingId;
  if (p.type !== undefined) patch.type = p.type;
  if (p.capacity !== undefined) patch.capacity = p.capacity;
  if (p.systemsCount !== undefined) patch.systems_count = p.systemsCount;
  if (p.features !== undefined) patch.features = p.features;
  if (p.departmentId !== undefined) patch.department_id = p.departmentId;
  if (p.access !== undefined) patch.access = p.access;
  if (p.approverId !== undefined) patch.approver_id = p.approverId;
  if (p.openTime !== undefined) patch.open_time = p.openTime;
  if (p.closeTime !== undefined) patch.close_time = p.closeTime;
  if (p.openDays !== undefined) patch.open_days = p.openDays;
  if (p.attributes !== undefined) patch.attributes = p.attributes;
  if (p.isActive !== undefined) patch.is_active = p.isActive;

  const supabase = db();
  const { data, error } = await supabase
    .from("rooms")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return apiError(500, "DB_ERROR", error.message);
  if (!data) return apiError(404, "NOT_FOUND", "Room not found.");
  return Response.json(rowToRoom(data as Record<string, unknown>));
}
