// Never a bare "rejected": same room other slot + similar room same slot. Owner: Aaditya · A5
import type { Alternatives, EngineContext, EngineRequest, Recommendation } from "@/contracts/engine";
import { candidates } from "./candidates";
import { isFeasible } from "./feasibility";
import { scoreRoom } from "./score";

const MAX_SAME_ROOM_SLOTS = 3;
const MAX_SIMILAR_ROOMS = 3;

/**
 * Returns alternatives for a request that could not be satisfied:
 *  - sameRoomOtherSlot: the preferred/best room at nearby future times (≤3)
 *  - similarRoomSameSlot: feasible rooms at the same slot, ranked by score (≤3)
 *
 * All candidates pass isFeasible() — no bare suggestions.
 * preferredRoomId: the room that clashed or was originally requested.
 */
export function alternatives(req: EngineRequest, ctx: EngineContext, preferredRoomId?: string): Alternatives {
  const nowMs = Date.parse(ctx.now);
  const duration = Date.parse(req.interval.end) - Date.parse(req.interval.start);

  // ── 1. Resolve target room for "same room, other slot" ───────────────────
  //
  // Prefer the specified preferredRoomId. If not given, use the top candidate
  // from candidates() (best-scoring feasible room). If no feasible room at all
  // (which is why alternatives is being called), fall back to the tightest room
  // that passes capacity/systems/features/type (ignoring OVERLAP and HOURS),
  // i.e., the first room sorted by capacity asc that meets structural requirements.

  let targetRoomId: string | undefined = preferredRoomId;

  if (!targetRoomId) {
    // Try candidates with current occupancy first
    const cands = candidates(req, ctx);
    if (cands.length > 0) {
      targetRoomId = cands[0].roomId;
    } else {
      // Fall back: tightest room that satisfies capacity + systems + features + type
      const structural = ctx.rooms
        .filter((r) => {
          if (r.capacity < req.headcount) return false;
          if (r.systems < req.minSystems) return false;
          if (req.roomType && r.type !== req.roomType) return false;
          for (const f of req.features) {
            if (!r.features.includes(f)) return false;
          }
          return true;
        })
        .sort((a, b) => {
          const diff = a.capacity - b.capacity;
          return diff !== 0 ? diff : a.id.localeCompare(b.id);
        });
      targetRoomId = structural[0]?.id;
    }
  }

  // ── 2. sameRoomOtherSlot ────────────────────────────────────────────────
  const sameRoomOtherSlot: Alternatives["sameRoomOtherSlot"] = [];

  if (targetRoomId) {
    const targetRoom = ctx.rooms.find((r) => r.id === targetRoomId);

    if (targetRoom) {
      const localDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(req.interval.start));
      const firstDayStart = Date.parse(`${localDate}T00:00:00+05:30`);
      const proposals: Array<{ interval: { start: string; end: string }; distance: number }> = [];

      // Scan 30-minute campus slots on the request day and following three days.
      for (let day = 0; day <= 3; day++) {
        const dayStart = firstDayStart + day * 24 * 60 * 60_000;
        for (let minute = 0; minute < 24 * 60; minute += 30) {
          const newStartMs = dayStart + minute * 60_000;
          if (newStartMs <= nowMs) continue;
          if (newStartMs === Date.parse(req.interval.start)) continue;

          const interval = {
            start: new Date(newStartMs).toISOString(),
            end: new Date(newStartMs + duration).toISOString(),
          };
          if (isFeasible(targetRoom, { ...req, interval }, ctx)) {
            proposals.push({ interval, distance: Math.abs(newStartMs - Date.parse(req.interval.start)) });
          }
        }
      }

      proposals.sort((a, b) =>
        a.distance - b.distance || Date.parse(a.interval.start) - Date.parse(b.interval.start),
      );
      sameRoomOtherSlot.push(
        ...proposals.slice(0, MAX_SAME_ROOM_SLOTS).map(({ interval }) => ({ roomId: targetRoom.id, interval })),
      );
    }
  }

  // ── 3. similarRoomSameSlot ──────────────────────────────────────────────
  //
  // Use original interval. Relax roomType (per audit §10.2 — match mock behaviour).
  // Exclude the preferred/target room. All hard constraints still apply.

  const relaxedReq: EngineRequest = { ...req, roomType: undefined };

  const similarRoomSameSlot: Recommendation[] = [];

  for (const room of ctx.rooms) {
    if (room.id === targetRoomId) continue; // exclude the preferred room
    if (!isFeasible(room, relaxedReq, ctx)) continue;

    const score = scoreRoom(room, req, ctx); // score against original req for honest notes
    similarRoomSameSlot.push({
      roomId: room.id,
      score,
      why: score.notes,
    });
  }

  // Rank: score.total desc, roomId asc (deterministic tiebreak)
  similarRoomSameSlot.sort((a, b) => {
    if (b.score.total !== a.score.total) return b.score.total - a.score.total;
    return a.roomId.localeCompare(b.roomId);
  });

  return {
    sameRoomOtherSlot,
    similarRoomSameSlot: similarRoomSameSlot.slice(0, MAX_SIMILAR_ROOMS),
  };
}
