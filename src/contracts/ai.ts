/**
 * Groq (LLM) input/output contracts. FROZEN after Phase 0.
 * Rule: the LLM never makes allocation decisions. Every output is validated with these schemas.
 */
import { z } from "zod";
import { FEATURES, PURPOSES, ROOM_TYPES } from "./domain";

// ---------- Parse (text / voice → structured request) ----------

export const ParsedRequestSchema = z.object({
  title: z.string(),
  purpose: z.enum(PURPOSES),
  headcount: z.int().nullable(),
  min_systems: z.int().nullable(),
  date: z.string().nullable(), // YYYY-MM-DD
  start_time: z.string().nullable(), // HH:MM
  end_time: z.string().nullable(),
  required_features: z.array(z.enum(FEATURES)),
  room_type: z.enum(ROOM_TYPES).nullable(),
  preferred_building_code: z.string().nullable(),
  notes: z.string(),
  missing_fields: z.array(z.string()),
  confidence: z.number(),
});
export type ParsedRequest = z.infer<typeof ParsedRequestSchema>;

export interface ParseResponse {
  parsed: ParsedRequest;
  /** "groq" normally; "fallback" when Groq is off/down (chrono-node parser). */
  via: "groq" | "fallback";
}

/** JSON Schema sent to Groq (strict: every field required, nullable via anyOf). */
export const PARSED_REQUEST_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "purpose",
    "headcount",
    "min_systems",
    "date",
    "start_time",
    "end_time",
    "required_features",
    "room_type",
    "preferred_building_code",
    "notes",
    "missing_fields",
    "confidence",
  ],
  properties: {
    title: { type: "string" },
    purpose: { type: "string", enum: [...PURPOSES] },
    headcount: { anyOf: [{ type: "integer" }, { type: "null" }] },
    min_systems: { anyOf: [{ type: "integer" }, { type: "null" }] },
    date: { anyOf: [{ type: "string", description: "YYYY-MM-DD" }, { type: "null" }] },
    start_time: { anyOf: [{ type: "string", description: "HH:MM 24h" }, { type: "null" }] },
    end_time: { anyOf: [{ type: "string", description: "HH:MM 24h" }, { type: "null" }] },
    required_features: { type: "array", items: { type: "string", enum: [...FEATURES] } },
    room_type: { anyOf: [{ type: "string", enum: [...ROOM_TYPES] }, { type: "null" }] },
    preferred_building_code: { anyOf: [{ type: "string" }, { type: "null" }] },
    notes: { type: "string" },
    missing_fields: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
  },
} as const;

// ---------- Explain "why this room" ----------

export const ExplanationSchema = z.object({
  headline: z.string().max(90),
  reasons: z.array(z.string()).max(3),
  tradeoff: z.string().nullable(),
});
export type Explanation = z.infer<typeof ExplanationSchema>;

// ---------- Ask the dashboard ----------

export const AskSchema = z.object({ question: z.string().min(3).max(300) });

export const AskAnswerSchema = z.object({
  answer: z.string(),
  highlights: z.array(z.object({ label: z.string(), value: z.string() })),
  chart_tool_call_id: z.string().nullable(),
});
export type AskAnswer = z.infer<typeof AskAnswerSchema>;

export interface AskResponse extends AskAnswer {
  /** Chart rows come straight from the analytics tool result, never from LLM text. */
  chart: { title: string; rows: { label: string; value: number }[] } | null;
  via: "groq" | "unavailable";
}

// ---------- Weekly insight ----------

export const WeeklyInsightSchema = z.object({
  headline: z.string(),
  bullets: z.array(z.string()).min(3).max(5),
  recommendation: z.string(),
});
export type WeeklyInsight = z.infer<typeof WeeklyInsightSchema>;
