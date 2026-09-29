// Feasible rooms for a request, sorted by (score desc, roomId) — deterministic. Owner: Aaditya · A3
import type { Candidate, EngineContext, EngineRequest } from "@/contracts/engine";
import { isFeasible } from "./feasibility";
import { scoreRoom } from "./score";

export function candidates(req: EngineRequest, ctx: EngineContext): Candidate[] {
  const result: Candidate[] = [];

  for (const room of ctx.rooms) {
    if (isFeasible(room, req, ctx)) {
      const score = scoreRoom(room, req, ctx);
      result.push({ roomId: room.id, score });
    }
  }

  result.sort((a, b) => {
    if (b.score.total !== a.score.total) {
      return b.score.total - a.score.total;
    }
    return a.roomId.localeCompare(b.roomId);
  });

  return result;
}

