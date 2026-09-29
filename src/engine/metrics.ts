// Placed, priority placed, seats wasted, buildings active. Owner: Aaditya · A3
import type { Assignment, EngineContext, EngineRequest, SolveMetrics } from "@/contracts/engine";

export function computeMetrics(
  assignments: Assignment[],
  reqs: EngineRequest[],
  ctx: EngineContext,
): Omit<SolveMetrics, "ms" | "nodes" | "objective"> {
  const reqMap = new Map<string, EngineRequest>();
  for (const r of reqs) {
    reqMap.set(r.id, r);
  }

  const roomMap = new Map<string, EngineContext["rooms"][0]>();
  for (const r of ctx.rooms) {
    roomMap.set(r.id, r);
  }

  let placed = 0;
  let priorityPlaced = 0;
  let priorityTotal = 0;
  let seatsWasted = 0;
  const activeBuildings = new Set<string>();

  for (const req of reqs) {
    if (req.priority >= 40) {
      priorityTotal++;
    }
  }

  for (const a of assignments) {
    if (a.roomId) {
      placed++;
      const req = reqMap.get(a.requestId);
      if (req && req.priority >= 40) {
        priorityPlaced++;
      }
      const room = roomMap.get(a.roomId);
      if (room) {
        if (req && room.capacity >= req.headcount) {
          seatsWasted += room.capacity - req.headcount;
        }
        activeBuildings.add(room.buildingId);
      }
    }
  }

  return {
    placed,
    total: reqs.length,
    priorityPlaced,
    priorityTotal,
    seatsWasted,
    buildingsActive: activeBuildings.size,
  };
}

