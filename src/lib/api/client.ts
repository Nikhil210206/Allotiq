// The only way screens talk to the backend. Each call hits the real /api route; while that route
// still answers 501 NOT_IMPLEMENTED, the in-browser mock answers instead (same contract shapes).
// Owner: Nikhil
import type { AppNotification, Blackout, Interval, Room } from "@/contracts/domain";
import type {
  AskResponse,
  AvailabilitySlot,
  ClockResponse,
  ConflictResponse,
  DisruptionPreviewResponse,
  Explanation,
  LabRunResponse,
  ParseResponse,
  Recommendation,
  RecommendResponse,
  RequestDetail,
  RequestDraft,
  RoomInput,
  WeeklyInsight,
} from "@/contracts";
import type { AuditRow, DashboardFilters, DashboardMetrics, LabReplayResponse, LabScenario, RequestRow } from "./types";

export const DATA_EVENT = "allotiq:data";
/** Fired after each real AI response: Groq answered (online) or a built-in fallback did. */
export const AI_EVENT = "allotiq:ai";
export interface AiStatusDetail {
  online: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: { error?: string; message?: string } & Record<string, unknown>,
  ) {
    super(body?.message ?? `Request failed (${status})`);
  }
  /** 409 SLOT_TAKEN comes with alternatives — never a bare error. */
  get conflict(): ConflictResponse | null {
    return this.status === 409 && this.body?.error === "SLOT_TAKEN" ? (this.body as unknown as ConflictResponse) : null;
  }
}

let mockUsed = false;
/** True once any screen data came from the mock (shown as a small "sample data" note). */
export const usingMock = () => mockUsed;

// Routes that answered 501 recently go straight to the mock for a minute (no wasted round trip,
// no console noise from polling). Ids in paths are collapsed so one route = one entry.
const notBuilt = new Map<string, number>();
const routeKey = (method: string, path: string) =>
  `${method} ${path.split("?")[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ":id").replace(/\/c\/[^/]+/, "/c/:code")}`;

async function mock<T>(method: string, path: string, body?: unknown): Promise<T> {
  mockUsed = true;
  const { handleMock } = await import("@/lib/mock/router");
  const out = await handleMock(method, path, body);
  if (out.status >= 400) throw new ApiError(out.status, out.body as ApiError["body"]);
  if (method !== "GET") window.dispatchEvent(new Event(DATA_EVENT));
  return out.body as T;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = routeKey(method, path);
  if ((notBuilt.get(key) ?? 0) > Date.now()) return mock<T>(method, path, body);
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, { error: "NETWORK", message: "Can't reach the server — check your connection." });
  }

  if (res.status === 501) {
    notBuilt.set(key, Date.now() + 60_000);
    return mock<T>(method, path, body);
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json);
  // AI answers say who produced them; the shell's AI chip follows the latest one.
  if (json && typeof json === "object" && "via" in json && typeof json.via === "string")
    window.dispatchEvent(new CustomEvent<AiStatusDetail>(AI_EVENT, { detail: { online: json.via === "groq" } }));
  if (method !== "GET") window.dispatchEvent(new Event(DATA_EVENT));
  return json as T;
}

const get = <T>(path: string) => call<T>("GET", path);
const post = <T>(path: string, body: unknown = {}) => call<T>("POST", path, body);
const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(o).filter((e): e is [string, string] => !!e[1]));
  return p.size ? `?${p}` : "";
};

export const api = {
  clock: {
    get: () => get<ClockResponse>("/api/clock"),
    advance: (advanceMin: number) => post<ClockResponse>("/api/admin/clock", { advanceMin }),
    set: (setTo: string) => post<ClockResponse>("/api/admin/clock", { setTo }),
  },
  demo: {
    login: (persona: string) => post<{ redirect: string }>("/api/demo/login", { persona }),
    reset: () => post<{ ok: true }>("/api/admin/demo/reset"),
    tick: () => post<{ ok: true }>("/api/jobs/tick"),
    simulateCheckin: (id: string) => post<RequestDetail>(`/api/admin/requests/${id}/simulate-checkin`),
  },
  rooms: {
    list: () => get<Room[]>("/api/rooms"),
    get: (id: string) => get<Room>(`/api/rooms/${id}`),
    create: (input: RoomInput) => post<Room>("/api/rooms", input),
    update: (id: string, patch: Partial<RoomInput>) => call<Room>("PATCH", `/api/rooms/${id}`, patch),
    availability: (id: string, date: string) => get<AvailabilitySlot[]>(`/api/rooms/${id}/availability?date=${date}`),
    blackouts: (id: string) => get<Blackout[]>(`/api/rooms/${id}/blackouts`),
    addBlackout: (id: string, during: Interval, reason: string) => post<Blackout>(`/api/rooms/${id}/blackouts`, { during, reason }),
    removeBlackout: (blackoutId: string) => call<{ ok: true }>("DELETE", `/api/blackouts/${blackoutId}`),
    qr: (id: string) => get<{ code: string; k: string; path: string }>(`/api/rooms/${id}/qr`),
  },
  requests: {
    parse: (text: string) => post<ParseResponse>("/api/requests/parse", { text }),
    recommend: (draft: RequestDraft) => post<RecommendResponse>("/api/requests/recommend", draft),
    create: (draft: RequestDraft, roomId: string | null) => post<RequestRow>("/api/requests", { draft, roomId }),
    mine: () => get<RequestRow[]>("/api/requests?mine=1"),
    get: (id: string) => get<RequestDetail & { request: RequestRow }>(`/api/requests/${id}`),
    cancel: (id: string) => post<RequestDetail>(`/api/requests/${id}/cancel`),
    acceptOffer: (id: string, roomId: string, during: Interval) =>
      post<RequestDetail>(`/api/requests/${id}/accept-offer`, { roomId, during }),
    approve: (id: string) => post<RequestDetail>(`/api/requests/${id}/approve`),
    reject: (id: string, reason: string) => post<RequestDetail>(`/api/requests/${id}/reject`, { reason }),
  },
  approvals: () => get<RequestRow[]>("/api/approvals"),
  checkin: (roomCode: string, k: string) => post<RequestDetail>("/api/checkin", { roomCode, k }),
  lab: {
    scenarios: () => get<LabScenario[]>("/api/lab/scenarios"),
    run: (scenarioId: string) => post<LabRunResponse>("/api/lab/run", { scenarioId, solvers: ["fcfs", "bnb"] }),
    apply: (runId: string) => post<{ ok: true }>("/api/lab/apply", { runId }),
    /** Re-solve the recorded run with the engine alone; no changes = the plan is reproducible. */
    replay: (runId: string) => post<LabReplayResponse>("/api/lab/replay", { runId, solvers: ["bnb"] }),
  },
  disruptions: {
    preview: (roomId: string, during: Interval, reason: string) =>
      post<DisruptionPreviewResponse>("/api/disruptions/preview", { roomId, during, reason }),
    apply: (previewId: string) => post<{ ok: true; summary?: string }>("/api/disruptions/apply", { previewId }),
  },
  dashboard: (f: Partial<DashboardFilters>) =>
    get<DashboardMetrics>(`/api/dashboard/all${qs({ from: f.from, to: f.to, type: f.type, building: f.building })}`),
  ai: {
    ask: (question: string) => post<AskResponse>("/api/ai/ask", { question }),
    explain: (requestDraft: RequestDraft, recommendation: Recommendation) =>
      post<Explanation>("/api/ai/explain", { requestDraft, recommendation }),
    insight: () => get<WeeklyInsight>("/api/ai/weekly-insight"),
    transcribe: async (audio: Blob) => {
      const form = new FormData();
      form.append("audio", audio, "voice.webm");
      const res = await fetch("/api/ai/transcribe", { method: "POST", body: form });
      if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
      return (await res.json()) as { text: string };
    },
  },
  notifications: {
    list: () => get<{ items: AppNotification[]; unread: number }>("/api/notifications"),
    read: (ids: string[]) => post<{ ok: true }>("/api/notifications/read", { ids }),
  },
  audit: (entityId?: string) => get<AuditRow[]>(`/api/audit${qs({ entityId })}`),
};
