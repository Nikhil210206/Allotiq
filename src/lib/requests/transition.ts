// The ONLY way a request changes status. The DB trigger validates the transition and writes the audit row.
// Owner: Aditi · D5
import "server-only";
import type { RequestStatus } from "@/contracts/domain";

export async function transition(
  _requestId: string,
  _to: RequestStatus,
  _opts: { actorId: string | null; action?: string; note?: string; patch?: Record<string, unknown> },
): Promise<void> {
  throw new Error("Not implemented yet (D5)");
}
