// DB rows → EngineContext / EngineRequest, and Plan → apply_plan() RPC. Owner: Aaditya · A6
import "server-only";
import type { EngineContext, Plan } from "@/contracts/engine";
import type { Interval } from "@/contracts/domain";

/** Load rooms, blackouts and active bookings overlapping the window. */
export async function loadEngineContext(_window: Interval): Promise<EngineContext> {
  throw new Error("Not implemented yet (A6)");
}

/** Apply a plan atomically via the apply_plan() Postgres function. */
export async function persistPlan(_plan: Plan, _actorId: string, _action: string): Promise<void> {
  throw new Error("Not implemented yet (A6)");
}
