// Who may decide (approve / reject) a request. Owner: Aditi · D6
import "server-only";
import type { Profile } from "@/contracts/domain";
import type { db } from "@/lib/db/server";

/** Admins decide anything; an approver only for requests on rooms they manage (a request with no room is admin-only). */
export async function canDecide(
  supabase: ReturnType<typeof db>,
  actor: Pick<Profile, "id" | "role">,
  roomId: string | null,
): Promise<boolean> {
  if (actor.role === "admin") return true;
  if (actor.role !== "approver" || !roomId) return false;
  const { data } = await supabase.from("rooms").select("approver_id").eq("id", roomId).maybeSingle();
  return data?.approver_id === actor.id;
}
