// In-app notifications (inserted rows reach the bell via Supabase Realtime). Owner: Aditi · D7
import "server-only";

export async function notify(_userId: string, _n: { kind: string; title: string; body?: string; requestId?: string }): Promise<void> {
  throw new Error("Not implemented yet (D7)");
}
