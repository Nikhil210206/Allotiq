// GET /api/health — DB ping + Groq model availability + clock. Public; never returns secrets.
// 200 while the DB answers (Groq and clock only degrade), 503 when the DB is down.
// Owner: Nikhil · Task N1
import { db } from "@/lib/db/server";
import { getNow } from "@/lib/clock";
import { groqEnabled } from "@/lib/ai/groq";

const TIMEOUT_MS = 3000;

type Check = { status: "ok" | "disabled" | "error"; latencyMs?: number; message?: string } & Record<string, unknown>;

function errorOf(e: unknown): Check {
  return { status: "error", message: e instanceof Error ? e.message : String(e) };
}

async function checkDb(): Promise<Check> {
  const started = Date.now();
  try {
    const { error } = await db()
      .from("app_settings")
      .select("key")
      .limit(1)
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    if (error) return { status: "error", message: error.message, latencyMs: Date.now() - started };
    return { status: "ok", latencyMs: Date.now() - started };
  } catch (e) {
    return errorOf(e);
  }
}

async function checkGroq(): Promise<Check> {
  if (!groqEnabled()) return { status: "disabled" };
  const started = Date.now();
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return { status: "error", message: `Groq /models returned ${res.status}` };
    const { data } = (await res.json()) as { data: { id: string }[] };
    const available = new Set(data.map((m) => m.id));
    const wanted = {
      parse: process.env.GROQ_MODEL_PARSE,
      reason: process.env.GROQ_MODEL_REASON,
      stt: process.env.GROQ_MODEL_STT,
    };
    const models = Object.fromEntries(
      Object.entries(wanted).map(([role, id]) => [role, { id: id ?? null, available: !!id && available.has(id) }]),
    );
    const allAvailable = Object.values(models).every((m) => m.available);
    return {
      status: allAvailable ? "ok" : "error",
      ...(allAvailable ? {} : { message: "A configured model is missing" }),
      latencyMs: Date.now() - started,
      models,
    };
  } catch (e) {
    return errorOf(e);
  }
}

async function checkClock(): Promise<Check> {
  try {
    const now = await getNow();
    return { status: "ok", now, offsetMs: Date.parse(now) - Date.now() };
  } catch (e) {
    return errorOf(e);
  }
}

export async function GET() {
  const [database, groq, clock] = await Promise.all([checkDb(), checkGroq(), checkClock()]);
  const down = database.status !== "ok";
  const degraded = groq.status === "error" || clock.status === "error";
  return Response.json(
    {
      status: down ? "down" : degraded ? "degraded" : "ok",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      checks: { database, groq, clock },
    },
    { status: down ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
