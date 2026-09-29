// Seed helpers: stable ids, seeded PRNG, IST wall-clock time, the demo anchor. Owner: Nikhil · N3
// Pure and browser-safe (no node:crypto): used by the DB seed, the demo reset and the mock backend.

/** cyrb128 — a fast, non-cryptographic 128-bit string hash. */
function hash128(str: string): string {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, "0")).join("");
}

/** Deterministic UUID from a name, so ids (and sessions, QR links) survive a reseed. */
export function stableId(kind: string, key: string): string {
  const h = hash128(`allotiq:${kind}:${key}`);
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(xs: readonly T[]): T;
  weighted<T>(entries: readonly (readonly [T, number])[]): T;
}

/** mulberry32 — small, fast, deterministic. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    weighted: (entries) => {
      const total = entries.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [v, w] of entries) {
        if ((r -= w) < 0) return v;
      }
      return entries[entries.length - 1][0];
    },
  };
}

// ---------- IST wall-clock time (IST has no DST, so a fixed +05:30 offset is exact) ----------

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const DAY_MS = 86_400_000;

/** A calendar day in IST, as the UTC-midnight Date with the same Y-M-D. */
export type Day = Date;

export function istDayOf(instant: Date): Day {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

export function addDays(day: Day, n: number): Day {
  return new Date(day.getTime() + n * DAY_MS);
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function isoWeekday(day: Day): number {
  return day.getUTCDay() || 7;
}

/** "2026-10-01T14:00:00+05:30" for a day + minutes after IST midnight. */
export function istIso(day: Day, minutes: number): string {
  const d = new Date(day.getTime() + minutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00+05:30`
  );
}

/** "HH:MM" → minutes after midnight. */
export function hhmm(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

export const ANCHOR_MINUTES = 13 * 60 + 50; // Wednesday 13:50 IST

/**
 * The demo anchor: Wednesday 13:50 IST of the demo week — the next Wednesday on or after `now`
 * (in IST). SEED_ANCHOR (any ISO timestamp) overrides it.
 */
export function resolveAnchor(now: Date = new Date(), override = process.env.SEED_ANCHOR): string {
  if (override) {
    const t = new Date(override);
    if (Number.isNaN(t.getTime())) throw new Error(`SEED_ANCHOR is not a valid timestamp: ${override}`);
    return istIso(istDayOf(t), Math.round((t.getTime() + IST_OFFSET_MS - istDayOf(t).getTime()) / 60_000));
  }
  const today = istDayOf(now);
  const wednesday = addDays(today, (3 - isoWeekday(today) + 7) % 7);
  return istIso(wednesday, ANCHOR_MINUTES);
}
