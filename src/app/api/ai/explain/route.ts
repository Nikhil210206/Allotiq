// POST /api/ai/explain — explain a server-recomputed deterministic recommendation.
// Owner: Aaditya · Task A14
import { RequestDraftSchema } from "@/contracts/api";
import { requireRole } from "@/lib/auth/session";
import { apiError } from "@/lib/http";
import { loadEngineContext, loadEngineRequestForDraft } from "@/server/engine-adapter";
import { recommend } from "@/engine/recommend";
import { explainChoice } from "@/lib/ai/explain";
import { z } from "zod";

const ScoreSchema = z.object({
  capacityFit: z.number().min(0).max(1), featureMatch: z.number().min(0).max(1),
  proximity: z.number().min(0).max(1), scarcity: z.number().min(0).max(1),
  preference: z.number().min(0).max(1), energy: z.number().min(0).max(1),
  weights: z.object({ capacityFit: z.number(), featureMatch: z.number(), proximity: z.number(), scarcity: z.number(), preference: z.number(), energy: z.number() }).strict(),
  total: z.number().min(0).max(100), wastedSeats: z.number().nonnegative(), notes: z.array(z.string()).max(12),
}).strict();
const BodySchema = z.object({
  requestDraft: RequestDraftSchema,
  recommendation: z.object({ roomId: z.uuid(), score: ScoreSchema, why: z.array(z.string()).max(12) }).strict(),
}).strict();

export async function POST(request: Request) {
  let actor;
  try { actor = await requireRole("requester", "admin"); } catch (error) { return error as Response; }
  const body = await request.json().catch(() => undefined);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return apiError(400, "BAD_REQUEST", "Provide a valid request draft and recommendation.");

  try {
    const context = await loadEngineContext(parsed.data.requestDraft.during);
    const engineRequest = await loadEngineRequestForDraft(parsed.data.requestDraft, actor.id, context.now);
    const authoritative = recommend(engineRequest, context);
    const selectedIndex = authoritative.top.findIndex((item) => item.roomId === parsed.data.recommendation.roomId);
    if (selectedIndex < 0) return apiError(409, "RECOMMENDATION_STALE", "That room is no longer a current recommendation.");
    const selected = authoritative.top[selectedIndex];
    const runnerUp = authoritative.top.find((item) => item.roomId !== selected.roomId);
    const roomCode = context.rooms.find((room) => room.id === selected.roomId)?.code ?? "the recommended room";
    return Response.json(await explainChoice(selected.score, runnerUp?.score, roomCode));
  } catch {
    return apiError(500, "EXPLANATION_FAILED", "Couldn't explain this recommendation right now.");
  }
}
