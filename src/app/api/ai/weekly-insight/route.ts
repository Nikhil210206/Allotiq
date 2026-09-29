// GET /api/ai/weekly-insight — admin-only weekly operational insight.
import { requireRole } from "@/lib/auth/session";
import { weeklyInsight } from "@/lib/ai/insight";
import { AnalyticsNotInstalled } from "@/lib/analytics";
import { apiError } from "@/lib/http";

export async function GET() {
  try { await requireRole("admin"); } catch (error) { return error as Response; }
  try { return Response.json(await weeklyInsight()); }
  catch (error) {
    if (error instanceof AnalyticsNotInstalled) return apiError(501, "ANALYTICS_UNAVAILABLE", "Analytics are not available yet.");
    return apiError(500, "INSIGHT_FAILED", "Couldn't generate the weekly insight right now.");
  }
}
