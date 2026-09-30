// The ONLY way a request changes status. The DB trigger validates the transition and writes the audit row.
// Owner: Aditi · D5
import "server-only";
import { db } from "@/lib/db/server";
import { getNow } from "@/lib/clock";
import { REQUEST_STATUSES, TRANSITIONS, type RequestStatus } from "@/contracts/domain";

export async function transition(
  requestId: string,
  to: RequestStatus,
  opts: {
    actorId: string | null;
    expectedStatus: RequestStatus;
    action?: string;
    note?: string;
    patch?: Record<string, unknown>;
  },
): Promise<void> {
  if (!REQUEST_STATUSES.includes(opts.expectedStatus) || !TRANSITIONS[opts.expectedStatus].includes(to))
    throw new Error("This request cannot make that transition from its expected state.");

  let supabase: ReturnType<typeof db>;
  let now: string;
  try {
    supabase = db();
  } catch {
    throw new Error("Unable to access request storage.");
  }
  try {
    now = await getNow();
  } catch {
    throw new Error("Unable to determine business time for this request update.");
  }

  let data: { id: string } | null;
  let error: { message: string } | null;
  try {
    ({ data, error } = await supabase
      .from("requests")
      .update({
        ...(opts.patch ?? {}),
        ...(opts.note != null ? { decision_reason: opts.note } : {}),
        status: to,
        last_actor_id: opts.actorId ?? null,
        last_action: opts.action ?? to,
        last_action_at: now,
      })
      .eq("id", requestId)
      .eq("status", opts.expectedStatus)
      .select("id")
      .maybeSingle());
  } catch (err) {
    console.error("[transition]", err);
    throw new Error("Unable to update this request.");
  }

  if (error) {
    if (error.message.includes("INVALID_TRANSITION"))
      throw new Error("This request can no longer make that transition.");
    if (error.message.includes("ROOM_INACTIVE"))
      throw new Error("Room is no longer active.");
    if (error.message.includes("OVER_CAPACITY"))
      throw new Error("Headcount exceeds room capacity.");
    if (error.message.includes("ROOM_BLACKOUT"))
      throw new Error("Room has a maintenance blackout in that time window.");
    console.error("[transition]", error);
    throw new Error("Unable to update this request.");
  }

  if (!data) throw new Error("Request state changed or this transition is not allowed.");
}
