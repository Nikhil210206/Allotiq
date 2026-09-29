// POST /api/ai/ask — admin-only read-only analytics assistant.
import { AskSchema } from "@/contracts/ai";
import { requireRole } from "@/lib/auth/session";
import { askDashboard } from "@/lib/ai/ask";
import { AnalyticsNotInstalled } from "@/lib/analytics";
import { apiError } from "@/lib/http";

export async function POST(request: Request) {
  try { await requireRole("admin"); } catch (error) { return error as Response; }
  const body = await request.json().catch(() => undefined);
  const parsed = AskSchema.safeParse(body);
  if (!parsed.success) return apiError(400, "BAD_REQUEST", "Ask a question between 3 and 300 characters.");
  try { return Response.json(await askDashboard(parsed.data.question)); }
  catch (error) {
    if (error instanceof AnalyticsNotInstalled) return apiError(501, "ANALYTICS_UNAVAILABLE", "Analytics are not available yet.");
    return apiError(500, "ASK_FAILED", "Couldn't answer that analytics question right now.");
  }
}
