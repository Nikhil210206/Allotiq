// A1 — time.ts tests. Owner: Aaditya
import { describe, expect, it } from "vitest";
import { durationMinutes, overlaps, withinHours } from "../time";

// ── overlaps (half-open [start, end)) ──────────────────────────

describe("overlaps", () => {
  it("touching intervals do NOT overlap (half-open)", () => {
    expect(
      overlaps(
        { start: "2026-10-01T16:00:00+05:30", end: "2026-10-01T18:00:00+05:30" },
        { start: "2026-10-01T18:00:00+05:30", end: "2026-10-01T20:00:00+05:30" },
      ),
    ).toBe(false);
  });

  it("reverse order touching do NOT overlap", () => {
    expect(
      overlaps(
        { start: "2026-10-01T18:00:00+05:30", end: "2026-10-01T20:00:00+05:30" },
        { start: "2026-10-01T16:00:00+05:30", end: "2026-10-01T18:00:00+05:30" },
      ),
    ).toBe(false);
  });

  it("identical intervals overlap", () => {
    const i = { start: "2026-10-01T16:00:00+05:30", end: "2026-10-01T18:00:00+05:30" };
    expect(overlaps(i, i)).toBe(true);
  });

  it("partially overlapping intervals overlap", () => {
    expect(
      overlaps(
        { start: "2026-10-01T15:00:00+05:30", end: "2026-10-01T17:00:00+05:30" },
        { start: "2026-10-01T16:00:00+05:30", end: "2026-10-01T18:00:00+05:30" },
      ),
    ).toBe(true);
  });

  it("one interval fully inside another overlaps", () => {
    expect(
      overlaps(
        { start: "2026-10-01T14:00:00+05:30", end: "2026-10-01T20:00:00+05:30" },
        { start: "2026-10-01T16:00:00+05:30", end: "2026-10-01T18:00:00+05:30" },
      ),
    ).toBe(true);
  });

  it("disjoint intervals do NOT overlap", () => {
    expect(
      overlaps(
        { start: "2026-10-01T10:00:00+05:30", end: "2026-10-01T12:00:00+05:30" },
        { start: "2026-10-01T14:00:00+05:30", end: "2026-10-01T16:00:00+05:30" },
      ),
    ).toBe(false);
  });
});

// ── durationMinutes ─────────────────────────────────────────────

describe("durationMinutes", () => {
  it("2-hour interval → 120 minutes", () => {
    expect(
      durationMinutes({
        start: "2026-10-01T16:00:00+05:30",
        end: "2026-10-01T18:00:00+05:30",
      }),
    ).toBe(120);
  });

  it("30-minute interval → 30", () => {
    expect(
      durationMinutes({
        start: "2026-10-01T09:00:00+05:30",
        end: "2026-10-01T09:30:00+05:30",
      }),
    ).toBe(30);
  });

  it("zero-length interval → 0", () => {
    const t = "2026-10-01T10:00:00+05:30";
    expect(durationMinutes({ start: t, end: t })).toBe(0);
  });
});

// ── withinHours ─────────────────────────────────────────────────

describe("withinHours", () => {
  const weekdayHours = { open: "08:00", close: "20:00", days: [1, 2, 3, 4, 5, 6] }; // Mon–Sat

  it("interval inside hours → true", () => {
    expect(
      withinHours(
        { start: "2026-10-01T10:00:00+05:30", end: "2026-10-01T12:00:00+05:30" }, // Thu
        weekdayHours,
      ),
    ).toBe(true);
  });

  it("interval exactly at open boundary → true", () => {
    expect(
      withinHours(
        { start: "2026-10-01T08:00:00+05:30", end: "2026-10-01T10:00:00+05:30" },
        weekdayHours,
      ),
    ).toBe(true);
  });

  it("interval exactly at close boundary → true", () => {
    expect(
      withinHours(
        { start: "2026-10-01T18:00:00+05:30", end: "2026-10-01T20:00:00+05:30" },
        weekdayHours,
      ),
    ).toBe(true);
  });

  it("interval exactly spanning open-to-close → true", () => {
    expect(
      withinHours(
        { start: "2026-10-01T08:00:00+05:30", end: "2026-10-01T20:00:00+05:30" },
        weekdayHours,
      ),
    ).toBe(true);
  });

  it("interval starting before open → false", () => {
    expect(
      withinHours(
        { start: "2026-10-01T07:30:00+05:30", end: "2026-10-01T09:00:00+05:30" },
        weekdayHours,
      ),
    ).toBe(false);
  });

  it("interval ending after close → false", () => {
    expect(
      withinHours(
        { start: "2026-10-01T19:00:00+05:30", end: "2026-10-01T21:00:00+05:30" },
        weekdayHours,
      ),
    ).toBe(false);
  });

  it("interval on a closed day (Sunday) → false", () => {
    expect(
      withinHours(
        { start: "2026-10-04T10:00:00+05:30", end: "2026-10-04T12:00:00+05:30" }, // Sun
        weekdayHours,
      ),
    ).toBe(false);
  });

  it("interval on Saturday (open) → true", () => {
    expect(
      withinHours(
        { start: "2026-10-03T10:00:00+05:30", end: "2026-10-03T12:00:00+05:30" }, // Sat
        weekdayHours,
      ),
    ).toBe(true);
  });

  // ── Midnight crossing ──

  it("interval crossing midnight → false (21:00–01:00 with hours 08:00–22:00)", () => {
    expect(
      withinHours(
        { start: "2026-10-01T21:00:00+05:30", end: "2026-10-02T01:00:00+05:30" },
        { open: "08:00", close: "22:00", days: [1, 2, 3, 4, 5, 6] },
      ),
    ).toBe(false);
  });

  it("interval crossing midnight → false (23:00–02:00 with hours 08:00–20:00)", () => {
    expect(
      withinHours(
        { start: "2026-10-01T23:00:00+05:30", end: "2026-10-02T02:00:00+05:30" },
        weekdayHours,
      ),
    ).toBe(false);
  });

  it("late-night interval within same day that's within hours → true", () => {
    const lateHours = { open: "08:00", close: "23:00", days: [1, 2, 3, 4, 5, 6] };
    expect(
      withinHours(
        { start: "2026-10-01T21:00:00+05:30", end: "2026-10-01T23:00:00+05:30" },
        lateHours,
      ),
    ).toBe(true);
  });
});
