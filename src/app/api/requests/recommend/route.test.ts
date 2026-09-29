import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireRole,
  mockLoadEngineContext,
  mockLoadEngineRequestForDraft,
  mockRecommend,
  mockDbFrom,
  mockInsert,
  mockSingle,
} = vi.hoisted(() => ({
  mockRequireRole: vi.fn(),
  mockLoadEngineContext: vi.fn(),
  mockLoadEngineRequestForDraft: vi.fn(),
  mockRecommend: vi.fn(),
  mockDbFrom: vi.fn(),
  mockInsert: vi.fn(),
  mockSingle: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireRole: mockRequireRole }));
vi.mock("@/server/engine-adapter", () => ({
  loadEngineContext: mockLoadEngineContext,
  loadEngineRequestForDraft: mockLoadEngineRequestForDraft,
}));
vi.mock("@/engine/recommend", () => ({ recommend: mockRecommend }));
vi.mock("@/lib/db/server", () => ({ db: () => ({ from: mockDbFrom }) }));

import { POST } from "./route";
import { apiError } from "@/lib/http";

const draft = {
  title: "Database systems lecture",
  purpose: "academic",
  headcount: 60,
  minSystems: 10,
  requiredFeatures: ["projector"],
  roomType: "classroom",
  preferredBuildingId: null,
  during: { start: "2026-10-01T16:00:00+05:30", end: "2026-10-01T18:00:00+05:30" },
  source: "form",
  rawInput: null,
};

const result = {
  top: [{ roomId: "room-1", score: { total: 91, notes: ["Tight fit: 64 seats"] }, why: ["Tight fit: 64 seats"] }],
  whyNot: [{ roomId: "room-2", violations: [{ code: "OVERLAP", message: "Booked 16:00–18:00" }] }],
  alternatives: null,
};

function request(body: unknown = draft): Request {
  return new Request("http://localhost/api/requests/recommend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/requests/recommend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ id: "profile-1", role: "requester", departmentId: "dept-1" });
    mockLoadEngineContext.mockResolvedValue({ now: "2026-10-01T10:00:00Z" });
    mockLoadEngineRequestForDraft.mockResolvedValue({ id: "recommendation-draft" });
    mockRecommend.mockReturnValue(result);
    mockSingle.mockResolvedValue({ data: { id: "run-1" }, error: null });
    mockInsert.mockReturnValue({ select: () => ({ single: mockSingle }) });
    mockDbFrom.mockImplementation(() => ({ insert: mockInsert }));
  });

  it("returns the structured recommendation and records its engine run", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...result, engineRunId: "run-1" });
    expect(mockLoadEngineContext).toHaveBeenCalledWith(draft.during);
    expect(mockLoadEngineRequestForDraft).toHaveBeenCalledWith(draft, "profile-1", "2026-10-01T10:00:00Z");
    expect(mockDbFrom).toHaveBeenCalledWith("engine_runs");
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      kind: "recommend",
      created_at: "2026-10-01T10:00:00Z",
      input: draft,
      output: result,
    }));
  });

  it("rejects malformed request data before loading engine data", async () => {
    const response = await POST(request({ ...draft, headcount: 0 }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "BAD_REQUEST" });
    expect(mockLoadEngineContext).not.toHaveBeenCalled();
  });

  it("forwards requireRole's forbidden response for non-requester/non-admin actors before any engine or DB work", async () => {
    const authorizationResponse = apiError(403, "FORBIDDEN", "Requires role: requester | admin");
    mockRequireRole.mockRejectedValue(authorizationResponse);

    const response = await POST(request());

    expect(mockRequireRole).toHaveBeenCalledWith("requester", "admin");
    expect(response).toBe(authorizationResponse);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "FORBIDDEN",
      message: "Requires role: requester | admin",
    });
    expect(mockLoadEngineContext).not.toHaveBeenCalled();
    expect(mockLoadEngineRequestForDraft).not.toHaveBeenCalled();
    expect(mockDbFrom).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("maps adapter failures to a safe recommendation error", async () => {
    mockLoadEngineContext.mockRejectedValue(new Error("database detail"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "RECOMMENDATION_FAILED",
      message: "Couldn't generate room recommendations right now.",
    });
    expect(mockDbFrom).not.toHaveBeenCalled();
  });

  it("does not mutate request or room rows", async () => {
    await POST(request());
    expect(mockDbFrom.mock.calls.map(([table]) => table)).toEqual(["engine_runs"]);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("returns a safe error if engine run logging fails", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "database detail" } });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: "RECOMMENDATION_FAILED" });
  });
});
