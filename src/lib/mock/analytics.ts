// Utilisation analytics over the generated month (the same history `npm run seed` writes), so the
// dashboard shows the numbers the real analytics_* SQL will return. Owner: Nikhil · N7
import type { AskResponse } from "@/contracts/ai";
import type { RoomType } from "@/contracts/domain";
import type { DashboardFilters, DashboardMetrics } from "@/lib/api/types";
import { BUILDINGS, ROOMS, USERS } from "@/lib/seed/catalog";
import type { SeedRequest } from "@/lib/seed/history";
import { fmtDay, fmtRange, istDate, istMinutes, istWeekday } from "@/lib/time";
import { roomId } from "./catalog";
import { history } from "./state";

const DAY = 86_400_000;
const HOURS = Array.from({ length: 12 }, (_, i) => 8 + i);
const DAYS = [1, 2, 3, 4, 5, 6];
const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];


const hm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

function scope(f: DashboardFilters) {
  const rooms = ROOMS.filter(
    (r) => (!f.type || r.type === f.type) && (!f.building || r.building === f.building),
  );
  const codes = new Set(rooms.map((r) => r.code));
  const from = Date.parse(f.from);
  const to = Date.parse(f.to);
  const rows = history().filter((h) => {
    const t = Date.parse(h.start);
    return t >= from && t < to && (h.roomCode ? codes.has(h.roomCode) : !f.type || h.roomType === f.type);
  });
  return { rooms, rows, from, to };
}

/** Open room-hours in [from, to) for these rooms. */
function openHours(rooms: typeof ROOMS, from: number, to: number, weekday?: number) {
  let hours = 0;
  for (let t = from; t < to; t += DAY) {
    const wd = istWeekday(new Date(t));
    if (weekday && wd !== weekday) continue;
    for (const r of rooms) if (r.days.includes(wd)) hours += (hm(r.close) - hm(r.open)) / 60;
  }
  return hours;
}
const hoursOf = (h: SeedRequest) => (Date.parse(h.end) - Date.parse(h.start)) / 3600_000;
const used = (h: SeedRequest) => h.status === "completed";
const held = (h: SeedRequest) => h.status === "completed" || h.status === "auto_released";

function core(f: DashboardFilters) {
  const { rooms, rows, from, to } = scope(f);
  const open = openHours(rooms, from, to);
  const occupancyPct = open ? (100 * rows.filter(used).reduce((s, h) => s + hoursOf(h), 0)) / open : 0;
  const ghosts = rows.filter((h) => h.status === "auto_released").length;
  const ghostRatePct = rows.filter(held).length ? (100 * ghosts) / rows.filter(held).length : 0;
  const unmet = rows.filter((h) => h.unplacedReason).length;
  // Building-hours with nothing booked while the building was open — AC and lights that could be off.
  let idleBuildingHours = 0;
  for (const b of BUILDINGS) {
    const inB = rooms.filter((r) => r.building === b.code);
    if (!inB.length) continue;
    const codes = new Set(inB.map((r) => r.code));
    const busy = rows.filter((h) => held(h) && h.roomCode && codes.has(h.roomCode));
    for (let t = from; t < to; t += DAY) {
      const day = istDate(new Date(t));
      if (!inB.some((r) => r.days.includes(istWeekday(new Date(t))))) continue;
      for (const hour of HOURS) {
        const slot = hour * 60;
        if (!busy.some((h) => istDate(h.start) === day && istMinutes(h.start) < slot + 60 && istMinutes(h.end) > slot)) idleBuildingHours++;
      }
    }
  }
  return { rooms, rows, from, to, occupancyPct, ghostRatePct, unmet, idleBuildingHours };
}

export function metrics(f: DashboardFilters): DashboardMetrics {
  const c = core(f);
  const span = c.to - c.from;
  const prevF = { ...f, from: new Date(c.from - span).toISOString(), to: f.from };
  const prev = core(prevF);
  const previousAvailable = prev.rows.length > 20;

  const byType = (["lab", "classroom", "seminar_hall", "meeting_room", "auditorium"] as RoomType[])
    .map((type) => {
      const rooms = c.rooms.filter((r) => r.type === type);
      const codes = new Set(rooms.map((r) => r.code));
      const open = openHours(rooms, c.from, c.to);
      const hrs = c.rows.filter((h) => used(h) && h.roomCode && codes.has(h.roomCode)).reduce((s, h) => s + hoursOf(h), 0);
      return { type, rooms: rooms.length, occupancyPct: open ? (100 * hrs) / open : 0 };
    })
    .filter((t) => t.rooms > 0);

  // Share of room-slots booked, per weekday × hour: bookings overlapping that hour ÷ (days × rooms open).
  const cells = DAYS.map((wd) => {
    let days = 0;
    for (let t = c.from; t < c.to; t += DAY) if (istWeekday(new Date(t)) === wd) days++;
    return HOURS.map((hour) => {
      const openRooms = c.rooms.filter((r) => r.days.includes(wd) && hm(r.open) <= hour * 60 && hm(r.close) >= hour * 60 + 60).length;
      const booked = c.rows.filter(
        (h) => held(h) && istWeekday(h.start) === wd && istMinutes(h.start) < hour * 60 + 60 && istMinutes(h.end) > hour * 60,
      ).length;
      return days && openRooms ? Math.min(1, booked / (days * openRooms)) : 0;
    });
  });

  const kindOf = (key: string) => USERS.find((u) => u.key === key)?.kind ?? "faculty";
  const ghostGroup = (label: string, pick: (h: SeedRequest) => boolean) => {
    const g = c.rows.filter((h) => held(h) && pick(h));
    const n = g.filter((h) => h.status === "auto_released").length;
    return { label, count: n, ratePct: g.length ? (100 * n) / g.length : 0 };
  };
  const roomGhosts = new Map<string, number>();
  for (const h of c.rows) if (h.status === "auto_released" && h.roomCode) roomGhosts.set(h.roomCode, (roomGhosts.get(h.roomCode) ?? 0) + 1);

  const unmetRows = c.rows.filter((h) => h.unplacedReason);
  const underused = c.rooms
    .map((r) => {
      const open = openHours([r], c.from, c.to);
      const hrs = c.rows.filter((h) => used(h) && h.roomCode === r.code).reduce((s, h) => s + hoursOf(h), 0);
      return { roomId: roomId(r.code), code: r.code, name: r.name, type: r.type, occupancyPct: open ? (100 * hrs) / open : 0 };
    })
    .sort((a, b) => a.occupancyPct - b.occupancyPct)
    .slice(0, 6);

  return {
    summary: {
      occupancyPct: c.occupancyPct,
      ghostRatePct: c.ghostRatePct,
      unmet: c.unmet,
      idleBuildingHours: c.idleBuildingHours,
      bookings: c.rows.filter(held).length,
      previous: previousAvailable
        ? { occupancyPct: prev.occupancyPct, ghostRatePct: prev.ghostRatePct, unmet: prev.unmet, idleBuildingHours: prev.idleBuildingHours }
        : { occupancyPct: c.occupancyPct, ghostRatePct: c.ghostRatePct, unmet: c.unmet, idleBuildingHours: c.idleBuildingHours },
      byType,
    },
    heatmap: { days: DAYS, hours: HOURS, cells },
    ghost: {
      ratePct: c.ghostRatePct,
      byKind: [
        ghostGroup("Clubs", (h) => kindOf(h.requesterKey) === "club"),
        ghostGroup("Students", (h) => kindOf(h.requesterKey) === "student"),
        ghostGroup("Departments", (h) => kindOf(h.requesterKey) === "department"),
        ghostGroup("Faculty", (h) => kindOf(h.requesterKey) === "faculty"),
      ],
      byTime: [
        ghostGroup("Before noon", (h) => istMinutes(h.start) < 720),
        ghostGroup("12–4 pm", (h) => istMinutes(h.start) >= 720 && istMinutes(h.start) < 960),
        ghostGroup("After 4 pm", (h) => istMinutes(h.start) >= 960),
      ],
      topRooms: [...roomGhosts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([code, count]) => ({ roomId: roomId(code), code, count })),
    },
    unmet: {
      total: unmetRows.length,
      items: unmetRows.map((h) => ({
        id: h.id,
        title: h.title,
        headcount: h.headcount,
        when: `${fmtDay(h.start)} · ${fmtRange({ start: h.start, end: h.end })}`,
        reason: h.unplacedReason!,
      })),
      byBand: [
        { label: "100–149 seats", count: unmetRows.filter((h) => h.headcount < 150).length },
        { label: "150+ seats", count: unmetRows.filter((h) => h.headcount >= 150).length },
      ],
    },
    underused: { rooms: underused },
    previousAvailable,
  };
}

/** "Ask the dashboard" without the LLM: a few questions answered straight from the numbers. */
export function ask(question: string, f: DashboardFilters): AskResponse {
  const q = question.toLowerCase();
  const m = metrics(f);
  const pct = (n: number) => `${Math.round(n)}%`;
  if (/underused|quiet|empty|idle/.test(q)) {
    const wd = DAY_NAMES.findIndex((d) => d && q.includes(d.toLowerCase()));
    const type = /lab/.test(q) ? "lab" : undefined;
    const { rooms, rows, from, to } = scope({ ...f, type });
    const ranked = rooms
      .map((r) => {
        const open = openHours([r], from, to, wd > 0 ? wd : undefined);
        const hrs = rows.filter((h) => used(h) && h.roomCode === r.code && (wd <= 0 || istWeekday(h.start) === wd)).reduce((s, h) => s + hoursOf(h), 0);
        return { label: r.code, value: open ? Math.round((100 * hrs) / open) : 0 };
      })
      .sort((a, b) => a.value - b.value)
      .slice(0, 6);
    const scopeLabel = `${type ? "labs" : "rooms"}${wd > 0 ? ` on ${DAY_NAMES[wd]}s` : ""}`;
    return {
      answer: `The quietest ${scopeLabel} are ${ranked.slice(0, 3).map((r) => r.label).join(", ")} — each booked ${pct(ranked[2]?.value ?? 0)} of open hours or less.`,
      highlights: ranked.slice(0, 3).map((r) => ({ label: r.label, value: pct(r.value) })),
      chart_tool_call_id: "underused",
      chart: { title: `Occupancy, ${scopeLabel}`, rows: ranked },
      via: "unavailable",
    };
  }
  if (/ghost|no.?show|didn.?t (show|turn)/.test(q)) {
    const worst = [...m.ghost.byTime].sort((a, b) => b.ratePct - a.ratePct)[0];
    const kind = [...m.ghost.byKind].sort((a, b) => b.ratePct - a.ratePct)[0];
    return {
      answer: `${pct(m.ghost.ratePct)} of approved bookings were never checked in. It's worst ${worst.label.toLowerCase()} (${pct(worst.ratePct)}) and for ${kind.label.toLowerCase()} (${pct(kind.ratePct)}).`,
      highlights: [
        { label: "Overall", value: pct(m.ghost.ratePct) },
        { label: worst.label, value: pct(worst.ratePct) },
        { label: kind.label, value: pct(kind.ratePct) },
      ],
      chart_tool_call_id: "ghost",
      chart: { title: "Ghost-booking rate by time of day", rows: m.ghost.byTime.map((g) => ({ label: g.label, value: Math.round(g.ratePct) })) },
      via: "unavailable",
    };
  }
  if (/unmet|couldn.?t|demand|turned away|didn.?t get/.test(q)) {
    return {
      answer: `${m.unmet.total} requests for 100+ seats couldn't be placed, all on weekday evenings when every hall with a stage was taken.`,
      highlights: m.unmet.byBand.map((b) => ({ label: b.label, value: String(b.count) })),
      chart_tool_call_id: "unmet",
      chart: { title: "Unmet requests by size", rows: m.unmet.byBand.map((b) => ({ label: b.label, value: b.count })) },
      via: "unavailable",
    };
  }
  return {
    answer: "I can answer questions about occupancy, underused rooms, ghost bookings and unmet demand. Try one of the suggestions.",
    highlights: [],
    chart_tool_call_id: null,
    chart: null,
    via: "unavailable",
  };
}
