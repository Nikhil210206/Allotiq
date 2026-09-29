// POST /api/requests/parse — Text → ParsedRequest (Groq strict JSON or chrono fallback)
// Owner: Aaditya · Task A8
import { requireRole } from "@/lib/auth/session";
import { getNow } from "@/lib/clock";
import { apiError } from "@/lib/http";
import { parseRequest } from "@/lib/ai/parse";
import { z } from "zod";

const ParseRequestSchema = z.object({ text: z.string().trim().min(1).max(2000) }).strict();

export async function POST(request: Request) {
  try {
    await requireRole("requester", "admin");
  } catch (error) {
    return error as Response;
  }

  const body = await request.json().catch(() => undefined);
  const parsed = ParseRequestSchema.safeParse(body);
  if (!parsed.success) return apiError(400, "BAD_REQUEST", "Provide request text up to 2,000 characters.");

  let now: Date;
  try {
    now = new Date(await getNow());
  } catch {
    return apiError(503, "CLOCK_UNAVAILABLE", "The request parser is temporarily unavailable.");
  }

  try {
    return Response.json(await parseRequest(parsed.data.text, now));
  } catch {
    return apiError(500, "PARSE_FAILED", "Couldn't parse that request. Please review it in the form.");
  }
}
