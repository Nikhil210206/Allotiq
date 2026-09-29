// The ONLY way a request changes status. The DB trigger validates the transition and writes the audit row.
// Owner: Aditi · D5
import "server-only";
import { db } from "@/lib/db/server";
import { getNow } from "@/lib/clock";
import type { RequestStatus } from "@/contracts/domain";

export async function transition(
  requestId: string,
  to: RequestStatus,
  opts: {
    actorId: string | null;
    action?: string;
    note?: string;
    patch?: Record<string, unknown>;
  },
): Promise<void> {
  const supabase = db();
  const now = await getNow();

  const { error } = await supabase
    .from("requests")
    .update({
      status: to,
      last_actor_id: opts.actorId ?? null,
      last_action: opts.action ?? to,
      last_action_at: now,
      ...(opts.note != null ? { decision_reason: opts.note } : {}),
      ...(opts.patch ?? {}),
    })
    .eq("id", requestId);

  if (error) {
    // Translate DB constraint errors to friendly messages.
    if (error.message.includes("INVALID_TRANSITION"))
      throw new Error(`Illegal status transition → ${to}: ${error.message}`);
    if (error.message.includes("ROOM_INACTIVE"))
      throw new Error("Room is no longer active.");
    if (error.message.includes("OVER_CAPACITY"))
      throw new Error("Headcount exceeds room capacity.");
    if (error.message.includes("ROOM_BLACKOUT"))
      throw new Error("Room has a maintenance blackout in that time window.");
    throw new Error(`Transition failed: ${error.message}`);
  }
}
