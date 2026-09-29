// GET /api/clock — Returns virtual now (real time + demo offset)
// Owner: Aditi · Task D3
import { getClockState } from "@/lib/clock";
import { apiError } from "@/lib/http";

export async function GET() {
  try {
    // The raw offset is returned too so the demo control drawer can display it.
    const { now, offsetMs } = await getClockState();
    return Response.json({ now, offsetMs });
  } catch {
    return apiError(503, "CLOCK_UNAVAILABLE", "The virtual clock is temporarily unavailable");
  }
}
