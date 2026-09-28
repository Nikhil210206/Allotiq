// Small helpers shared by all route handlers.
import type { ApiError } from "@/contracts/api";

export function apiError(status: number, error: string, message: string) {
  return Response.json({ error, message } satisfies ApiError, { status });
}

/** Stub response for endpoints not built yet — shows who owns it. */
export function notImplemented(owner: string, task: string) {
  return apiError(501, "NOT_IMPLEMENTED", `Not built yet — ${owner} · task ${task}`);
}
