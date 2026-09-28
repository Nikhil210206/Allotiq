// Placed, priority placed, seats wasted, buildings active. Owner: Aaditya · A3
import type { Assignment, EngineContext, EngineRequest, SolveMetrics } from "@/contracts/engine";

export function computeMetrics(
  _assignments: Assignment[],
  _reqs: EngineRequest[],
  _ctx: EngineContext,
): Omit<SolveMetrics, "ms" | "nodes" | "objective"> {
  throw new Error("Not implemented yet (A3)");
}
