// POST /api/requests/recommend — Top 3 rooms + breakdowns + why-not + alternatives
// Owner: Aaditya · Task A7
import { RequestDraftSchema, type RecommendResponse } from "@/contracts/api";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import { loadEngineContext, loadEngineRequestForDraft } from "@/server/engine-adapter";
import { recommend } from "@/engine/recommend";
import type { Json } from "@/lib/db/types.gen";

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requireRole("requester", "admin");
  } catch (error) {
    return error as Response;
  }

  const body = await request.json().catch(() => undefined);
  const parsed = RequestDraftSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request draft");
  }

  try {
    const ctx = await loadEngineContext(parsed.data.during);
    const req = await loadEngineRequestForDraft(parsed.data, actor.id, ctx.now);
    const startedAt = performance.now();
    const result = recommend(req, ctx);
    const elapsedMs = Math.round(performance.now() - startedAt);
    const { data, error } = await db()
      .from("engine_runs")
      .insert({
        kind: "recommend",
        solver: null,
        input: parsed.data as unknown as Json,
        output: result as unknown as Json,
        ms: elapsedMs,
        created_at: ctx.now,
      })
      .select("id")
      .single();

    if (error || !data) throw new Error("Unable to record recommendation result");
    return Response.json({ ...result, engineRunId: data.id } satisfies RecommendResponse);
  } catch {
    return apiError(500, "RECOMMENDATION_FAILED", "Couldn't generate room recommendations right now.");
  }
}
