// POST /api/notifications/read — Mark specific notification IDs as read.
// Owner: Aditi · Task D7
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import { getNow } from "@/lib/clock";
import { MarkReadSchema } from "@/contracts/api";

export async function POST(req: Request) {
  let actor;
  try {
    actor = await requireRole();
  } catch (e) {
    return e as Response;
  }

  const body = await req.json().catch(() => ({}));
  const parsed = MarkReadSchema.safeParse(body);
  if (!parsed.success)
    return apiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "ids[] required");

  const now = await getNow();
  const supabase = db();
  // Only mark rows that belong to this user (security: never trust the IDs alone)
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: now })
    .in("id", parsed.data.ids)
    .eq("user_id", actor.id)
    .is("read_at", null);

  if (error) return apiError(500, "DB_ERROR", error.message);
  return Response.json({ ok: true });
}
