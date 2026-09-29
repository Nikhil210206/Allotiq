import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireRole, mockListScenarios } = vi.hoisted(() => ({
  mockRequireRole: vi.fn(),
  mockListScenarios: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireRole: mockRequireRole }));
vi.mock("@/server/lab-adapter", () => ({ listLabScenarios: mockListScenarios }));

import { GET } from "./route";
import { apiError } from "@/lib/http";

describe("GET /api/lab/scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ id: "admin-1", role: "admin" });
    mockListScenarios.mockResolvedValue([{ id: "clash-8", name: "Clash", description: "Fixture", requests: [] }]);
  });

  it("returns contract-shaped scenario rows to admins", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: "clash-8", name: "Clash", description: "Fixture", requests: [] }]);
    expect(mockRequireRole).toHaveBeenCalledWith("admin");
    expect(mockListScenarios).toHaveBeenCalledTimes(1);
  });

  it("preserves authorization errors and does not read scenarios for unauthorized users", async () => {
    const denied = apiError(403, "FORBIDDEN", "Requires role: admin");
    mockRequireRole.mockRejectedValue(denied);
    const response = await GET();
    expect(response).toBe(denied);
    expect(mockListScenarios).not.toHaveBeenCalled();
  });

  it("returns a safe error if the scenario read fails", async () => {
    mockListScenarios.mockRejectedValue(new Error("private database details"));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("private database details");
  });
});
