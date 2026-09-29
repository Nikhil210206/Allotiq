// GET /api/lab/scenarios — List Allocation Lab scenarios
// Owner: Aaditya · Task A9
import { requireRole } from "@/lib/auth/session";
import { apiError } from "@/lib/http";
import { listLabScenarios } from "@/server/lab-adapter";

export async function GET() {
  try {
    await requireRole("admin");
  } catch (error) {
    return error as Response;
  }

  try {
    return Response.json(await listLabScenarios());
  } catch {
    return apiError(500, "LAB_SCENARIOS_FAILED", "Couldn't load Lab scenarios.");
  }
}
