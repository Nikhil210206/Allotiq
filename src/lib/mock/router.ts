// The mock backend's "routes": same paths and contract shapes as src/app/api. The API client calls
// this only when a real endpoint answers 501. Owner: Nikhil
import type { AuditEntry, Blackout, BookingRequest, Room } from "@/contracts/domain";
import { PURPOSE_PRIORITY } from "@/contracts/domain";
import type {
  AvailabilitySlot,
  ClockResponse,
  ConflictResponse,
  DisruptionPreviewResponse,
  LabRunResponse,
  ParseResponse,
  RecommendResponse,
  RequestDetail,
  RequestDraft,
  RoomInput,
} from "@/contracts";
import type { Explanation, WeeklyInsight } from "@/contracts/ai";
import type { SolveResult } from "@/contracts/engine";
import type { AuditRow, DashboardFilters, LabReplayResponse, RequestRow } from "@/lib/api/types";
import { stableId } from "@/lib/seed/random";
import { fmtRange, istDate, istWeekday, minutesOf, toIso } from "@/lib/time";
import { ask, metrics } from "./analytics";
import { PERSONA_COOKIE, PROFILES, ROLE_OF_PERSONA, profileById, qrSecretOf, type Persona } from "./catalog";
import { alternatives, blocker, disruptionPlan, labRun, labScenarios, parse, recommend } from "./samples";
import { history, holdExpiry, me, nextId, notify, now, pastBookingsOf, reset, save, state, tick, transition } from "./state";

export interface MockResult {
  status: number;
  body: unknown;
}

const ok = (body: unknown): MockResult => ({ status: 200, body });
const fail = (status: number, error: string, message: string): MockResult => ({ status, body: { error, message } });
const ACTIVE = new Set(["pending", "approved", "checked_in"]);
const HOME = { requester: "/r/new", approver: "/approvals", admin: "/admin/dashboard" } as const;

const row = (r: BookingRequest): RequestRow => {
  const p = profileById(r.requesterId);
  return { ...r, requester: p && { fullName: p.fullName, kind: p.kind, orgName: p.orgName, departmentId: p.departmentId } };
};
const findRequest = (id: string) => state().requests.find((r) => r.id === id);

/** Requests in a room on one IST day, as grid segments (bookings, holds, blackouts, closed hours). */
function availability(room: Room, date: string): AvailabilitySlot[] {
  const s = state();
  const dayStart = toIso(date, "00:00");
  const dayEnd = toIso(date, "23:59");
  const inDay = (i: { start: string; end: string }) => i.start < dayEnd && i.end > dayStart;
  const slots: AvailabilitySlot[] = [];
  const open = room.openDays.includes(istWeekday(dayStart));
  if (!open) return [{ start: toIso(date, "08:00"), end: toIso(date, "20:00"), state: "closed", label: "Closed" }];
  if (minutesOf(room.openTime) > 8 * 60) slots.push({ start: toIso(date, "08:00"), end: toIso(date, room.openTime), state: "closed" });
  if (minutesOf(room.closeTime) < 20 * 60) slots.push({ start: toIso(date, room.closeTime), end: toIso(date, "20:00"), state: "closed" });
  for (const b of s.blackouts) if (b.roomId === room.id && inDay(b.during)) slots.push({ ...b.during, state: "blackout", label: b.reason });
  const booked = s.requests.filter((r) => r.roomId === room.id && inDay(r.during) && (ACTIVE.has(r.status) || r.status === "completed"));
  for (const r of booked)
    slots.push({ ...r.during, state: r.status === "pending" ? "held" : "booked", requestId: r.id, label: r.title });
  // Earlier today and past days: what actually happened, from the generated month.
  for (const h of history())
    if (h.roomCode === room.code && inDay({ start: h.start, end: h.end }) && (h.status === "completed" || h.status === "auto_released"))
      slots.push({ start: h.start, end: h.end, state: "booked", label: h.status === "auto_released" ? `${h.title} (no-show)` : h.title });
  return slots.sort((a, b) => a.start.localeCompare(b.start));
}

function mine(): RequestRow[] {
  const { profile } = me();
  const s = state();
  const live = s.requests.filter((r) => r.requesterId === profile.id);
  return [...live, ...pastBookingsOf(profile.id)].map(row);
}

function approvalQueue(): RequestRow[] {
  const { profile } = me();
  const s = state();
  const approverId = profile.role === "requester" ? PROFILES.find((p) => p.fullName.startsWith("Judge"))!.id : profile.id;
  return s.requests
    .filter((r) => r.status === "pending")
    .filter((r) => profile.role === "admin" || s.rooms.find((x) => x.id === r.roomId)?.approverId === approverId)
    .sort((a, b) => (a.holdExpiresAt ?? "").localeCompare(b.holdExpiresAt ?? ""))
    .map(row);
}

function createRequest(body: { draft: RequestDraft; roomId: string | null }): MockResult {
  const s = state();
  const { profile } = me();
  const { draft, roomId } = body;
  const r: BookingRequest = {
    id: nextId("request"),
    requesterId: profile.id,
    title: draft.title,
    purpose: draft.purpose,
    priority: PURPOSE_PRIORITY[draft.purpose],
    headcount: draft.headcount,
    minSystems: draft.minSystems,
    requiredFeatures: draft.requiredFeatures,
    roomType: draft.roomType,
    preferredBuildingId: draft.preferredBuildingId,
    during: draft.during,
    roomId,
    status: roomId ? "pending" : "waitlisted",
    holdExpiresAt: roomId ? holdExpiry(draft.during.start, now()) : null,
    checkedInAt: null,
    decisionReason: null,
    unplacedReason: roomId ? null : "Joined the waitlist — no room was free",
    offeredAlternatives: null,
    scoreBreakdown: null,
    source: draft.source,
    createdAt: now().toISOString(),
  };
  if (roomId) {
    const room = s.rooms.find((x) => x.id === roomId);
    if (!room) return fail(404, "NOT_FOUND", "Room not found");
    const why = blocker(room, draft, profile.departmentId);
    if (why) {
      const conflict: ConflictResponse = {
        error: "SLOT_TAKEN",
        message: `${room.code} can't take it: ${why}`,
        alternatives: alternatives(draft, profile.id, roomId),
      };
      return { status: 409, body: conflict };
    }
  }
  s.requests.push(r);
  transition(r, r.status, "created", { source: draft.source });
  const approver = s.rooms.find((x) => x.id === roomId)?.approverId;
  if (approver) notify(approver, "New request to approve", `${r.title} · ${fmtRange(r.during)}`, r.id, "approval");
  save();
  return ok(row(r));
}

function detail(id: string): MockResult {
  const s = state();
  const r = findRequest(id) ?? pastBookingsOf(me().profile.id, 50).find((x) => x.id === id);
  if (!r) return fail(404, "NOT_FOUND", "No such request");
  const timeline: AuditEntry[] = s.audit.filter((a) => a.entityId === id).sort((a, b) => a.at.localeCompare(b.at));
  if (!timeline.length)
    timeline.push({ id: 0, at: r.createdAt, actorId: r.requesterId, entity: "request", entityId: r.id, action: "created", fromStatus: null, toStatus: "pending", details: {} });
  const body: RequestDetail & { request: RequestRow } = {
    request: row(r),
    room: s.rooms.find((x) => x.id === r.roomId) ?? null,
    timeline,
  };
  return ok(body);
}

function auditSummary(a: AuditEntry): string {
  const title = String(a.details.title ?? "Request");
  const room = state().rooms.find((x) => x.id === a.details.roomId)?.code;
  const map: Record<string, string> = {
    created: a.toStatus === "waitlisted" ? `${title} joined the waitlist` : `${title} held${room ? ` in ${room}` : ""}`,
    approved: `${title} approved${room ? ` · ${room}` : ""}`,
    rejected: `${title} rejected`,
    cancelled: `${title} cancelled`,
    expired: `Hold on ${title} expired`,
    checked_in: `${title} checked in${room ? ` · ${room}` : ""}`,
    auto_released: `No-show — ${room ?? "room"} released`,
    waitlist_fill: `${title} got ${room ?? "a room"} from the waitlist`,
    rehomed: `${title} moved to ${room ?? "another room"}`,
    bumped: `${title} offered another time`,
    completed: `${title} completed`,
    accepted_offer: `${title} accepted an offer${room ? ` · ${room}` : ""}`,
  };
  return map[a.action] ?? `${title}: ${a.action.replace(/_/g, " ")}`;
}

export async function handleMock(method: string, url: string, body: unknown): Promise<MockResult> {
  const s = state();
  tick();
  const u = new URL(url, "http://mock");
  const p = u.pathname.replace(/\/$/, "");
  const q = u.searchParams;
  const seg = p.split("/").slice(2); // after /api
  const b = (body ?? {}) as Record<string, unknown>;

  // ---- clock / demo ----
  if (p === "/api/clock" && method === "GET") return ok({ now: now().toISOString(), offsetMs: s.offsetMs } satisfies ClockResponse);
  if (p === "/api/admin/clock" && method === "POST") {
    if (typeof b.advanceMin === "number") s.offsetMs += b.advanceMin * 60_000;
    if (typeof b.setTo === "string") s.offsetMs = Date.parse(b.setTo) - Date.now();
    tick();
    save();
    return ok({ now: now().toISOString(), offsetMs: s.offsetMs } satisfies ClockResponse);
  }
  if (p === "/api/admin/demo/reset" && method === "POST") {
    reset();
    return ok({ ok: true, now: now().toISOString() });
  }
  if (p === "/api/jobs/tick") {
    save();
    return ok({ ok: true });
  }
  if (p === "/api/demo/login" && method === "POST") {
    const persona = b.persona as Persona;
    document.cookie = `${PERSONA_COOKIE}=${persona}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
    return ok({ redirect: HOME[ROLE_OF_PERSONA[persona]] });
  }

  // ---- rooms ----
  if (p === "/api/rooms" && method === "GET") return ok(s.rooms);
  if (p === "/api/rooms" && method === "POST") {
    const input = b as unknown as RoomInput;
    const room: Room = { id: nextId("room"), ...input };
    s.rooms.push(room);
    save();
    return ok(room);
  }
  if (seg[0] === "rooms" && seg[1]) {
    const room = s.rooms.find((x) => x.id === seg[1]);
    if (!room) return fail(404, "NOT_FOUND", "No such room");
    if (!seg[2] && method === "GET") return ok(room);
    if (!seg[2] && method === "PATCH") {
      Object.assign(room, b);
      save();
      return ok(room);
    }
    if (seg[2] === "availability") return ok(availability(room, q.get("date") ?? istDate(now())));
    if (seg[2] === "blackouts" && method === "GET") return ok(s.blackouts.filter((x) => x.roomId === room.id));
    if (seg[2] === "blackouts" && method === "POST") {
      const bo: Blackout = { id: nextId("blackout"), roomId: room.id, during: b.during as Blackout["during"], reason: String(b.reason) };
      s.blackouts.push(bo);
      save();
      return ok(bo);
    }
    if (seg[2] === "qr") return ok({ code: room.code, k: qrSecretOf(room.id), path: `/c/${room.code}?k=${qrSecretOf(room.id)}` });
  }
  if (seg[0] === "blackouts" && seg[1] && method === "DELETE") {
    s.blackouts = s.blackouts.filter((x) => x.id !== seg[1]);
    save();
    return ok({ ok: true });
  }

  // ---- requests ----
  if (p === "/api/requests/parse") {
    const text = String(b.text ?? "");
    return ok({ parsed: parse(text), via: "fallback" } satisfies ParseResponse);
  }
  if (p === "/api/requests/recommend") {
    const res = recommend(b as unknown as RequestDraft, me().profile.id);
    return ok({ ...res, engineRunId: stableId("run", String(Date.now())) } satisfies RecommendResponse);
  }
  if (p === "/api/requests" && method === "POST") return createRequest(b as unknown as { draft: RequestDraft; roomId: string | null });
  if (p === "/api/requests" && method === "GET") return ok(mine());
  if (p === "/api/approvals") return ok(approvalQueue());
  if (seg[0] === "requests" && seg[1]) {
    if (!seg[2]) return detail(seg[1]);
    const r = findRequest(seg[1]);
    if (!r) return fail(404, "NOT_FOUND", "No such request");
    const who = me().profile;
    if (seg[2] === "cancel") {
      if (!["pending", "approved", "waitlisted", "bumped"].includes(r.status)) return fail(409, "INVALID_TRANSITION", "This booking can't be cancelled now");
      transition(r, "cancelled");
    } else if (seg[2] === "approve") {
      if (r.status !== "pending") return fail(409, "INVALID_TRANSITION", "Only pending requests can be approved");
      r.holdExpiresAt = null;
      transition(r, "approved");
      notify(r.requesterId, "Approved", `${r.title} is confirmed · ${fmtRange(r.during)}`, r.id, "success");
    } else if (seg[2] === "reject") {
      if (r.status !== "pending") return fail(409, "INVALID_TRANSITION", "Only pending requests can be rejected");
      r.decisionReason = String(b.reason ?? "");
      r.offeredAlternatives = alternatives(
        { title: r.title, purpose: r.purpose, headcount: r.headcount, minSystems: r.minSystems, requiredFeatures: r.requiredFeatures, roomType: r.roomType, preferredBuildingId: null, during: r.during, source: "form", rawInput: null },
        r.requesterId,
        r.roomId ?? undefined,
      );
      transition(r, "rejected", "rejected", { reason: r.decisionReason, by: who.fullName });
      notify(r.requesterId, "Not approved — alternatives inside", `${r.title}: ${r.decisionReason}`, r.id, "warning");
    } else if (seg[2] === "accept-offer") {
      const during = b.during as BookingRequest["during"];
      r.roomId = String(b.roomId);
      r.during = during;
      r.offeredAlternatives = null;
      r.holdExpiresAt = holdExpiry(during.start, now());
      transition(r, "pending", "accepted_offer");
    } else if (seg[2] === "bump-check") {
      return ok({ plan: null });
    } else return fail(404, "NOT_FOUND", "Unknown action");
    save();
    return detail(r.id);
  }
  if (seg[0] === "admin" && seg[1] === "requests" && seg[3] === "simulate-checkin") {
    const r = findRequest(seg[2]);
    if (!r || r.status !== "approved") return fail(409, "INVALID_TRANSITION", "Only approved bookings can be checked in");
    r.checkedInAt = now().toISOString();
    transition(r, "checked_in", "checked_in", { simulated: true });
    save();
    return detail(r.id);
  }
  if (p === "/api/checkin" && method === "POST") {
    const room = s.rooms.find((x) => x.code === b.roomCode);
    if (!room) return fail(404, "NOT_FOUND", "Unknown room code");
    if (b.k && b.k !== qrSecretOf(room.id)) return fail(403, "BAD_CODE", "This QR code isn't valid for the room");
    const t = now().getTime();
    const r = s.requests
      .filter((x) => x.roomId === room.id && x.status === "approved")
      .find((x) => t >= Date.parse(x.during.start) - 10 * 60_000 && t <= Date.parse(x.during.start) + 15 * 60_000);
    if (!r) return fail(409, "NO_BOOKING", "There's no booking to check in to right now");
    r.checkedInAt = now().toISOString();
    transition(r, "checked_in");
    notify(r.requesterId, "Checked in", `${r.title} · ${room.code}`, r.id, "success");
    save();
    return detail(r.id);
  }

  // ---- Lab / disruptions ----
  if (p === "/api/lab/scenarios") return ok(labScenarios());
  if (p === "/api/lab/run") {
    const run = labRun(String(b.scenarioId));
    const runId = stableId("lab", `${b.scenarioId}-${Date.now()}`);
    sessionStorage.setItem(`allotiq:lab-run:${runId}`, JSON.stringify(run));
    return ok({ runId, ...run } satisfies LabRunResponse);
  }
  if (p === "/api/lab/replay") {
    const saved = sessionStorage.getItem(`allotiq:lab-run:${b.runId}`);
    if (!saved) return fail(404, "LAB_RUN_NOT_FOUND", "That Lab run was not found.");
    const run = JSON.parse(saved) as { results: SolveResult[]; explanation: string };
    const engine = run.results.find((r) => r.solver === "bnb") ?? run.results[0];
    const body: LabReplayResponse = {
      runId: String(b.runId),
      baseline: engine,
      results: [engine],
      explanation: run.explanation,
      comparison: { baselineSolver: engine.solver, replaySolver: engine.solver, changes: [] },
    };
    return ok(body);
  }
  if (p === "/api/lab/apply") return ok({ ok: true, applied: 0, note: "Sandbox scenario — nothing to write" });
  if (p === "/api/disruptions/preview") {
    const plan = disruptionPlan(String(b.roomId), b.during as { start: string; end: string });
    const previewId = stableId("preview", `${b.roomId}-${Date.now()}`);
    sessionStorage.setItem(`allotiq:preview:${previewId}`, JSON.stringify({ plan, roomId: b.roomId, during: b.during, reason: b.reason }));
    const body: DisruptionPreviewResponse = { previewId, affected: plan.moves.length, plan };
    return ok(body);
  }
  if (p === "/api/disruptions/apply") {
    const raw = sessionStorage.getItem(`allotiq:preview:${String(b.previewId)}`);
    if (!raw) return fail(404, "NOT_FOUND", "Preview expired — run it again");
    const { plan, roomId, during, reason } = JSON.parse(raw) as { plan: DisruptionPreviewResponse["plan"]; roomId: string; during: Blackout["during"]; reason: string };
    s.blackouts.push({ id: nextId("blackout"), roomId, during, reason });
    const roomCode = s.rooms.find((x) => x.id === roomId)?.code;
    for (const m of plan.moves) {
      const r = findRequest(m.requestId);
      if (!r) continue;
      if (m.roomId) {
        const to = s.rooms.find((x) => x.id === m.roomId);
        r.roomId = m.roomId;
        transition(r, r.status, "rehomed", { from: roomCode, reason });
        notify(r.requesterId, "Your room changed", `${roomCode} is closed (${reason}). ${r.title} moved to ${to?.name} — same time.`, r.id, "warning");
      } else {
        r.offeredAlternatives = m.offers ?? null;
        r.roomId = null;
        transition(r, "bumped", "bumped", { reason });
        notify(r.requesterId, "Pick a new slot", `${roomCode} is closed (${reason}). We found other times for ${r.title}.`, r.id, "warning");
      }
    }
    save();
    return ok({ ok: true, summary: plan.summary });
  }

  // ---- dashboard / AI ----
  if (seg[0] === "dashboard") {
    const f: DashboardFilters = {
      from: q.get("from") ?? new Date(Date.parse(s.anchor) - 28 * 86_400_000).toISOString(),
      to: q.get("to") ?? s.anchor,
      type: (q.get("type") as DashboardFilters["type"]) ?? undefined,
      building: q.get("building") ?? undefined,
    };
    return ok(metrics(f));
  }
  if (p === "/api/ai/ask") {
    const f = { from: new Date(Date.parse(s.anchor) - 28 * 86_400_000).toISOString(), to: s.anchor };
    return ok(ask(String(b.question ?? ""), f));
  }
  if (p === "/api/ai/explain") {
    const rec = b.recommendation as { why?: string[] } | undefined;
    const why = rec?.why ?? [];
    return ok({ headline: why[0] ?? "The best fit for this request", reasons: why.slice(1, 3), tradeoff: null } satisfies Explanation);
  }
  if (p === "/api/ai/weekly-insight") {
    const m = metrics({ from: new Date(Date.parse(s.anchor) - 7 * 86_400_000).toISOString(), to: s.anchor });
    const insight: WeeklyInsight = {
      headline: `Rooms were ${Math.round(m.summary.occupancyPct)}% booked this week, with ${Math.round(m.ghost.ratePct)}% ghost bookings.`,
      bullets: [
        `Busiest: ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][m.heatmap.cells.map((r) => r.reduce((a, c) => a + c, 0)).reduce((bi, v, i, arr) => (v > arr[bi] ? i : bi), 0)]} late mornings.`,
        `${m.ghost.topRooms[0]?.code ?? "—"} had the most no-shows.`,
        `${m.underused.rooms[0]?.code ?? "—"} was the quietest room.`,
      ],
      recommendation: "Ask clubs to confirm evening bookings the day before — that's where most no-shows happen.",
    };
    return ok(insight);
  }
  if (p === "/api/ai/transcribe") return fail(501, "NOT_IMPLEMENTED", "Voice needs the Groq endpoint (Aaditya · A13)");

  // ---- notifications / audit ----
  if (p === "/api/notifications" && method === "GET") {
    const mineN = s.notifications.filter((n) => n.userId === me().profile.id);
    return ok({ items: mineN.slice(0, 30), unread: mineN.filter((n) => !n.readAt).length });
  }
  if (p === "/api/notifications/read") {
    const ids = new Set((b.ids as string[]) ?? []);
    for (const n of s.notifications) if (ids.has(n.id)) n.readAt = now().toISOString();
    save();
    return ok({ ok: true });
  }
  if (p === "/api/audit") {
    const entityId = q.get("entityId");
    const rows: AuditRow[] = s.audit
      .filter((a) => !entityId || a.entityId === entityId)
      .slice(0, 120)
      .map((a) => ({ ...a, summary: auditSummary(a) }));
    return ok(rows);
  }

  return fail(501, "NOT_IMPLEMENTED", `No mock for ${method} ${p}`);
}

