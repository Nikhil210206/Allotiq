// Interval helpers. Half-open [start, end); all wall-clock checks in Asia/Kolkata. Owner: Aaditya · A1
import type { Interval } from "@/contracts/domain";

/** a.start < b.end && b.start < a.end — so 16:00–18:00 and 18:00–20:00 do not overlap. */
export function overlaps(a: Interval, b: Interval): boolean {
  return Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);
}

export function durationMinutes(i: Interval): number {
  return (Date.parse(i.end) - Date.parse(i.start)) / 60_000;
}

/** True if the interval sits inside opening hours on an open ISO weekday (IST). */
export function withinHours(
  _i: Interval,
  _hours: { open: string; close: string; days: number[] },
): boolean {
  throw new Error("Not implemented yet (A1)");
}
