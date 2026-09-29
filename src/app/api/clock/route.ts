// GET /api/clock — Returns virtual now (real time + demo offset)
// Owner: Aditi · Task D3
import { getClockState } from "@/lib/clock";
import { apiError } from "@/lib/http";

export async function GET() {
  try {
    const { now, offsetMs } = await getClockState();
    return Response.json({ now: now.toISOString(), offsetMs });
  } catch {
    return apiError(503, "CLOCK_UNAVAILABLE", "The virtual clock is temporarily unavailable");
  }
}
