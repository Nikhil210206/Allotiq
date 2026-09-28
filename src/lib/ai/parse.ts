// Text → ParsedRequest with strict json_schema; falls back to fallback-parse.ts. Owner: Aaditya · A8
import "server-only";
import type { ParseResponse } from "@/contracts/ai";

export async function parseRequest(_text: string, _now: Date): Promise<ParseResponse> {
  throw new Error("Not implemented yet (A8)");
}
