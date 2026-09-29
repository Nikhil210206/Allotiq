// Display + wall-clock helpers. Everything the UI shows is in IST (Asia/Kolkata, no DST → fixed +05:30).
import type { Interval } from "@/contracts/domain";

const TZ = "Asia/Kolkata";
const IST_MS = 330 * 60_000;

const f = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { timeZone: TZ, ...opts });
const timeFmt = f({ hour: "2-digit", minute: "2-digit", hour12: false });
const dayFmt = f({ weekday: "short", day: "numeric", month: "short" });
const longDayFmt = f({ weekday: "long", day: "numeric", month: "long" });
const weekdayFmt = f({ weekday: "short" });

/** "14:00" */
export const fmtTime = (iso: string | Date) => timeFmt.format(new Date(iso));
/** "Thu, 1 Oct" → "Thu 1 Oct" */
export const fmtDay = (iso: string | Date) => dayFmt.format(new Date(iso)).replace(",", "");
/** "Thursday 1 October" */
export const fmtDayLong = (iso: string | Date) => longDayFmt.format(new Date(iso)).replace(",", "");
export const fmtWeekday = (iso: string | Date) => weekdayFmt.format(new Date(iso));
/** "14:00–16:00" */
export const fmtRange = (i: Interval) => `${fmtTime(i.start)}–${fmtTime(i.end)}`;
/** "Thu 1 Oct · 14:00–16:00" */
export const fmtWhen = (i: Interval) => `${fmtDay(i.start)} · ${fmtRange(i)}`;

/** "YYYY-MM-DD" of the IST calendar day. */
export function istDate(iso: string | Date): string {
  const d = new Date(new Date(iso).getTime() + IST_MS);
  return d.toISOString().slice(0, 10);
}
/** Minutes after IST midnight. */
export function istMinutes(iso: string | Date): number {
  const d = new Date(new Date(iso).getTime() + IST_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
/** ISO weekday (1 = Monday) of the IST day. */
export function istWeekday(iso: string | Date): number {
  const d = new Date(new Date(iso).getTime() + IST_MS);
  return d.getUTCDay() || 7;
}
/** "2026-10-01" + "14:00" → "2026-10-01T14:00:00+05:30" */
export function toIso(date: string, hhmm: string): string {
  return `${date}T${hhmm.length === 5 ? hhmm : hhmm.padStart(5, "0")}:00+05:30`;
}
/** Add days to a "YYYY-MM-DD". */
export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export const hhmmOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** "Today" / "Tomorrow" / "Yesterday" / "Thu 1 Oct", relative to the (virtual) now. */
export function relDay(iso: string, now: Date): string {
  const diff = Math.round(
    (Date.parse(`${istDate(iso)}T00:00:00Z`) - Date.parse(`${istDate(now)}T00:00:00Z`)) / 86_400_000,
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return fmtDay(iso);
}

/** "1h 42m" · "12m" · "40s" · "now" */
export function countdown(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d`;
}

/** "3 min ago" · "2 h ago" · "yesterday" */
export function ago(iso: string, now: Date): string {
  const ms = now.getTime() - Date.parse(iso);
  const m = Math.round(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  if (h < 48) return "yesterday";
  return `${Math.round(h / 24)} days ago`;
}
