// Top 3 rooms + why + why-not + alternatives for one request. Owner: Aaditya · A7
import type { EngineContext, EngineRequest, RecommendResult } from "@/contracts/engine";
import { alternatives } from "./alternatives";
import { candidates } from "./candidates";
import { hardViolations } from "./feasibility";
import { whyThisRoom } from "./explain";

export function recommend(req: EngineRequest, ctx: EngineContext): RecommendResult {
  const ranked = candidates(req, ctx);
  const top = ranked.slice(0, 3).map(({ roomId, score }, index) => ({
    roomId,
    score,
    why: whyThisRoom(score, ranked[index + 1]?.score),
  }));

  const whyNot = ctx.rooms
    .map((room) => ({ roomId: room.id, violations: hardViolations(room, req, ctx) }))
    .filter((excluded) => excluded.violations.length > 0)
    .sort((a, b) => a.violations.length - b.violations.length || a.roomId.localeCompare(b.roomId))
    .slice(0, 3);

  return {
    top,
    whyNot,
    alternatives: top.length === 0 ? alternatives(req, ctx) : null,
  };
}
