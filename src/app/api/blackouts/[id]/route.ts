// DELETE /api/blackouts/[id] — Remove a blackout window (admin/approver only).
// Owner: Aditi · Task D4
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole("admin", "approver");
  } catch (e) {
    return e as Response;
  }

  const { id } = await params;
  const supabase = db();
  const { error } = await supabase.from("room_blackouts").delete().eq("id", id);
  if (error) return apiError(500, "DB_ERROR", error.message);
  return Response.json({ ok: true });
}
