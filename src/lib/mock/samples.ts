// Canned stand-ins for Aaditya's engine + AI endpoints (recommend, parse, Lab, disruption, ask).
// Deliberately dumb: a room filter plus fixed sample scores — the real engine replaces all of it.
// Owner: Nikhil
import type { Alternatives, Plan, RecommendResult, ScoreBreakdown, SolveResult } from "@/contracts/engine";
import { DEFAULT_WEIGHTS } from "@/contracts/engine";
import type { BookingRequest, Feature, Purpose, Room, RoomType } from "@/contracts/domain";
import { FEATURES } from "@/contracts/domain";
import type { ParsedRequest, RequestDraft } from "@/contracts";
import type { LabScenario } from "@/lib/api/types";
import { addDaysIso, fmtRange, istDate, istMinutes, istWeekday, minutesOf, toIso } from "@/lib/time";
import { BUILDING_LIST, deptShort, profileById } from "./catalog";
import { now, state } from "./state";

const ACTIVE = new Set(["pending", "approved", "checked_in"]);
const overlap = (a: { start: string; end: string }, b: { start: string; end: string }) =>
  Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);

/** Fixed sample breakdowns, best first (the demo script's 91 · 76 · 56). */
const SAMPLE_SCORES: Omit<ScoreBreakdown, "weights" | "total" | "notes" | "wastedSeats">[] = [
  { capacityFit: 0.95, featureMatch: 1, proximity: 1, scarcity: 0.72, preference: 0.8, energy: 1 },
  { capacityFit: 0.8, featureMatch: 1, proximity: 1, scarcity: 0.5, preference: 0.2, energy: 1 },
  { capacityFit: 0.86, featureMatch: 1, proximity: 0.35, scarcity: 0.6, preference: 0.1, energy: 0 },
];
const total = (p: (typeof SAMPLE_SCORES)[number]) =>
  100 *
  (DEFAULT_WEIGHTS.capacityFit * p.capacityFit +
    DEFAULT_WEIGHTS.featureMatch * p.featureMatch +
    DEFAULT_WEIGHTS.proximity * p.proximity +
    DEFAULT_WEIGHTS.scarcity * p.scarcity +
    DEFAULT_WEIGHTS.preference * p.preference +
    DEFAULT_WEIGHTS.energy * p.energy);

type Need = Pick<RequestDraft, "headcount" | "minSystems" | "requiredFeatures" | "roomType" | "during">;

/** First reason a room can't take the request, in plain words (null = it can). */
export function blocker(room: Room, need: Need, deptId: string | null, ignoreId?: string): string | null {
  if (!room.isActive) return "Out of service";
  if (need.roomType && room.type !== need.roomType) return `It's a ${room.type.replace("_", " ")}`;
  if (room.capacity < need.headcount) return `Only ${room.capacity} seats (needs ${need.headcount})`;
  if (room.systemsCount < need.minSystems) return `Only ${room.systemsCount} systems (needs ${need.minSystems})`;
  const missing = need.requiredFeatures.find((f) => !room.features.includes(f));
  if (missing) return `No ${missing.replace("_", " ")}`;
  if (room.access === "dept_only" && room.departmentId !== deptId) return `${deptShort(room.departmentId)} only`;
  const from = istMinutes(need.during.start);
  const to = istMinutes(need.during.end) || 24 * 60;
  if (!room.openDays.includes(istWeekday(need.during.start)) || from < minutesOf(room.openTime) || to > minutesOf(room.closeTime))
    return `Closed then (${room.openTime}–${room.closeTime})`;
  const s = state();
  const out = s.blackouts.find((b) => b.roomId === room.id && overlap(b.during, need.during));
  if (out) return `Maintenance: ${out.reason}`;
  const taken = s.requests.find((r) => r.id !== ignoreId && r.roomId === room.id && ACTIVE.has(r.status) && overlap(r.during, need.during));
  if (taken) return `Booked ${fmtRange(taken.during)}`;
  return null;
}

export function recommend(draft: RequestDraft, requesterId: string): RecommendResult {
  const s = state();
  const who = profileById(requesterId);
  const dept = who?.departmentId ?? null;
  const deptBuilding = s.rooms.length ? BUILDING_LIST.find((b) => b.id === deptBuildingId(dept))?.id : undefined;
  const fits = s.rooms.filter((r) => blocker(r, draft, dept) === null);
  // The requester's own building first, then the snuggest fit (so the fixed sample scores read true).
  fits.sort((a, b) => Number(b.buildingId === deptBuilding) - Number(a.buildingId === deptBuilding) || a.capacity - b.capacity);
  const top = fits.slice(0, 3).map((room, i) => {
    const parts = SAMPLE_SCORES[i];
    const wasted = room.capacity - draft.headcount;
    const building = BUILDING_LIST.find((b) => b.id === room.buildingId)?.name ?? "";
    const notes = [
      room.buildingId === deptBuilding && deptShort(dept) ? `Same building as ${deptShort(dept)}` : `In ${building}`,
      draft.minSystems > 0 ? `${room.systemsCount} systems for ${draft.headcount} people` : `${room.capacity} seats for ${draft.headcount} people`,
      wasted <= 10 ? `Snug fit — ${wasted} spare seats` : `${wasted} spare seats`,
    ];
    const score: ScoreBreakdown = { ...parts, weights: DEFAULT_WEIGHTS, total: total(parts), wastedSeats: wasted, notes };
    return { roomId: room.id, score, why: notes };
  });
  const whyNot = s.rooms
    .filter((r) => !fits.includes(r) && (!draft.roomType || r.type === draft.roomType))
    .map((r) => ({ room: r, reason: blocker(r, draft, dept) ?? "" }))
    .sort((a, b) => Math.abs(a.room.capacity - draft.headcount) - Math.abs(b.room.capacity - draft.headcount))
    .slice(0, 3)
    .map(({ room, reason }) => ({ roomId: room.id, violations: [{ code: "OVERLAP" as const, message: reason }] }));
  return { top, whyNot, alternatives: top.length ? null : alternatives(draft, requesterId) };
}

function deptBuildingId(deptId: string | null) {
  const code = deptShort(deptId);
  if (!code) return undefined;
  const map: Record<string, string> = { "C.Tech": "TP", NWC: "TP", DSBS: "TP", CINTEL: "TP", ECE: "HT", EEE: "HT", Mech: "BEL", Biotech: "BT" };
  return BUILDING_LIST.find((b) => b.code === map[code])?.id;
}

/** Never a bare "no": the same room at nearby times, and similar rooms at the same time. */
export function alternatives(draft: RequestDraft, requesterId: string, preferRoomId?: string): Alternatives {
  const s = state();
  const dept = profileById(requesterId)?.departmentId ?? null;
  const len = Date.parse(draft.during.end) - Date.parse(draft.during.start);
  const base = s.rooms.find((r) => r.id === preferRoomId) ??
    s.rooms.filter((r) => (!draft.roomType || r.type === draft.roomType) && r.capacity >= draft.headcount && r.systemsCount >= draft.minSystems).sort((a, b) => a.capacity - b.capacity)[0];
  const sameRoomOtherSlot: Alternatives["sameRoomOtherSlot"] = [];
  if (base) {
    for (const shift of [2, -2, 4, 24, 48].map((h) => h * 3600_000)) {
      const start = new Date(Date.parse(draft.during.start) + shift).toISOString();
      const during = { start, end: new Date(Date.parse(start) + len).toISOString() };
      if (Date.parse(start) > now().getTime() && blocker(base, { ...draft, during }, dept) === null) sameRoomOtherSlot.push({ roomId: base.id, interval: during });
      if (sameRoomOtherSlot.length === 3) break;
    }
  }
  const similarRoomSameSlot = s.rooms
    .filter((r) => r.id !== preferRoomId && blocker(r, { ...draft, roomType: null }, dept) === null)
    .sort((a, b) => a.capacity - b.capacity)
    .slice(0, 3)
    .map((room, i) => {
      const parts = SAMPLE_SCORES[Math.min(i + 1, 2)];
      return {
        roomId: room.id,
        score: { ...parts, weights: DEFAULT_WEIGHTS, total: total(parts), wastedSeats: room.capacity - draft.headcount, notes: [] },
        why: [`${room.capacity} seats for ${draft.headcount} people`],
      };
    });
  return { sameRoomOtherSlot, similarRoomSameSlot };
}

// ---------- parse (text → form) ----------

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const TYPE_WORDS: [RegExp, RoomType][] = [
  [/\blab\b|systems|computers|pcs\b/, "lab"],
  [/seminar|hall|guest lecture|talk/, "seminar_hall"],
  [/meeting|board|review meeting/, "meeting_room"],
  [/auditorium|fest|convocation/, "auditorium"],
  [/class|lecture|tutorial|test|exam/, "classroom"],
];
const FEATURE_WORDS: [RegExp, Feature][] = [
  [/projector/, "projector"],
  [/\bmic\b|microphone|sound/, "mic"],
  [/smart ?board/, "smart_board"],
  [/\bac\b|air.?con/, "ac"],
  [/video|zoom|teams|meet call|conference call/, "video_conf"],
  [/whiteboard/, "whiteboard"],
  [/stage/, "stage"],
  [/record/, "recording"],
];

/** A small regex parser standing in for Groq + chrono (Aaditya's /api/requests/parse). */
export function parse(text: string): ParsedRequest {
  const t = text.toLowerCase();
  const num = (re: RegExp) => {
    const m = t.match(re);
    return m ? Number(m[1]) : null;
  };
  const systems = num(/(\d{1,4})\s*(?:systems|computers|pcs|machines)/);
  let headcount = num(/(\d{1,4})\s*(?:people|persons|students|pax|seats|attendees|members)/) ?? num(/\bfor\s+(\d{2,4})\b/);
  if (headcount === null && systems !== null) headcount = systems;

  // day: a weekday name means its next occurrence; "today" / "tomorrow"
  const today = istDate(now());
  let date: string | null = null;
  if (/\btomorrow\b/.test(t)) date = addDaysIso(today, 1);
  else if (/\btoday\b/.test(t)) date = today;
  else {
    const wd = WEEKDAYS.findIndex((d) => t.includes(d) || new RegExp(`\\b${d.slice(0, 3)}\\b`).test(t));
    if (wd >= 0) {
      const cur = istWeekday(now());
      const ahead = (wd + 1 - cur + 7) % 7 || 7;
      date = addDaysIso(today, ahead);
    }
  }

  // time: "2 to 4", "2-4pm", "11am", "14:00-16:00"; bare 1–7 means PM (campus hours 08:00–20:00)
  const h24 = (h: number, m: number, ap?: string) => {
    let hh = h;
    if (ap === "pm" && hh < 12) hh += 12;
    else if (ap === "am" && hh === 12) hh = 0;
    else if (!ap && hh >= 1 && hh <= 7) hh += 12;
    return `${String(hh).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  let start: string | null = null;
  let end: string | null = null;
  const range = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-|–|till|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (range) {
    const ap = range[6] ?? range[3];
    start = h24(Number(range[1]), Number(range[2] ?? 0), range[3] ?? ap);
    end = h24(Number(range[4]), Number(range[5] ?? 0), ap);
  } else {
    const single = t.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
    if (single) {
      start = h24(Number(single[1]), Number(single[2] ?? 0), single[3]);
      end = `${String(Math.min(20, Number(start.slice(0, 2)) + 1)).padStart(2, "0")}:${start.slice(3)}`;
    }
  }

  const roomType = TYPE_WORDS.find(([re]) => re.test(t))?.[1] ?? null;
  const features = FEATURE_WORDS.filter(([re]) => re.test(t)).map(([, f]) => f).filter((f) => FEATURES.includes(f));
  const purpose: Purpose = /exam|test|viva/.test(t)
    ? "exam"
    : /club|hackathon|contest|society/.test(t)
      ? "club_event"
      : /meeting|review|board/.test(t)
        ? "meeting"
        : /guest|seminar|talk|alumni|department/.test(t)
          ? "department_event"
          : /lab|lecture|class|tutorial|course/.test(t)
            ? "academic"
            : "student_activity";
  const forPhrase = text.match(/\bfor\s+(?:the\s+|a\s+|an\s+)?([A-Za-z][\w/&+ .-]{2,60}?)\s*$/i)?.[1];
  const title = (forPhrase && !/^\d/.test(forPhrase) ? forPhrase : text.split(/\s+/).slice(0, 6).join(" ")).replace(/^\w/, (c) => c.toUpperCase());

  const missing = [
    headcount === null && "headcount",
    date === null && "date",
    start === null && "start_time",
    end === null && "end_time",
  ].filter(Boolean) as string[];
  return {
    title,
    purpose,
    headcount,
    min_systems: systems,
    date,
    start_time: start,
    end_time: end,
    required_features: features,
    room_type: roomType,
    preferred_building_code: null,
    notes: systems !== null && !/people|students|persons/.test(t) ? "Headcount taken from the number of systems" : "",
    missing_fields: missing,
    confidence: missing.length ? 0.55 : systems !== null && !/people|students/.test(t) ? 0.78 : 0.92,
  };
}

// ---------- Lab: the problem brief's fixture (FCFS 2/3 vs engine 3/3) ----------

const fixtureRoom = (id: string, code: string, capacity: number, features: Feature[], building: string): Room => ({
  id,
  code,
  name: `Room ${code}`,
  buildingId: BUILDING_LIST.find((b) => b.code === building)!.id,
  type: "seminar_hall",
  capacity,
  systemsCount: 0,
  features,
  departmentId: null,
  access: "open",
  approverId: null,
  openTime: "08:00",
  closeTime: "20:00",
  openDays: [1, 2, 3, 4, 5, 6],
  attributes: {},
  isActive: true,
});

export function labScenarios(): LabScenario[] {
  const thu = addDaysIso(istDate(state().anchor), 1);
  const slot = { start: toIso(thu, "16:00"), end: toIso(thu, "18:00") };
  const mk = (id: string, label: string, headcount: number, features: Feature[], minute: number) => ({
    id,
    requesterId: id,
    deptId: null,
    headcount,
    minSystems: 0,
    features,
    interval: slot,
    priority: 20,
    createdAt: toIso(addDaysIso(thu, -2), `10:${String(minute).padStart(2, "0")}`),
    history: {},
    label,
  });
  return [
    {
      id: "brief-3",
      name: "The brief's three rooms",
      description: "Three clubs, three rooms, Thursday 4–6 PM. First come, first served strands one of them.",
      rooms: [
        fixtureRoom("room-a", "A", 120, ["projector"], "TP"),
        fixtureRoom("room-b", "B", 60, ["projector"], "TP"),
        fixtureRoom("room-c", "C", 80, [], "TP"),
      ],
      requests: [
        mk("coding", "Coding Club", 50, [], 0),
        mk("workshop", "Workshop", 55, ["projector"], 5),
        mk("ai", "AI Club", 100, ["projector"], 10),
      ],
    },
  ];
}

export function labRun(scenarioId: string): { results: SolveResult[]; explanation: string } {
  const sc = labScenarios().find((x) => x.id === scenarioId) ?? labScenarios()[0];
  const cap = Object.fromEntries((sc.rooms ?? []).map((r) => [r.id, r.capacity]));
  const building = Object.fromEntries((sc.rooms ?? []).map((r) => [r.id, r.buildingId]));
  const head = Object.fromEntries(sc.requests.map((r) => [r.id, r.headcount]));
  const result = (solver: SolveResult["solver"], pairs: [string, string | null][], ms: number): SolveResult => {
    const placed = pairs.filter(([, room]) => room);
    return {
      solver,
      assignments: pairs.map(([requestId, roomId]) => ({ requestId, roomId, reason: roomId ? undefined : "No free room with a projector for 100" })),
      metrics: {
        placed: placed.length,
        total: pairs.length,
        priorityPlaced: 0,
        priorityTotal: 0,
        seatsWasted: placed.reduce((s, [q, r]) => s + cap[r!] - head[q], 0),
        buildingsActive: new Set(placed.map(([, r]) => building[r!])).size,
        objective: placed.length,
        ms,
        nodes: solver === "fcfs" ? 3 : 14,
      },
      timedOut: false,
      trace: pairs.map(([requestId, roomId]) =>
        roomId ? { type: "place" as const, requestId, roomId } : { type: "blocked" as const, requestId, reason: "no room" },
      ),
    };
  };
  const engine = result("bnb", [["coding", "room-c"], ["workshop", "room-b"], ["ai", "room-a"]], 3);
  // Like the real B&B, the engine's trace is the sequence of better plans it found (incumbents).
  engine.trace = [
    { type: "incumbent", objective: 2, placed: 2 },
    { type: "incumbent", objective: 3, placed: 3 },
  ];
  return {
    results: [result("fcfs", [["coding", "room-b"], ["workshop", "room-a"], ["ai", null]], 1), engine],
    explanation:
      "FCFS gave Coding Club room B first-come. It didn't need a projector, so the engine moved it to C. That freed B for the Workshop and A for AI Club.",
  };
}

// ---------- Disruption preview: re-plan everything in a room during a window ----------

export function disruptionPlan(roomIdOf: string, during: { start: string; end: string }): Plan {
  const s = state();
  const affected = s.requests.filter((r) => r.roomId === roomIdOf && ACTIVE.has(r.status) && overlap(r.during, during));
  const taken = new Set<string>();
  const moves: Plan["moves"] = [];
  const unplaced: Plan["unplaced"] = [];
  for (const r of affected) {
    if (r.status === "checked_in") continue;
    const draft = draftOf(r);
    const dept = profileById(r.requesterId)?.departmentId ?? null;
    const target = s.rooms
      .filter((room) => room.id !== roomIdOf && !taken.has(`${room.id}|${r.during.start}`) && blocker(room, draft, dept, r.id) === null)
      .sort((a, b) => a.capacity - b.capacity)[0];
    if (target) {
      taken.add(`${target.id}|${r.during.start}`);
      moves.push({ requestId: r.id, roomId: target.id, interval: r.during });
    } else {
      const offers = alternatives(draft, r.requesterId, roomIdOf);
      // The room itself is blacked out: offer the best other room at a later slot instead.
      offers.sameRoomOtherSlot = laterSlots(draft, dept, roomIdOf);
      unplaced.push({ requestId: r.id, alternatives: offers });
      moves.push({ requestId: r.id, roomId: null, interval: r.during, status: "bumped", offers });
    }
  }
  const rehomed = moves.filter((m) => m.roomId).length;
  const offered = unplaced.length;
  return {
    kind: "disruption",
    moves,
    unplaced,
    summary: `${affected.length} affected · ${rehomed} rehomed · ${offered} offered another time`,
  };
}

function laterSlots(draft: RequestDraft, dept: string | null, avoidRoomId: string) {
  const s = state();
  const len = Date.parse(draft.during.end) - Date.parse(draft.during.start);
  const out: Alternatives["sameRoomOtherSlot"] = [];
  for (const h of [2, 4, 24]) {
    const start = new Date(Date.parse(draft.during.start) + h * 3600_000).toISOString();
    const during = { start, end: new Date(Date.parse(start) + len).toISOString() };
    const room = s.rooms
      .filter((r) => r.id !== avoidRoomId && blocker(r, { ...draft, during }, dept) === null)
      .sort((a, b) => a.capacity - b.capacity)[0];
    if (room) out.push({ roomId: room.id, interval: during });
    if (out.length === 2) break;
  }
  return out;
}

export function draftOf(r: BookingRequest): RequestDraft {
  return {
    title: r.title,
    purpose: r.purpose,
    headcount: r.headcount,
    minSystems: r.minSystems,
    requiredFeatures: r.requiredFeatures,
    roomType: r.roomType,
    preferredBuildingId: r.preferredBuildingId,
    during: r.during,
    source: "form",
    rawInput: null,
  };
}
