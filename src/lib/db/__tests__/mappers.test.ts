import { describe, expect, it } from "vitest";
import { parseRange, rowToRequest } from "../mappers";

describe("parseRange", () => {
  it("normalises Postgres tstzrange text to ISO-8601", () => {
    expect(parseRange('["2026-10-07 08:20:00+00","2026-10-07 09:20:00+00")')).toEqual({
      start: "2026-10-07T08:20:00.000Z",
      end: "2026-10-07T09:20:00.000Z",
    });
  });

  it("handles non-UTC offsets and fractional seconds", () => {
    expect(parseRange('["2026-10-07 13:50:00+05:30","2026-10-07 15:00:00.5+05:30")')).toEqual({
      start: "2026-10-07T08:20:00.000Z",
      end: "2026-10-07T09:30:00.500Z",
    });
  });

  it("accepts an unquoted range as PostgREST sometimes returns", () => {
    expect(parseRange("[2026-10-07T08:20:00Z,2026-10-07T09:20:00Z)")).toEqual({
      start: "2026-10-07T08:20:00.000Z",
      end: "2026-10-07T09:20:00.000Z",
    });
  });
});

describe("rowToRequest", () => {
  it("maps a row and defaults the nullable columns", () => {
    const r = rowToRequest({
      id: "r1",
      requester_id: "u1",
      title: "Lab",
      purpose: "academic",
      priority: 3,
      headcount: 40,
      during: '["2026-10-07 08:20:00+00","2026-10-07 09:20:00+00")',
      status: "pending",
      created_at: "2026-10-07T00:00:00+00:00",
    });
    expect(r.during.start).toBe("2026-10-07T08:20:00.000Z");
    expect(r.requiredFeatures).toEqual([]);
    expect(r.roomId).toBeNull();
    expect(r.source).toBe("form");
    expect(r.minSystems).toBe(0);
  });
});
