// Rule-based parser (chrono-node + regex) — works with Groq off. Owner: Aaditya · A8
import "server-only";
import type { ParsedRequest } from "@/contracts/ai";

export function fallbackParse(_text: string, _now: Date): ParsedRequest {
  throw new Error("Not implemented yet (A8)");
}
