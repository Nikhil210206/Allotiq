// In-browser mock backend state (localStorage). Stands in for the API while endpoints return 501.
// It stores sample bookings and applies simple status changes — no allocation logic lives here.
// Owner: Nikhil
import type { AppNotification, AuditEntry, Blackout, BookingRequest, RequestStatus, Room } from "@/contracts/domain";
import { PURPOSE_PRIORITY } from "@/contracts/domain";
import { generateHistory } from "@/lib/seed/history";
import { resolveAnchor, stableId } from "@/lib/seed/random";
import { addDaysIso, istDate, toIso } from "@/lib/time";
import { PERSONA_COOKIE, personaProfile, roomId, seedRooms, userId, type Persona } from "./catalog";

const KEY = "allotiq:mock:v1";
export const MOCK_EVENT = "allotiq:data";

export interface MockState {
  anchor: string;
  offsetMs: number;
  rooms: Room[];
  requests: BookingRequest[];
  audit: AuditEntry[];
  notifications: AppNotification[];
  blackouts: Blackout[];
  seq: number;
}

let cache: MockState | null = null;

export function state(): MockState {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) cache = JSON.parse(raw) as MockState;
  } catch {
    // private mode / blocked storage: fall through to a fresh state
  }
  if (!cache) cache = fresh();
  return cache;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // storage full or blocked — the in-memory state still works for this tab
  }
  window.dispatchEvent(new Event(MOCK_EVENT));
}

export function reset() {
  cache = fresh();
  save();
}

// Another tab changed the mock: drop our copy so the next read picks it up.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      cache = null;
      window.dispatchEvent(new Event(MOCK_EVENT));
    }
  });
}

export const now = () => new Date(Date.now() + state().offsetMs);
export const nextId = (kind: string) => stableId(kind, `${Date.now()}-${++state().seq}`);

export function me() {
  const match = document.cookie.match(new RegExp(`${PERSONA_COOKIE}=(\\w+)`));
  const persona = (match?.[1] as Persona | undefined) ?? "faculty";
  return { persona, profile: personaProfile(persona) };
}

// ---------- writes ----------

export function audit(r: BookingRequest, action: string, from: RequestStatus | null, details: Record<string, unknown> = {}) {
  const s = state();
  s.audit.unshift({
    id: ++s.seq,
    at: now().toISOString(),
    actorId: me().profile.id,
    entity: "request",
    entityId: r.id,
    action,
    fromStatus: from,
    toStatus: r.status,
    details: { title: r.title, roomId: r.roomId, ...details },
  });
  s.audit = s.audit.slice(0, 400);
}

export function notify(userIdOf: string, title: string, body: string, requestId: string | null = null, kind = "info") {
  state().notifications.unshift({
    id: nextId("notification"),
    userId: userIdOf,
    kind,
    title,
    body,
    requestId,
    createdAt: now().toISOString(),
    readAt: null,
  });
}

export function transition(r: BookingRequest, to: RequestStatus, action: string = to, details?: Record<string, unknown>) {
  const from = r.status;
  r.status = to;
  audit(r, action, from, details);
}

/** Hold rule from the plan: max(now + 10 min, min(now + 120 min, start − 30 min)). */
export function holdExpiry(startIso: string, at: Date) {
  const t = at.getTime();
  return new Date(Math.max(t + 10 * 60_000, Math.min(t + 120 * 60_000, Date.parse(startIso) - 30 * 60_000))).toISOString();
}

/** The minute job: expire holds, auto-release no-shows (then refill from the waitlist), complete. */
// Background sample bookings behave like people turning up (checked in at their start); only the
// scripted no-show and bookings made in the app can go unused — so a time jump stays readable.
const NO_SHOW_ID = stableId("mock-request", "noshow");
const showsUp = (r: BookingRequest) => r.source === "seed" && r.id !== NO_SHOW_ID;

export function tick() {
  const s = state();
  const t = now().getTime();
  for (const r of s.requests) {
    const start = Date.parse(r.during.start);
    const end = Date.parse(r.during.end);
    if (r.status === "approved" && showsUp(r) && start <= t && end > t) {
      r.checkedInAt = r.during.start; // quietly: background traffic stays out of the audit feed
      r.status = "checked_in";
    } else if (r.status === "pending" && r.holdExpiresAt && Date.parse(r.holdExpiresAt) <= t) {
      transition(r, "expired");
      notify(r.requesterId, "Your hold expired", `${r.title} wasn't approved in time.`, r.id);
    } else if (r.status === "approved" && start + 15 * 60_000 <= t && end > t) {
      transition(r, "auto_released", "auto_released", { reason: "No check-in within 15 minutes" });
      notify(r.requesterId, "Booking released", `Nobody checked in to ${r.title}, so the room was freed.`, r.id);
      const fill = s.requests.find(
        (w) =>
          w.status === "waitlisted" &&
          Date.parse(w.during.start) >= t - 5 * 60_000 &&
          Date.parse(w.during.end) <= end &&
          (!w.roomType || w.roomType === s.rooms.find((x) => x.id === r.roomId)?.type),
      );
      if (fill) {
        fill.roomId = r.roomId;
        transition(fill, "approved", "waitlist_fill");
        notify(fill.requesterId, "A room opened up", `${fill.title} is confirmed — the room was freed by a no-show.`, fill.id, "success");
      }
    } else if ((r.status === "approved" || r.status === "checked_in") && end <= t) {
      if (showsUp(r)) r.status = "completed";
      else transition(r, "completed");
    } else if (r.status === "waitlisted" && start <= t) {
      transition(r, "expired");
    }
  }
}

// ---------- initial sample data (relative to the demo anchor, Wed 13:50 IST) ----------

type Fixture = {
  key: string;
  who: string;
  title: string;
  purpose: BookingRequest["purpose"];
  headcount: number;
  minSystems?: number;
  features?: BookingRequest["requiredFeatures"];
  type: BookingRequest["roomType"];
  day: number;
  from: string;
  to: string;
  room: string | null;
  status: RequestStatus;
};

// Scenes from the demo script: no-show + waitlist (Wed), disruption at UB Seminar Hall (Thu), the "dbms"
// request's competition (Thu 14–16), the judge's approval queue, and Dr. Priya's own bookings.
const FIXTURES: Fixture[] = [
  { key: "noshow", who: "coding-club", title: "Weekly coding contest", purpose: "club_event", headcount: 36, minSystems: 36, type: "lab", day: 0, from: "14:00", to: "15:30", room: "TP-402", status: "approved" },
  { key: "waitlist", who: "robotics-club", title: "Bot build session", purpose: "club_event", headcount: 30, minSystems: 30, type: "lab", day: 0, from: "14:30", to: "15:30", room: null, status: "waitlisted" },
  { key: "d1", who: "priya", title: "Guest lecture: Cloud at scale", purpose: "department_event", headcount: 120, features: ["projector", "mic"], type: "seminar_hall", day: 1, from: "09:00", to: "11:00", room: "UB-SEM", status: "approved" },
  { key: "d2", who: "ctech-office", title: "Alumni talk", purpose: "department_event", headcount: 90, features: ["mic"], type: "seminar_hall", day: 1, from: "11:30", to: "13:00", room: "UB-SEM", status: "approved" },
  { key: "d3", who: "workshop-cell", title: "Resume clinic", purpose: "club_event", headcount: 70, type: "seminar_hall", day: 1, from: "14:00", to: "16:00", room: "UB-SEM", status: "approved" },
  { key: "d4", who: "ai-club", title: "GenAI workshop", purpose: "club_event", headcount: 140, features: ["stage", "mic"], type: "seminar_hall", day: 1, from: "16:00", to: "18:00", room: "UB-SEM", status: "approved" },
  { key: "tpsem", who: "arun", title: "Department seminar", purpose: "department_event", headcount: 150, features: ["stage"], type: "seminar_hall", day: 1, from: "16:00", to: "18:00", room: "TP-SEM", status: "approved" },
  { key: "ub210", who: "meena", title: "Web Technologies Lab — II Year A", purpose: "academic", headcount: 60, minSystems: 60, type: "lab", day: 1, from: "14:00", to: "16:00", room: "UB-210", status: "approved" },
  { key: "bel104", who: "karthik", title: "CAD/CAM Lab — III Year C", purpose: "academic", headcount: 58, minSystems: 58, type: "lab", day: 1, from: "14:00", to: "16:00", room: "BEL-104", status: "approved" },
  { key: "q1", who: "arun", title: "Data Analytics Lab — III Year A", purpose: "academic", headcount: 64, minSystems: 64, type: "lab", day: 1, from: "10:00", to: "12:00", room: "TP-501", status: "pending" },
  { key: "q2", who: "ai-club", title: "ML study group", purpose: "club_event", headcount: 40, minSystems: 40, type: "lab", day: 1, from: "17:00", to: "19:00", room: "TP-601", status: "pending" },
  { key: "q3", who: "rahul", title: "Project team meet", purpose: "student_activity", headcount: 24, minSystems: 20, type: "lab", day: 2, from: "15:00", to: "16:00", room: "TP-402", status: "pending" },
  { key: "p1", who: "priya", title: "Compiler Design Lab — III Year A", purpose: "academic", headcount: 38, minSystems: 38, type: "lab", day: 1, from: "11:00", to: "13:00", room: "TP-402", status: "pending" },
  { key: "p2", who: "priya", title: "Operating Systems — II Year B", purpose: "academic", headcount: 55, features: ["projector"], type: "classroom", day: 2, from: "10:00", to: "11:00", room: "TP-101", status: "approved" },
];

/** Rooms/windows kept clear of background bookings so the demo scenes behave. */
const KEEP_CLEAR: { room: string; day: number; from: string; to: string }[] = [
  { room: "TP-401", day: 1, from: "13:00", to: "17:00" },
  { room: "TP-501", day: 1, from: "13:00", to: "17:00" },
  { room: "HT-301", day: 1, from: "13:00", to: "17:00" },
  { room: "TP-SEM", day: 1, from: "08:00", to: "20:00" },
  { room: "HT-SEM", day: 1, from: "08:00", to: "20:00" },
  { room: "BT-SEM", day: 1, from: "08:00", to: "20:00" },
  { room: "UB-201", day: 1, from: "08:00", to: "20:00" },
  { room: "UB-SEM", day: 1, from: "08:00", to: "20:00" },
  { room: "BEL-SEM", day: 1, from: "08:00", to: "20:00" },
  { room: "TP-402", day: 0, from: "13:00", to: "16:00" },
];

function fresh(): MockState {
  const anchor = resolveAnchor(new Date(), "");
  const day0 = istDate(anchor);
  const at = (day: number, hhmm: string) => toIso(addDaysIso(day0, day), hhmm);
  const created = new Date(Date.parse(anchor) - 3 * 3600_000).toISOString();
  const s: MockState = {
    anchor,
    offsetMs: Date.parse(anchor) - Date.now(),
    rooms: seedRooms(),
    requests: [],
    audit: [],
    notifications: [],
    blackouts: [],
    seq: 1000,
  };

  const make = (f: Omit<Fixture, "key"> & { id: string; createdAt: string }): BookingRequest => {
    const during = { start: at(f.day, f.from), end: at(f.day, f.to) };
    return {
      id: f.id,
      requesterId: userId(f.who),
      title: f.title,
      purpose: f.purpose,
      priority: PURPOSE_PRIORITY[f.purpose],
      headcount: f.headcount,
      minSystems: f.minSystems ?? 0,
      requiredFeatures: f.features ?? [],
      roomType: f.type,
      preferredBuildingId: null,
      during,
      roomId: f.room ? roomId(f.room) : null,
      status: f.status,
      holdExpiresAt: f.status === "pending" ? holdExpiry(during.start, new Date(Date.parse(anchor) - 20 * 60_000)) : null,
      checkedInAt: null,
      decisionReason: null,
      unplacedReason: null,
      offeredAlternatives: null,
      scoreBreakdown: null,
      source: "seed",
      createdAt: f.createdAt,
    };
  };

  for (const f of FIXTURES) s.requests.push(make({ ...f, id: stableId("mock-request", f.key), createdAt: created }));

  // Background bookings for the rest of the demo week: a later slice of the same history generator.
  const clear = KEEP_CLEAR.map((k) => ({ room: roomId(k.room), start: Date.parse(at(k.day, k.from)), end: Date.parse(at(k.day, k.to)) }));
  const busy = s.requests.filter((r) => r.roomId);
  const later = generateHistory(toIso(addDaysIso(day0, 4), "08:00"));
  let n = 0;
  for (const h of later) {
    const start = Date.parse(h.start);
    const end = Date.parse(h.end);
    if (start < Date.parse(anchor) || !h.roomCode || (h.status !== "completed" && h.status !== "auto_released")) continue;
    const room = roomId(h.roomCode);
    if (clear.some((c) => c.room === room && start < c.end && c.start < end)) continue;
    if (busy.some((b) => b.roomId === room && start < Date.parse(b.during.end) && Date.parse(b.during.start) < end)) continue;
    const status: RequestStatus = ++n % 11 === 0 ? "pending" : "approved";
    const r = make({
      id: h.id,
      who: h.requesterKey,
      title: h.title,
      purpose: h.purpose,
      headcount: h.headcount,
      minSystems: h.minSystems,
      features: h.requiredFeatures,
      type: h.roomType,
      day: 0,
      from: "00:00",
      to: "00:00",
      room: h.roomCode,
      status,
      createdAt: h.createdAt,
    });
    r.during = { start: h.start, end: h.end };
    r.holdExpiresAt = status === "pending" ? holdExpiry(h.start, new Date(anchor)) : null;
    s.requests.push(r);
    busy.push(r);
  }

  for (const r of s.requests.filter((x) => FIXTURES.some((f) => stableId("mock-request", f.key) === x.id))) {
    s.audit.push({
      id: ++s.seq,
      at: created,
      actorId: r.requesterId,
      entity: "request",
      entityId: r.id,
      action: "created",
      fromStatus: null,
      toStatus: r.status === "approved" ? "pending" : r.status,
      details: { title: r.title, roomId: r.roomId },
    });
    if (r.status === "approved")
      s.audit.push({
        id: ++s.seq,
        at: new Date(Date.parse(created) + 25 * 60_000).toISOString(),
        actorId: userId("judge"),
        entity: "request",
        entityId: r.id,
        action: "approved",
        fromStatus: "pending",
        toStatus: "approved",
        details: { title: r.title, roomId: r.roomId },
      });
  }
  s.audit.sort((a, b) => b.at.localeCompare(a.at));
  return s;
}

let memo: { anchor: string; rows: ReturnType<typeof generateHistory> } | null = null;
/** The generated month before the anchor (memoised) — dashboard, past bookings and past grid days. */
export function history() {
  const anchor = state().anchor;
  if (memo?.anchor !== anchor) memo = { anchor, rows: generateHistory(anchor) };
  return memo.rows;
}

/** The requester's past bookings come from the same generated month the dashboard uses. */
export function pastBookingsOf(requesterId: string, limit = 8): BookingRequest[] {
  return history()
    .filter((h) => userId(h.requesterKey) === requesterId && h.roomCode)
    .slice(-limit)
    .reverse()
    .map((h) => ({
      id: h.id,
      requesterId,
      title: h.title,
      purpose: h.purpose,
      priority: h.priority,
      headcount: h.headcount,
      minSystems: h.minSystems,
      requiredFeatures: h.requiredFeatures,
      roomType: h.roomType,
      preferredBuildingId: null,
      during: { start: h.start, end: h.end },
      roomId: h.roomCode ? roomId(h.roomCode) : null,
      status: h.status,
      holdExpiresAt: null,
      checkedInAt: h.checkedInAt,
      decisionReason: null,
      unplacedReason: h.unplacedReason,
      offeredAlternatives: null,
      scoreBreakdown: null,
      source: "seed",
      createdAt: h.createdAt,
    }));
}
