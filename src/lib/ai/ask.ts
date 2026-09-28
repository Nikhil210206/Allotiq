// Ask the dashboard: tool loop over analytics_* functions, then strict final answer. Owner: Aaditya · A15
import "server-only";
import type { AskResponse } from "@/contracts/ai";

export async function askDashboard(_question: string): Promise<AskResponse> {
  throw new Error("Not implemented yet (A15)");
}
