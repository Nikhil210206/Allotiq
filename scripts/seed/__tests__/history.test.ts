import { describe, expect, it } from "vitest";
import { ROOMS, USERS } from "../catalog";
import { generateHistory, summarize, type SeedRequest } from "../history";
import { hhmm, istDayOf, isoWeekday, resolveAnchor } from "../lib";

const ANCHORS = ["2026-09-30T13:50:00+05:30", "2026-10-07T13:50:00+05:30", "2027-01-13T13:50:00+05:30"];
const history = generateHistory(ANCHORS[0]);
const roomOf = (code: string) => ROOMS.find((r) => r.code === code)!;
const minutesOf = (iso: string) => hhmm(iso.slice(11, 16));
const occupying = (r: SeedRequest) => r.status === "completed" || r.status === "auto_released";

describe("resolveAnchor", () => {
  it("is the next Wednesday 13:50 IST", () => {
    expect(resolveAnchor(new Date("2026-09-29T10:00:00+05:30"), "")).toBe("2026-09-30T13:50:00+05:30");
    expect(resolveAnchor(new Date("2026-09-30T20:00:00+05:30"), "")).toBe("2026-09-30T13:50:00+05:30");
    expect(resolveAnchor(new Date("2026-10-01T09:00:00+05:30"), "")).toBe("2026-10-07T13:50:00+05:30");
    // 23:00 UTC Tuesday is already Wednesday in IST
    expect(resolveAnchor(new Date("2026-09-29T23:00:00Z"), "")).toBe("2026-09-30T13:50:00+05:30");
  });
  it("honours SEED_ANCHOR", () => {
    expect(resolveAnchor(new Date(), "2026-10-14T13:50:00+05:30")).toBe("2026-10-14T13:50:00+05:30");
  });
});

describe("catalog", () => {
  it("matches the plan's room mix and user roster", () => {
    const count = (t: string) => ROOMS.filter((r) => r.type === t).length;
    expect([count("lab"), count("classroom"), count("seminar_hall"), count("meeting_room"), count("auditorium")]).toEqual([
      12, 14, 5, 4, 1,
    ]);
    expect(USERS).toHaveLength(15);
    expect(new Set(ROOMS.map((r) => r.code)).size).toBe(ROOMS.length);
  });
  it("routes every Tech Park lab to the judge", () => {
    for (const r of ROOMS.filter((r) => r.building === "TP" && r.type === "lab")) expect(r.approver).toBe("judge");
  });
});

describe("generateHistory", () => {
  it("is deterministic", () => {
    expect(generateHistory(ANCHORS[0])).toEqual(history);
  });

  it.each(ANCHORS)("hits the dashboard targets for anchor %s", (anchor) => {
    const s = summarize(generateHistory(anchor));
    expect(s.total).toBeGreaterThanOrEqual(850);
    expect(s.total).toBeLessThanOrEqual(980);
    expect(s.ghostRate).toBeGreaterThan(0.15);
    expect(s.ghostRate).toBeLessThan(0.21);
    expect(s.unmet).toBe(7);
  });

  it("ends before the anchor, in the four weeks before it", () => {
    const anchorMs = Date.parse(ANCHORS[0]);
    for (const r of history) {
      expect(Date.parse(r.end)).toBeLessThanOrEqual(anchorMs);
      expect(Date.parse(r.start)).toBeGreaterThanOrEqual(anchorMs - 29 * 86_400_000);
      expect(Date.parse(r.createdAt)).toBeLessThan(Date.parse(r.start));
    }
  });

  it("never double-books a room", () => {
    const byRoom = new Map<string, SeedRequest[]>();
    for (const r of history.filter(occupying)) byRoom.set(r.roomCode!, [...(byRoom.get(r.roomCode!) ?? []), r]);
    for (const rs of byRoom.values()) {
      const sorted = rs.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
      for (let i = 1; i < sorted.length; i++) {
        expect(Date.parse(sorted[i].start)).toBeGreaterThanOrEqual(Date.parse(sorted[i - 1].end));
      }
    }
  });

  it("respects every hard constraint of the room it placed", () => {
    for (const r of history.filter((r) => r.roomCode)) {
      const room = roomOf(r.roomCode!);
      const user = USERS.find((u) => u.key === r.requesterKey)!;
      expect(r.headcount).toBeLessThanOrEqual(room.capacity);
      expect(room.systems).toBeGreaterThanOrEqual(r.minSystems);
      for (const f of r.requiredFeatures) expect(room.features).toContain(f);
      if (room.access === "dept_only") expect(user.dept).toBe(room.dept);
      expect(room.days).toContain(isoWeekday(istDayOf(new Date(r.start))));
      expect(minutesOf(r.start)).toBeGreaterThanOrEqual(hhmm(room.open));
      expect(minutesOf(r.end)).toBeLessThanOrEqual(hhmm(room.close));
    }
  });

  it("puts the unmet demand on weekday evenings for 100+ seats", () => {
    const unmet = history.filter((r) => r.unplacedReason);
    for (const r of unmet) {
      expect(r.headcount).toBeGreaterThanOrEqual(100);
      expect(r.roomCode).toBeNull();
      expect(isoWeekday(istDayOf(new Date(r.start)))).toBeLessThanOrEqual(5);
      expect(minutesOf(r.start)).toBeGreaterThanOrEqual(hhmm("17:00"));
      // Genuinely unmet: every hall that would fit is booked at that time.
      const fitting = ROOMS.filter(
        (room) =>
          room.type === r.roomType &&
          room.capacity >= r.headcount &&
          r.requiredFeatures.every((f) => room.features.includes(f)),
      );
      expect(fitting.length).toBeGreaterThan(0);
      for (const room of fitting) {
        const taken = history.some(
          (o) => occupying(o) && o.roomCode === room.code && o.start < r.end && r.start < o.end,
        );
        expect(taken).toBe(true);
      }
    }
  });

  it("shapes demand: 10–12 and 14–16 peaks, a Friday-afternoon dip, evening ghosts", () => {
    const placed = history.filter(occupying);
    const inHours = (from: string, to: string, rs = placed) =>
      rs.filter((r) => minutesOf(r.start) >= hhmm(from) && minutesOf(r.start) < hhmm(to)).length;
    expect(inHours("10:00", "12:00")).toBeGreaterThan(inHours("12:00", "14:00"));
    expect(inHours("14:00", "16:00")).toBeGreaterThan(inHours("16:00", "18:00"));

    const onDay = (wd: number) => placed.filter((r) => isoWeekday(istDayOf(new Date(r.start))) === wd);
    expect(inHours("13:00", "20:00", onDay(5))).toBeLessThan(inHours("13:00", "20:00", onDay(4)) * 0.7);

    const ghostRate = (rs: SeedRequest[]) => rs.filter((r) => r.status === "auto_released").length / rs.length;
    const clubEvening = placed.filter((r) => r.requesterKey.endsWith("-club") && minutesOf(r.start) >= hhmm("16:00"));
    expect(ghostRate(clubEvening)).toBeGreaterThan(ghostRate(placed) * 2);
  });
});
