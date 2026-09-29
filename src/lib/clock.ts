import "server-only";
import { db } from "@/lib/db/server";

export async function getNow(): Promise<string> {
  const supabase = db();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "clock_offset_ms")
    .maybeSingle();

  const offsetMs = data?.value ? Number(data.value) : 0;
  return new Date(Date.now() + offsetMs).toISOString();
}

export async function setClockOffset(offsetMs: number): Promise<void> {
  const supabase = db();
  await supabase
    .from("app_settings")
    .upsert({ key: "clock_offset_ms", value: offsetMs });
}

export async function advanceClock(minutes: number): Promise<void> {
  const supabase = db();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "clock_offset_ms")
    .maybeSingle();

  const currentOffset = data?.value ? Number(data.value) : 0;
  const newOffset = currentOffset + minutes * 60000;
  await setClockOffset(newOffset);
}
