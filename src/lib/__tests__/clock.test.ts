import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({ mockDb: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ db: mockDb }));

import { advanceClock, getClockState, getNow, setClockOffset } from "@/lib/clock";

function setupDb({
  data = { value: 0 },
  readError = null,
  writeError = null,
}: {
  data?: { value: unknown } | null;
  readError?: Error | null;
  writeError?: Error | null;
} = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error: readError });
  const upsert = vi.fn().mockResolvedValue({ error: writeError });
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle,
    upsert,
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  mockDb.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
  return { maybeSingle, upsert };
}

describe("virtual clock database errors", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockDb.mockReset();
  });

  it("surfaces an offset read failure from getNow", async () => {
    setupDb({ readError: new Error("database unavailable") });
    await expect(getNow()).rejects.toThrow("Unable to read the virtual clock offset");
  });

  it("surfaces an offset read failure when advancing", async () => {
    const { upsert } = setupDb({ readError: new Error("database unavailable") });
    await expect(advanceClock(15)).rejects.toThrow("Unable to read the virtual clock offset");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("surfaces failures writing an explicit offset", async () => {
    setupDb({ writeError: new Error("database unavailable") });
    await expect(setClockOffset(60_000)).rejects.toThrow("Unable to update the virtual clock offset");
  });

  it("surfaces failures writing an advanced offset", async () => {
    setupDb({ data: { value: 30_000 }, writeError: new Error("database unavailable") });
    await expect(advanceClock(1)).rejects.toThrow("Unable to update the virtual clock offset");
  });

  it("uses zero only when the settings row is absent and preserves the virtual offset", async () => {
    setupDb({ data: { value: 90_000 } });
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    await expect(getClockState()).resolves.toEqual({
      now: new Date(1_090_000).toISOString(),
      offsetMs: 90_000,
    });

    setupDb({ data: null });
    await expect(getClockState()).resolves.toEqual({
      now: new Date(1_000_000).toISOString(),
      offsetMs: 0,
    });
  });
});
