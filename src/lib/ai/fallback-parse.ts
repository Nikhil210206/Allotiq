// Rule-based parser (chrono-node + regex) — works with Groq off. Owner: Aaditya · A8
import "server-only";
import * as chrono from "chrono-node";
import { FEATURES, PURPOSES, ROOM_TYPES } from "@/contracts/domain";
import type { ParsedRequest } from "@/contracts/ai";
import { BUILDINGS } from "@/lib/seed/catalog";

const istDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const NULLABLE_REQUEST_FIELDS = [
  "headcount",
  "min_systems",
  "date",
  "start_time",
  "end_time",
  "room_type",
  "preferred_building_code",
] as const;

type NullableRequestField = (typeof NULLABLE_REQUEST_FIELDS)[number];

/** Keep missing-field reporting aligned with nullable fields in ParsedRequestSchema. */
export function normalizeMissingFields(
  parsed: Pick<ParsedRequest, NullableRequestField>,
): NullableRequestField[] {
  return NULLABLE_REQUEST_FIELDS.filter((field) => parsed[field] === null);
}

function istDate(date: Date): string {
  const parts = Object.fromEntries(istDateFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function titleFrom(text: string): string {
  const titles = [...text.matchAll(/\bfor\s+([A-Za-z][A-Za-z0-9&/ -]{1,59})/gi)];
  const tail = titles.at(-1)?.[1]?.trim();
  const source = tail || text.trim().split(/\s+/).slice(0, 6).join(" ") || "Room request";
  return source.replace(/\b[a-z]/g, (letter) => letter.toUpperCase()).slice(0, 120);
}

function clock(hourRaw: string, minuteRaw: string | undefined, meridiem?: string | null): string | null {
  let hour = Number(hourRaw);
  const minute = Number(minuteRaw ?? 0);
  const period = meridiem?.toLowerCase();
  if (minute < 0 || minute > 59) return null;
  if (period) {
    if (hour < 1 || hour > 12) return null;
    if (period === "pm" && hour < 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;
  } else {
    if (hour < 0 || hour > 23) return null;
    if (hour >= 1 && hour <= 7) hour += 12;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timesFrom(text: string, parsed: chrono.ParsedResult[]): { start: string | null; end: string | null } {
  const range = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|till|until|[-–—])\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (range) {
    const startPeriod = range[3] ?? range[6];
    const start = clock(range[1], range[2], startPeriod);
    const end = clock(range[4], range[5], range[6] ?? range[3]);
    if (!start || !end || end <= start) return { start: null, end: null };
    return { start, end };
  }

  const time = parsed.find((item) => item.start.isCertain("hour"));
  if (!time) return { start: null, end: null };
  const hour = time.start.get("hour");
  if (hour === null) return { start: null, end: null };
  const start = clock(String(hour), String(time.start.get("minute") ?? 0));
  if (!start) return { start: null, end: null };
  const endHour = time.end?.get("hour");
  const endMinute = time.end?.get("minute") ?? 0;
  const end = endHour === undefined || endHour === null
    ? `${String(Math.min(20, Number(start.slice(0, 2)) + 1)).padStart(2, "0")}:${start.slice(3)}`
    : clock(String(endHour), String(endMinute));
  return end && end > start ? { start, end } : { start, end: null };
}

function purposeFrom(text: string): ParsedRequest["purpose"] {
  const value = text.toLowerCase();
  if (/\bexam\b|\btest\b|\bviva\b/.test(value)) return "exam";
  if (/\bclub\b|\bhackathon\b|\bcontest\b|\bsociety\b/.test(value)) return "club_event";
  if (/\bmeeting\b|\breview\b|\bboard meeting\b/.test(value)) return "meeting";
  if (/\bguest\b|\bseminar\b|\btalk\b|\balumni\b|\bdepartment\b/.test(value)) return "department_event";
  if (/\blab\b|\blecture\b|\bclass\b|\btutorial\b|\bcourse\b/.test(value)) return "academic";
  return "student_activity";
}

function roomTypeFrom(text: string): ParsedRequest["room_type"] {
  const value = text.toLowerCase();
  if (/\blab\b|systems|computers|\bpcs\b/.test(value)) return "lab";
  if (/seminar|hall|guest lecture|\btalk\b/.test(value)) return "seminar_hall";
  if (/meeting|board|review meeting/.test(value)) return "meeting_room";
  if (/auditorium|fest|convocation/.test(value)) return "auditorium";
  if (/class|lecture|tutorial|\bexam\b/.test(value)) return "classroom";
  return null;
}

function buildingFrom(text: string): string | null {
  const value = text.toLowerCase();
  return BUILDINGS.find((building) =>
    new RegExp(`\\b${building.code.toLowerCase()}\\b`).test(value) || value.includes(building.name.toLowerCase()),
  )?.code ?? null;
}

export function fallbackParse(text: string, now: Date): ParsedRequest {
  const trimmed = text.trim().slice(0, 2000);
  const parsedDates = chrono.parse(trimmed, { instant: now, timezone: 330 }, { forwardDate: true });
  const dateResult = parsedDates.find((item) =>
    item.start.isCertain("weekday") || (item.start.isCertain("day") && item.start.isCertain("month")),
  );
  const today = istDate(now);
  const candidateDate = dateResult ? istDate(dateResult.start.date()) : null;
  const date = candidateDate && candidateDate >= today ? candidateDate : null;

  const systemsMatch = trimmed.match(/\b(\d{1,4})\s*(?:systems|computers|pcs|machines)\b/i);
  const peopleMatch = trimmed.match(/\b(\d{1,4})\s*(?:people|persons|students|pax|seats|attendees|members)\b/i)
    ?? trimmed.match(/\bfor\s+(\d{2,4})\b/i);
  const systems = systemsMatch ? Number(systemsMatch[1]) : null;
  const statedHeadcount = peopleMatch ? Number(peopleMatch[1]) : null;
  const headcount = statedHeadcount ?? systems;
  const minSystems = systems;

  const requiredFeatures = FEATURES.filter((feature) => {
    if (feature === "computers" && systemsMatch) return true;
    const words: Record<string, RegExp> = {
      projector: /\bprojector\b/i,
      mic: /\bmic\b|microphone|sound system/i,
      smart_board: /smart[ -]?board/i,
      ac: /\bac\b|air[ -]?conditioning/i,
      video_conf: /video conference|video call|zoom|teams/i,
      whiteboard: /whiteboard/i,
      stage: /\bstage\b/i,
      recording: /recording|record the session/i,
    };
    return words[feature]?.test(trimmed) ?? false;
  });

  const times = timesFrom(trimmed, parsedDates);
  const inferredHeadcount = statedHeadcount === null && systems !== null;
  const parsed = {
    headcount,
    min_systems: minSystems,
    date,
    start_time: times.start,
    end_time: times.end,
    room_type: roomTypeFrom(trimmed),
    preferred_building_code: buildingFrom(trimmed),
  };
  const missingFields = normalizeMissingFields(parsed);
  return {
    title: titleFrom(trimmed),
    purpose: purposeFrom(trimmed),
    headcount,
    min_systems: parsed.min_systems,
    date: parsed.date,
    start_time: parsed.start_time,
    end_time: parsed.end_time,
    required_features: requiredFeatures,
    room_type: parsed.room_type,
    preferred_building_code: parsed.preferred_building_code,
    notes: inferredHeadcount ? "Headcount taken from the number of systems" : "",
    missing_fields: missingFields,
    confidence: missingFields.length === 0 ? 0.92 : 0.55,
  };
}
