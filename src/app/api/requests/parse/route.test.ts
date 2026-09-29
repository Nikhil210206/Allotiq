import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireRole, mockGetNow, mockParseRequest } = vi.hoisted(() => ({
  mockRequireRole: vi.fn(),
  mockGetNow: vi.fn(),
  mockParseRequest: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireRole: mockRequireRole }));
vi.mock("@/lib/clock", () => ({ getNow: mockGetNow }));
vi.mock("@/lib/ai/parse", () => ({ parseRequest: mockParseRequest }));

import { POST } from "./route";
import { apiError } from "@/lib/http";

function request(body: unknown = { text: "Need a lab Thursday 2–4" }): Request {
  return new Request("http://localhost/api/requests/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/requests/parse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ id: "profile-1", role: "requester" });
    mockGetNow.mockResolvedValue("2026-09-29T10:00:00.000Z");
    mockParseRequest.mockResolvedValue({ parsed: { title: "Lab" }, via: "fallback" });
  });

  it("validates the body, uses business time, and returns the structured parse", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ parsed: { title: "Lab" }, via: "fallback" });
    expect(mockRequireRole).toHaveBeenCalledWith("requester", "admin");
    expect(mockParseRequest).toHaveBeenCalledWith("Need a lab Thursday 2–4", new Date("2026-09-29T10:00:00.000Z"));
  });

  it("returns BAD_REQUEST for invalid or oversized input without parsing", async () => {
    for (const body of [{ text: " " }, { text: "x".repeat(2001) }, { text: "valid", extra: true }]) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "BAD_REQUEST" });
    }
    expect(mockParseRequest).not.toHaveBeenCalled();
  });

  it("forwards the authorization response before clock or parser work", async () => {
    const denied = apiError(403, "FORBIDDEN", "Requires role: requester | admin");
    mockRequireRole.mockRejectedValue(denied);

    const response = await POST(request());

    expect(response).toBe(denied);
    expect(response.status).toBe(403);
    expect(mockGetNow).not.toHaveBeenCalled();
    expect(mockParseRequest).not.toHaveBeenCalled();
  });

  it("returns a safe service error when business time or parsing is unavailable", async () => {
    mockGetNow.mockRejectedValueOnce(new Error("clock internals"));
    const clockResponse = await POST(request());
    expect(clockResponse.status).toBe(503);
    expect(JSON.stringify(await clockResponse.json())).not.toContain("clock internals");
    expect(mockParseRequest).not.toHaveBeenCalled();

    mockParseRequest.mockRejectedValueOnce(new Error("parser internals"));
    const parseResponse = await POST(request());
    expect(parseResponse.status).toBe(500);
    expect(JSON.stringify(await parseResponse.json())).not.toContain("parser internals");
  });
});
