// Groq client: server-only key, model resolution via /models, timeouts, 429 backoff, circuit breaker, GROQ_DISABLED. Owner: Aaditya · A8
import "server-only";
import Groq from "groq-sdk";
import { PARSED_REQUEST_JSON_SCHEMA } from "@/contracts/ai";

const DEFAULT_PARSE_MODEL = "openai/gpt-oss-20b";
const PARSE_TIMEOUT_MS = 6000;
const MODEL_CACHE_MS = 5 * 60_000;
const FAILURE_WINDOW_MS = 60_000;
const CIRCUIT_OPEN_MS = 2 * 60_000;
const MAX_RATE_LIMIT_RETRIES = 2;

type GroqClient = InstanceType<typeof Groq>;
let client: GroqClient | null = null;
let clientKey: string | null = null;
let cachedModel: { configured: string; selected: string; expiresAt: number } | null = null;
let failures: number[] = [];
let circuitOpenUntil = 0;

export function groqEnabled(): boolean {
  return !!process.env.GROQ_API_KEY && process.env.GROQ_DISABLED !== "true";
}

function getClient(): GroqClient {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Groq is not configured");
  if (!client || clientKey !== key) {
    client = new Groq({ apiKey: key, timeout: PARSE_TIMEOUT_MS, maxRetries: 0 });
    clientKey = key;
  }
  return client;
}

function recordFailure(): void {
  const now = performance.now();
  // Failures observed while open must not extend the contract's fixed open interval.
  if (now < circuitOpenUntil) return;
  circuitOpenUntil = 0;
  failures = failures.filter((at) => now - at <= FAILURE_WINDOW_MS);
  failures.push(now);
  if (failures.length >= 3) circuitOpenUntil = now + CIRCUIT_OPEN_MS;
}

function circuitIsOpen(): boolean {
  return performance.now() < circuitOpenUntil;
}

function retryAfterMs(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("headers" in error)) return null;
  const headers = (error as { headers?: Headers }).headers;
  const value = headers?.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - Date.now()) : null;
}

async function withRateLimitRetries<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  for (let retry = 0; ; retry++) {
    // Concurrent calls may have opened the breaker while this call was in flight.
    if (circuitIsOpen()) throw new Error("Groq circuit is open");
    try {
      return await operation();
    } catch (error) {
      recordFailure();
      const status = typeof error === "object" && error !== null && "status" in error
        ? (error as { status?: number }).status
        : undefined;
      if (status !== 429 || retry >= MAX_RATE_LIMIT_RETRIES || signal.aborted || circuitIsOpen()) throw error;

      const requestedDelay = retryAfterMs(error);
      const jitter = Math.floor(Math.random() * 101);
      const delay = requestedDelay ?? 250 * 2 ** retry + jitter;
      if (delay >= PARSE_TIMEOUT_MS || signal.aborted) throw error;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("Groq request timed out"));
        }, { once: true });
      });
    }
  }
}

async function resolveModel(groq: GroqClient, signal: AbortSignal, configured: string): Promise<string> {
  if (cachedModel && cachedModel.configured === configured && cachedModel.expiresAt > performance.now()) {
    return cachedModel.selected;
  }

  const { data } = await withRateLimitRetries(() => groq.models.list({ signal }), signal);
  const available = new Set(data.map((model) => model.id));
  const selected = [configured, DEFAULT_PARSE_MODEL].find((model) => available.has(model));
  if (!selected) throw new Error("No supported parser model is available");
  if (selected !== configured) console.warn("[groq] configured parser model unavailable; using the plan default");
  cachedModel = { configured, selected, expiresAt: performance.now() + MODEL_CACHE_MS };
  return selected;
}

async function resolveParseModel(groq: GroqClient, signal: AbortSignal): Promise<string> {
  return resolveModel(groq, signal, process.env.GROQ_MODEL_PARSE?.trim() || DEFAULT_PARSE_MODEL);
}

/** Call only from server-side A8 parsing. Provider failures intentionally expose no raw details. */
export async function requestGroqStructuredParse(systemPrompt: string, userText: string): Promise<string> {
  if (!groqEnabled()) throw new Error("Groq is disabled");
  if (circuitIsOpen()) throw new Error("Groq circuit is open");

  try {
    const groq = getClient();
    const signal = AbortSignal.timeout(PARSE_TIMEOUT_MS);
    const model = await resolveParseModel(groq, signal);
    const completion = await withRateLimitRetries(
      () => groq.chat.completions.create({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "parsed_request",
            strict: true,
            schema: PARSED_REQUEST_JSON_SCHEMA,
          },
        },
      }, { signal }),
      signal,
    );
    const content = completion.choices[0]?.message.content;
    if (typeof content !== "string") {
      recordFailure();
      throw new Error("Groq returned no structured content");
    }
    return content;
  } catch {
    throw new Error("Groq parsing is unavailable");
  }
}

/** Server-only bounded JSON completion for grounded explanation/analytics tasks. */
export async function requestGroqJson(systemPrompt: string, userText: string): Promise<string> {
  if (!groqEnabled()) throw new Error("Groq is disabled");
  if (circuitIsOpen()) throw new Error("Groq circuit is open");

  try {
    const groq = getClient();
    const signal = AbortSignal.timeout(PARSE_TIMEOUT_MS);
    const configured = process.env.GROQ_MODEL_REASON?.trim() || DEFAULT_PARSE_MODEL;
    const model = await resolveModel(groq, signal, configured);
    const completion = await withRateLimitRetries(
      () => groq.chat.completions.create({
        model,
        temperature: 0,
        max_tokens: 256,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText },
        ],
        response_format: { type: "json_object" },
      }, { signal }),
      signal,
    );
    const content = completion.choices[0]?.message.content;
    if (typeof content !== "string" || content.length > 8192) {
      recordFailure();
      throw new Error("Groq returned invalid JSON content");
    }
    return content;
  } catch {
    throw new Error("Groq response is unavailable");
  }
}
