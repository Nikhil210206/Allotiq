// Disruption: re-home bookings affected by a blackout; offer/waitlist the rest. Owner: Aaditya · A10
import type { Interval } from "@/contracts/domain";
import type { EngineContext, Plan } from "@/contracts/engine";

export function previewDisruption(_roomId: string, _window: Interval, _ctx: EngineContext): Plan {
  throw new Error("Not implemented yet (A10)");
}
