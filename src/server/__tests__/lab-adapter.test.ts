import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseLabInterval, validateScenarioRequests } from "@/server/lab-adapter";

const request = {
  id: "11111111-1111-4111-8111-111111111111",
  requesterId: "22222222-2222-4222-8222-222222222222",
  deptId: null,
  headcount: 60,
  minSystems: 20,
  features: ["computers"],
  interval: { start: "2026-10-01T14:00:00+05:30", end: "2026-10-01T16:00:00+05:30" },
  priority: 40,
  createdAt: "2026-09-29T10:00:00+05:30",
  history: {},
  label: "DBMS Lab",
};

describe("Lab scenario validation", () => {
  it("accepts only half-open persisted request intervals", () => {
    expect(parseLabInterval('["2026-10-01 08:30:00+00","2026-10-01 09:30:00+00")')).toEqual({
      start: "2026-10-01T08:30:00.000Z",
      end: "2026-10-01T09:30:00.000Z",
    });
    expect(() => parseLabInterval('( "2026-10-01 08:30:00+00","2026-10-01 09:30:00+00"]')).toThrow(/half-open/i);
  });

  it("accepts the supported EngineRequest shape", () => {
    expect(validateScenarioRequests([request])).toEqual([request]);
  });

  it.each([
    [{ ...request, interval: { start: "not-a-date", end: "2026-10-01T16:00:00+05:30" } }],
    [{ ...request, interval: { start: "2026-10-01T16:00:00+05:30", end: "2026-10-01T14:00:00+05:30" } }],
    [{ ...request, purpose: "admin" }],
    [{ ...request, headcount: 5001 }],
    [{ ...request, roomType: "unknown" }],
    [{ ...request, roomId: "another-request" }],
  ])("rejects malformed or unsupported request data", (value) => {
    expect(() => validateScenarioRequests(value)).toThrow();
  });

  it("rejects duplicate request IDs and oversized scenarios", () => {
    expect(() => validateScenarioRequests([request, request])).toThrow(/duplicate/i);
    const oversized = Array.from({ length: 101 }, (_, index) => ({
      ...request,
      id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
    }));
    expect(() => validateScenarioRequests(oversized)).toThrow();
  });
});
