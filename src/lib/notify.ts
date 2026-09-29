// In-app notifications — inserts a row into notifications; Realtime pushes it to the bell.
// Owner: Aditi · D7
import "server-only";
import { db } from "@/lib/db/server";
import { getNow } from "@/lib/clock";

export async function notify(
  userId: string,
  n: { kind: string; title: string; body?: string; requestId?: string },
): Promise<void> {
  const supabase = db();
  const now = (await getNow()).toISOString();
  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    kind: n.kind,
    title: n.title,
    body: n.body ?? null,
    request_id: n.requestId ?? null,
    created_at: now,
  });
  if (error) {
    // Log but don't throw — a notification failure must never break the main flow.
    console.error("[notify] insert error:", error.message);
  }
}
