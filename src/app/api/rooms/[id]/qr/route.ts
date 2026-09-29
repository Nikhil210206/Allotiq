// GET /api/rooms/[id]/qr — QR payload for check-in kiosk.
// Owner: Aditi · Task D4 / D9
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Sign in required.");

  const { id } = await params;
  const supabase = db();
  const { data, error } = await supabase
    .from("rooms")
    .select("code, qr_secret")
    .eq("id", id)
    .single();

  if (error || !data) return apiError(404, "NOT_FOUND", "Room not found.");

  const origin = new URL(req.url).origin;
  const path = `/c/${data.code}?k=${data.qr_secret}`;
  return Response.json({ code: data.code as string, k: data.qr_secret as string, path, url: `${origin}${path}` });
}
