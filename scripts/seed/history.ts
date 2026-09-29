// ~900 past requests over 4 weeks: peaks 10–12 & 14–16, Friday dip, ~18% ghost rate, unmet 100+ seat demand.
// Owner: Nikhil · N3
//
// generateHistory() is pure and deterministic (seeded PRNG + anchor). Everything ends before the anchor
// (Wed 13:50 IST), so history never touches the demo scenarios. Placed bookings never overlap in a room,
// respect capacity, systems, features, access and opening hours — the analytics read honest data.
import type { SupabaseClient } from "@supabase/supabase-js";
import { PURPOSE_PRIORITY, type Feature, type Purpose, type RequestStatus, type RoomType } from "@/contracts/domain";
import { ROOMS, USERS, deptBuilding, ids, type SeedRoom, type SeedUser } from "./catalog";
import { addDays, createRng, hhmm, istDayOf, istIso, isoWeekday, stableId, type Day, type Rng } from "./lib";

const SEED = 20261001;
const UNMET_WINDOWS = 7;

export interface SeedRequest {
  id: string;
  requesterKey: string;
  title: string;
  purpose: Purpose;
  priority: number;
  headcount: number;
  minSystems: number;
  requiredFeatures: Feature[];
  roomType: RoomType | null;
  preferredBuilding: string | null;
  start: string;
  end: string;
  roomCode: string | null;
  status: RequestStatus;
  checkedInAt: string | null;
  decidedBy: string | null;
  unplacedReason: string | null;
  lastActor: string | null;
  lastAction: string;
  lastActionAt: string;
  createdAt: string;
}

const REQUESTERS = USERS.filter((u) => u.role === "requester");
const KIND_WEIGHT = { faculty: 1.6, club: 1, department: 1, student: 0.8 } as const;

const PURPOSES_BY_KIND: Record<NonNullable<SeedUser["kind"]>, [Purpose, number][]> = {
  faculty: [["academic", 0.72], ["exam", 0.1], ["meeting", 0.12], ["department_event", 0.06]],
  club: [["club_event", 0.9], ["meeting", 0.1]],
  department: [["department_event", 0.5], ["meeting", 0.5]],
  student: [["student_activity", 1]],
};

const TYPES_BY_PURPOSE: Record<Purpose, [RoomType, number][]> = {
  academic: [["lab", 0.5], ["classroom", 0.5]],
  exam: [["classroom", 0.8], ["lab", 0.2]],
  meeting: [["meeting_room", 0.85], ["classroom", 0.15]],
  department_event: [["seminar_hall", 0.75], ["classroom", 0.2], ["auditorium", 0.05]],
  club_event: [["seminar_hall", 0.35], ["classroom", 0.35], ["lab", 0.3]],
  student_activity: [["classroom", 0.6], ["lab", 0.2], ["meeting_room", 0.2]],
};

const DURATIONS: Record<Purpose, [number, number][]> = {
  academic: [[60, 0.45], [90, 0.25], [120, 0.3]],
  exam: [[90, 0.4], [120, 0.4], [180, 0.2]],
  meeting: [[60, 0.55], [30, 0.2], [90, 0.25]],
  department_event: [[120, 0.4], [90, 0.3], [180, 0.3]],
  club_event: [[120, 0.45], [90, 0.35], [180, 0.2]],
  student_activity: [[60, 0.5], [90, 0.3], [120, 0.2]],
};

// Relative demand per start hour: the 10–12 and 14–16 peaks.
const HOUR_BASE: Record<number, number> = {
  8: 0.5, 9: 1, 10: 1.7, 11: 1.7, 12: 0.8, 13: 0.6, 14: 1.6, 15: 1.6, 16: 0.9, 17: 0.55, 18: 0.35, 19: 0.15,
};

const COURSES: Record<string, string[]> = {
  CTECH: ["DBMS", "Operating Systems", "Compiler Design", "Web Technologies"],
  DSBS: ["Data Analytics", "Machine Learning", "Big Data Systems"],
  ECE: ["VLSI Design", "Digital Signal Processing", "Embedded Systems"],
  MECH: ["CAD/CAM", "Finite Element Analysis", "Thermal Engineering"],
  BIOTECH: ["Bioinformatics", "Genomics", "Cell Biology"],
};
const SECTIONS = ["II Year A", "II Year B", "III Year A", "III Year C", "IV Year B"];
const CLUB_EVENTS: Record<string, string[]> = {
  "coding-club": ["Weekly coding contest", "DSA workshop", "Hackathon prep"],
  "ai-club": ["ML study group", "Paper reading circle", "GenAI workshop"],
  "robotics-club": ["Bot build session", "Robotics workshop", "Line follower trials"],
  "workshop-cell": ["Soft skills workshop", "Resume clinic", "Git & GitHub workshop"],
};
const MEETINGS = ["Department review meeting", "Project review", "Faculty meeting", "Board of Studies prep"];
const DEPT_EVENTS = ["Guest lecture", "Alumni talk", "Department seminar", "Industry session"];
const STUDENT_ACTIVITIES = ["Group study", "Project team meet", "Mock interview practice"];
const WEEKDAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const istFromMs = (ms: number) => {
  const day = istDayOf(new Date(ms));
  return istIso(day, Math.floor((ms - Date.parse(istIso(day, 0))) / 60_000));
};

function titleFor(rng: Rng, user: SeedUser, purpose: Purpose, type: RoomType): string {
  const course = rng.pick(COURSES[user.dept ?? ""] ?? COURSES.CTECH);
  const section = rng.pick(SECTIONS);
  switch (purpose) {
    case "academic":
      return type === "lab" ? `${course} Lab — ${section}` : `${course} — ${section}`;
    case "exam":
      return `${course} Cycle Test — ${section}`;
    case "club_event":
      return rng.pick(CLUB_EVENTS[user.key] ?? ["Club meetup"]);
    case "meeting":
      return user.kind === "club" ? `${user.orgName} core team meeting` : rng.pick(MEETINGS);
    case "department_event":
      return rng.pick(DEPT_EVENTS);
    case "student_activity":
      return rng.pick(STUDENT_ACTIVITIES);
  }
}

function headcountFor(rng: Rng, type: RoomType): number {
  switch (type) {
    case "lab":
      return rng.weighted([[rng.int(18, 36), 0.4], [rng.int(37, 50), 0.3], [rng.int(51, 70), 0.3]]);
    case "classroom":
      return rng.chance(0.05) ? rng.int(91, 118) : rng.int(25, 90);
    case "seminar_hall":
      return rng.int(40, 150);
    case "meeting_room":
      return rng.int(4, 18);
    case "auditorium":
      return rng.int(200, 700);
  }
}

function featuresFor(rng: Rng, type: RoomType): Feature[] {
  switch (type) {
    case "lab":
      return ["computers"];
    case "classroom":
      return rng.chance(0.5) ? ["projector"] : [];
    case "seminar_hall":
      return rng.chance(0.6) ? ["projector", "mic"] : [];
    case "meeting_room":
      return rng.chance(0.35) ? ["video_conf"] : [];
    case "auditorium":
      return ["stage", "mic"];
  }
}

/** Chance an approved booking is never checked in (auto-released). Skewed to evening club slots. */
function ghostChance(user: SeedUser, purpose: Purpose, startMin: number): number {
  switch (user.kind) {
    case "club":
      return startMin >= hhmm("16:00") ? 0.52 : 0.24;
    case "student":
      return 0.3;
    case "department":
      return 0.14;
    default:
      return purpose === "academic" || purpose === "exam" ? 0.08 : 0.13;
  }
}

export function generateHistory(anchor: string): SeedRequest[] {
  const rng = createRng(SEED);
  const anchorMs = Date.parse(anchor);
  const anchorDay = istDayOf(new Date(anchorMs));
  const firstDay = addDays(anchorDay, -28);
  const busy = new Map<string, [number, number][]>(); // roomCode → occupied [startMs, endMs)
  const affinity = new Map<string, number>(); // `${userKey}|${roomCode}` → past bookings
  const out: SeedRequest[] = [];
  let seq = 0;

  const isFree = (room: SeedRoom, s: number, e: number) =>
    !(busy.get(room.code) ?? []).some(([bs, be]) => s < be && bs < e);
  const reserve = (room: SeedRoom, s: number, e: number) => {
    busy.set(room.code, [...(busy.get(room.code) ?? []), [s, e]]);
  };
  const fits = (
    room: SeedRoom,
    user: SeedUser,
    q: { type: RoomType | null; headcount: number; minSystems: number; features: Feature[] },
    day: Day,
    startMin: number,
    endMin: number,
  ) =>
    (q.type === null || room.type === q.type) &&
    room.capacity >= q.headcount &&
    room.systems >= q.minSystems &&
    q.features.every((f) => room.features.includes(f)) &&
    (room.access === "open" || room.dept === user.dept) &&
    room.days.includes(isoWeekday(day)) &&
    startMin >= hhmm(room.open) &&
    endMin <= hhmm(room.close);

  function createdBefore(day: Day): string {
    const lead = rng.weighted([[1, 0.25], [2, 0.2], [3, 0.15], [5, 0.15], [7, 0.15], [10, 0.1]] as const);
    return istIso(addDays(day, -lead), rng.int(hhmm("09:00"), hhmm("18:00")));
  }

  function push(base: Omit<SeedRequest, "id" | "priority">) {
    out.push({ id: stableId("request", `${anchor}#${seq++}`), priority: PURPOSE_PRIORITY[base.purpose], ...base });
  }

  // 1. Unmet demand: weekday evenings where every stage-equipped seminar hall big enough is already taken.
  const pastWeekdays: Day[] = [];
  for (let d = firstDay; d < anchorDay; d = addDays(d, 1)) if (isoWeekday(d) <= 5) pastWeekdays.push(d);
  for (let i = pastWeekdays.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pastWeekdays[i], pastWeekdays[j]] = [pastWeekdays[j], pastWeekdays[i]];
  }
  const unmetDays = pastWeekdays.slice(0, UNMET_WINDOWS);
  const bigEventHosts = REQUESTERS.filter((u) => u.kind === "club" || u.kind === "department");
  const blockerHosts = REQUESTERS.filter((u) => u.kind === "faculty" || u.kind === "department");

  for (const day of unmetDays.sort((a, b) => a.getTime() - b.getTime())) {
    const startMin = rng.pick([hhmm("17:00"), hhmm("17:30"), hhmm("18:00")]);
    const endMin = startMin + 120;
    const [start, end] = [istIso(day, startMin), istIso(day, endMin)];
    const [s, e] = [Date.parse(start), Date.parse(end)];
    const user = rng.pick(bigEventHosts);
    const purpose: Purpose = user.kind === "club" ? "club_event" : "department_event";
    const q = { type: "seminar_hall" as RoomType, headcount: rng.int(125, 175), minSystems: 0, features: ["stage", "mic"] as Feature[] };

    for (const room of ROOMS.filter((r) => fits(r, user, q, day, startMin, endMin) && isFree(r, s, e))) {
      const host = rng.pick(blockerHosts);
      push({
        requesterKey: host.key,
        title: rng.pick(DEPT_EVENTS),
        purpose: "department_event",
        headcount: rng.int(Math.round(room.capacity * 0.7), room.capacity),
        minSystems: 0,
        requiredFeatures: ["stage", "mic"],
        roomType: "seminar_hall",
        preferredBuilding: null,
        start,
        end,
        roomCode: room.code,
        status: "completed",
        checkedInAt: istFromMs(s - 5 * 60_000),
        decidedBy: room.approver,
        unplacedReason: null,
        lastActor: host.key,
        lastAction: "completed",
        lastActionAt: end,
        createdAt: createdBefore(day),
      });
      reserve(room, s, e);
    }
    push({
      requesterKey: user.key,
      title: purpose === "club_event" ? `${user.orgName} annual meetup` : "Department fest evening",
      purpose,
      headcount: q.headcount,
      minSystems: 0,
      requiredFeatures: q.features,
      roomType: q.type,
      preferredBuilding: null,
      start,
      end,
      roomCode: null,
      status: "expired",
      checkedInAt: null,
      decidedBy: null,
      unplacedReason: `No seminar hall with a stage for ${q.headcount} free ${WEEKDAY_NAMES[isoWeekday(day)]} ${fmt(startMin)}–${fmt(endMin)}`,
      lastActor: null,
      lastAction: "expired",
      lastActionAt: start,
      createdAt: createdBefore(day),
    });
  }

  // 2. Everyday demand.
  function attempt(day: Day): void {
    const wd = isoWeekday(day);
    const user = rng.weighted(REQUESTERS.map((u) => [u, KIND_WEIGHT[u.kind!]] as const));
    const purpose = rng.weighted(PURPOSES_BY_KIND[user.kind!]);
    const type = rng.weighted(TYPES_BY_PURPOSE[purpose]);
    const hour = rng.weighted(
      Object.entries(HOUR_BASE).map(([h, w]) => {
        const hr = Number(h);
        let weight = w;
        if (user.kind === "club") weight *= hr >= 16 ? 2.8 : hr <= 11 ? 0.3 : 1;
        if (user.kind === "student" && hr >= 16) weight *= 1.8;
        if (wd === 5 && hr >= 13) weight *= 0.4; // Friday-afternoon dip
        if (wd === 6 && hr >= 13) weight *= 0.5;
        return [hr, weight] as const;
      }),
    );
    const duration = rng.weighted(DURATIONS[purpose]);
    let startMin = hour * 60 + (rng.chance(0.3) ? 30 : 0);
    if (startMin + duration > hhmm("20:00")) startMin = hhmm("20:00") - duration;
    const endMin = startMin + duration;
    const headcount = headcountFor(rng, type);
    const q = { type, headcount, minSystems: type === "lab" ? headcount : 0, features: featuresFor(rng, type) };
    const [start, end] = [istIso(day, startMin), istIso(day, endMin)];
    const [s, e] = [Date.parse(start), Date.parse(end)];
    const title = titleFor(rng, user, purpose, type);
    const home = deptBuilding(user.dept);
    const preferredBuilding = home && rng.chance(0.3) ? home : null;
    const outcome = rng.next();
    const ghost = rng.chance(ghostChance(user, purpose, startMin));
    const createdAt = createdBefore(day);

    const candidates = ROOMS.filter((r) => fits(r, user, q, day, startMin, endMin) && isFree(r, s, e));
    if (candidates.length === 0 || e > anchorMs) return;
    const room = rng.weighted(
      candidates.map((r) => {
        const fit = (headcount / r.capacity) ** 2;
        const near = r.building === (preferredBuilding ?? home) ? 2.5 : 1;
        const habit = 1 + 0.5 * Math.min(affinity.get(`${user.key}|${r.code}`) ?? 0, 4);
        return [r, r.popularity * fit * near * habit] as const;
      }),
    );

    const common = {
      requesterKey: user.key,
      title,
      purpose,
      headcount,
      minSystems: q.minSystems,
      requiredFeatures: q.features,
      roomType: type,
      preferredBuilding,
      start,
      end,
      unplacedReason: null,
      createdAt,
    };
    if (outcome < 0.05) {
      // Booked, then cancelled before the day: the room is free again.
      const cancelledAt = Date.parse(createdAt) + (s - Date.parse(createdAt)) * rng.next() * 0.9;
      push({ ...common, roomCode: room.code, status: "cancelled", checkedInAt: null, decidedBy: room.approver,
        lastActor: user.key, lastAction: "cancelled", lastActionAt: istFromMs(cancelledAt) });
      return;
    }
    if (outcome < 0.07) {
      // Hold lapsed before the approver acted.
      push({ ...common, roomCode: null, status: "expired", checkedInAt: null, decidedBy: null,
        lastActor: null, lastAction: "expired", lastActionAt: istFromMs(Date.parse(createdAt) + 120 * 60_000) });
      return;
    }
    reserve(room, s, e);
    affinity.set(`${user.key}|${room.code}`, (affinity.get(`${user.key}|${room.code}`) ?? 0) + 1);
    if (ghost) {
      push({ ...common, roomCode: room.code, status: "auto_released", checkedInAt: null, decidedBy: room.approver,
        lastActor: null, lastAction: "auto_released", lastActionAt: istFromMs(s + 15 * 60_000) });
    } else {
      push({ ...common, roomCode: room.code, status: "completed", checkedInAt: istFromMs(s + rng.int(-10, 12) * 60_000),
        decidedBy: room.approver, lastActor: user.key, lastAction: "completed", lastActionAt: end });
    }
  }

  for (let day = firstDay; day <= anchorDay; day = addDays(day, 1)) {
    const wd = isoWeekday(day);
    if (wd === 7) continue;
    const count = wd === 6 ? rng.int(10, 14) : wd === 5 ? rng.int(36, 40) : rng.int(44, 48);
    for (let i = 0; i < count; i++) attempt(day);
  }

  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** The headline numbers the dashboard and demo script rely on. */
export function summarize(reqs: SeedRequest[]) {
  const byStatus: Partial<Record<RequestStatus, number>> = {};
  for (const r of reqs) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const used = (byStatus.completed ?? 0) + (byStatus.auto_released ?? 0);
  return {
    total: reqs.length,
    byStatus,
    ghostRate: used ? (byStatus.auto_released ?? 0) / used : 0,
    unmet: reqs.filter((r) => r.unplacedReason).length,
  };
}

export function toRow(r: SeedRequest) {
  return {
    id: r.id,
    requester_id: ids.user(r.requesterKey),
    title: r.title,
    purpose: r.purpose,
    priority: r.priority,
    headcount: r.headcount,
    min_systems: r.minSystems,
    required_features: r.requiredFeatures,
    room_type: r.roomType,
    preferred_building_id: r.preferredBuilding && ids.building(r.preferredBuilding),
    during: `[${r.start},${r.end})`,
    room_id: r.roomCode && ids.room(r.roomCode),
    status: r.status,
    checked_in_at: r.checkedInAt,
    decided_by: r.decidedBy && ids.user(r.decidedBy),
    unplaced_reason: r.unplacedReason,
    source: "seed",
    last_actor_id: r.lastActor && ids.user(r.lastActor),
    last_action: r.lastAction,
    last_action_at: r.lastActionAt,
    created_at: r.createdAt,
  };
}

export async function seedHistory(db: SupabaseClient, anchor: string): Promise<void> {
  const rows = generateHistory(anchor).map(toRow);
  for (let i = 0; i < rows.length; i += 250) {
    const { error } = await db.from("requests").insert(rows.slice(i, i + 250));
    if (error) throw new Error(`requests ${i}–${i + 250}: ${error.message}`);
  }
}
