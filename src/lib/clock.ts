// Virtual clock for the demo time machine. ALL business logic uses getNow(). Owner: Aditi · D3
import "server-only";
import { db } from "@/lib/db/server";

const OFFSET_KEY = "clock_offset_ms";

async function readClockOffset(): Promise<number> {
  const { data, error } = await db()
    .from("app_settings")
    .select("value")
    .eq("key", OFFSET_KEY)
    .maybeSingle();

  if (error) throw new Error("Unable to read the virtual clock offset", { cause: error });
  if (data === null) return 0;

  const offset = Number(data.value);
  if (!Number.isFinite(offset)) throw new Error("The virtual clock offset is invalid");
  return offset;
}

async function writeClockOffset(offsetMs: number): Promise<void> {
  const { error } = await db()
    .from("app_settings")
    .upsert({ key: OFFSET_KEY, value: offsetMs });

  if (error) throw new Error("Unable to update the virtual clock offset", { cause: error });
}

/** The virtual instant and its offset, read from one consistent settings result. */
export async function getClockState(): Promise<{ now: Date; offsetMs: number }> {
  const offsetMs = await readClockOffset();
  return { now: new Date(Date.now() + offsetMs), offsetMs };
}

/** Real time + the offset stored in app_settings.clock_offset_ms. */
export async function getNow(): Promise<Date> {
  return (await getClockState()).now;
}

export async function setClockOffset(offsetMs: number): Promise<void> {
  if (!Number.isFinite(offsetMs)) throw new Error("The virtual clock offset is invalid");
  await writeClockOffset(offsetMs);
}

export async function advanceClock(minutes: number): Promise<void> {
  const currentOffset = await readClockOffset();
  await writeClockOffset(currentOffset + minutes * 60000);
}
