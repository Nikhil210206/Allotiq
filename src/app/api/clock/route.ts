// GET /api/clock — Returns virtual now (real time + demo offset)
// Owner: Aditi · Task D3
import { getNow } from "@/lib/clock";
import { db } from "@/lib/db/server";

export async function GET() {
  const now = await getNow();

  // Also return the raw offset so the demo control drawer can display it.
  const supabase = db();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "clock_offset_ms")
    .maybeSingle();

  const offsetMs = data?.value ? Number(data.value) : 0;
  return Response.json({ now, offsetMs });
}
