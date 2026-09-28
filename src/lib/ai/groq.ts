// Groq client: server-only key, model resolution via /models, timeouts, 429 backoff, circuit breaker, GROQ_DISABLED. Owner: Aaditya · A8
import "server-only";
export function groqEnabled(): boolean {
  return !!process.env.GROQ_API_KEY && process.env.GROQ_DISABLED !== "true";
}
