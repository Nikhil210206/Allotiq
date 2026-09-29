// GET /api/notifications — List unread (and recent read) notifications for the current user.
// Owner: Aditi · Task D7
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import type { NotificationsResponse } from "@/contracts/api";
import type { AppNotification } from "@/contracts/domain";

function rowToNotif(r: Record<string, unknown>): AppNotification {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    kind: r.kind as string,
    title: r.title as string,
    body: (r.body as string) ?? null,
    requestId: (r.request_id as string) ?? null,
    createdAt: r.created_at as string,
    readAt: (r.read_at as string) ?? null,
  };
}

export async function GET() {
  let actor;
  try {
    actor = await requireRole();
  } catch (e) {
    return e as Response;
  }

  const supabase = db();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", actor.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return apiError(500, "DB_ERROR", error.message);

  const items = (data ?? []).map((r) => rowToNotif(r as Record<string, unknown>));
  const unread = items.filter((n) => !n.readAt).length;
  return Response.json({ items, unread } satisfies NotificationsResponse);
}
