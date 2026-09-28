// Session helpers for server code. Owner: Aditi · D2
import "server-only";
import type { Profile, UserRole } from "@/contracts/domain";

export async function getSessionUser(): Promise<Profile | null> {
  throw new Error("Not implemented yet (D2)");
}

/** Throws a 401/403 Response if the user is missing or lacks the role. */
export async function requireRole(..._roles: UserRole[]): Promise<Profile> {
  throw new Error("Not implemented yet (D2)");
}
