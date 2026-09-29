// GET /api/rooms/[id]/blackouts — List blackouts for a room.
// POST /api/rooms/[id]/blackouts — Add a maintenance/closure window (admin/approver only).
// Owner: Aditi · Task D4
import { requireRole, getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import { BlackoutInputSchema } from "@/contracts/api";
import { getNow } from "@/lib/clock";
import type { Blackout } from "@/contracts/domain";

function rowToBlackout(r: Record<string, unknown>): Blackout {
  const during = r.during as string;
  // tstzrange format: ["start","end") — strip brackets and quotes
  const clean = during.replace(/^[\[(]|[\])]$/g, "");
  const [start, end] = clean.split(",").map((s) => s.replace(/^"|"$/g, "").trim());
  return {
    id: r.id as string,
    roomId: r.room_id as string,
    during: { start, end },
    reason: r.reason as string,
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
  const { data, error } = await supabase
    .from("room_blackouts")
    .select("*")
    .eq("room_id", id)
    .order("created_at", { ascending: false });

  if (error) return apiError(500, "DB_ERROR", error.message);
  return Response.json((data ?? []).map((r) => rowToBlackout(r as Record<string, unknown>)));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let actor;
  try {
    actor = await requireRole("admin", "approver");
  } catch (e) {
    return e as Response;
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = BlackoutInputSchema.safeParse(body);
  if (!parsed.success)
    return apiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid body");

  const now = await getNow();
  const { during, reason } = parsed.data;
  const supabase = db();
  const { data, error } = await supabase
    .from("room_blackouts")
    .insert({
      room_id: id,
      during: `[${during.start},${during.end})`,
      reason,
      created_by: actor.id,
      created_at: now,
    })
    .select()
    .single();

  if (error) return apiError(500, "DB_ERROR", error.message);
  return Response.json(rowToBlackout(data as Record<string, unknown>), { status: 201 });
}
