// Interval helpers. Half-open [start, end); all wall-clock checks in Asia/Kolkata. Owner: Aaditya · A1
import type { Interval } from "@/contracts/domain";
import { TZ } from "@/contracts/domain";

/** a.start < b.end && b.start < a.end — so 16:00–18:00 and 18:00–20:00 do not overlap. */
export function overlaps(a: Interval, b: Interval): boolean {
  return Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);
}

export function durationMinutes(i: Interval): number {
  return (Date.parse(i.end) - Date.parse(i.start)) / 60_000;
}

// ── Internal helpers (no Date.now / new Date) ────────────────────

/** Parse "HH:MM" → total minutes from midnight. */
function parseHM(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Return the wall-clock hours, minutes, and ISO weekday of an ISO timestamp in Asia/Kolkata.
 * Uses Intl.DateTimeFormat — no `new Date()` in business logic.
 */
function wallClock(iso: string): { hours: number; minutes: number; weekday: number; dateKey: string } {
  const ms = Date.parse(iso);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(ms);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  const hours = parseInt(get("hour"), 10);
  const minutes = parseInt(get("minute"), 10);

  // ISO weekday: Monday = 1 … Sunday = 7
  const dayMap: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
  };
  const weekday = dayMap[get("weekday")] ?? 1;

  // A date key to detect when start and end fall on different calendar days
  const dateKey = `${get("year")}-${get("month")}-${get("day")}`;

  return { hours, minutes, weekday, dateKey };
}

/** Total minutes since midnight for a wall-clock time. */
function wallMinutes(wc: { hours: number; minutes: number }): number {
  return wc.hours * 60 + wc.minutes;
}

/**
 * True if the **entire** interval sits inside the room's opening hours
 * on an open ISO weekday (IST).
 *
 * Correctness rules:
 * - The interval's start weekday must be in `hours.days`.
 * - If start and end fall on different calendar days in IST (crossing midnight),
 *   the interval is NOT within hours — campus rooms operate within a single day.
 * - The wall-clock start must be ≥ open time.
 * - The wall-clock end must be ≤ close time.
 */
export function withinHours(
  i: Interval,
  hours: { open: string; close: string; days: number[] },
): boolean {
  const startWall = wallClock(i.start);
  const endWall = wallClock(i.end);

  // The start day must be an open day
  if (!hours.days.includes(startWall.weekday)) return false;

  // If the interval crosses midnight (different calendar days), it's outside hours
  if (startWall.dateKey !== endWall.dateKey) return false;

  const openMin = parseHM(hours.open);
  const closeMin = parseHM(hours.close);
  const startMin = wallMinutes(startWall);
  const endMin = wallMinutes(endWall);

  // Start must be ≥ open, end must be ≤ close
  return startMin >= openMin && endMin <= closeMin;
}
