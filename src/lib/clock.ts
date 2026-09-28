// Virtual clock for the demo time machine. ALL business logic uses getNow(). Owner: Aditi · D3
import "server-only";

/** Real time + the offset stored in app_settings.clock_offset_ms. */
export async function getNow(): Promise<Date> {
  throw new Error("Not implemented yet (D3)");
}
