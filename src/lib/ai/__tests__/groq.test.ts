import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { MockGroq, mockModelsList, mockCreate } = vi.hoisted(() => ({
  MockGroq: vi.fn(function MockGroqConstructor() {
    return {
      models: { list: mockModelsList },
      chat: { completions: { create: mockCreate } },
    };
  }),
  mockModelsList: vi.fn(),
  mockCreate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("groq-sdk", () => ({
  default: MockGroq,
}));

import { PARSED_REQUEST_JSON_SCHEMA } from "@/contracts/ai";

let keyCounter = 0;
let groqModule: typeof import("../groq");

const parse = () => groqModule.requestGroqStructuredParse("system", "text");
const providerFailure = (status = 500) => Object.assign(new Error("private provider detail"), { status });

describe("Groq structured parser client", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    groqModule = await import("../groq");
    vi.stubEnv("GROQ_API_KEY", `test-key-${++keyCounter}`);
    vi.stubEnv("GROQ_DISABLED", "false");
    vi.stubEnv("GROQ_MODEL_PARSE", `test-model-${keyCounter}`);
    mockModelsList.mockResolvedValue({ data: [{ id: process.env.GROQ_MODEL_PARSE }] });
    mockCreate.mockResolvedValue({ choices: [{ message: { content: '{"ok":true}' } }] });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("uses the server key, bounded client settings, and the frozen strict output schema", async () => {
    await expect(groqModule.requestGroqStructuredParse("system", "untrusted text")).resolves.toBe('{"ok":true}');
    expect(MockGroq).toHaveBeenCalledWith({ apiKey: `test-key-${keyCounter}`, timeout: 6000, maxRetries: 0 });
    const [input] = mockCreate.mock.calls[0];
    expect(input.model).toBe(`test-model-${keyCounter}`);
    expect(input.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "parsed_request", strict: true, schema: PARSED_REQUEST_JSON_SCHEMA },
    });
    expect(input.messages).toEqual([
      { role: "system", content: "system" },
      { role: "user", content: "untrusted text" },
    ]);
  });

  it("honors Retry-After and retries a rate-limited call at most twice", async () => {
    mockCreate.mockRejectedValue(Object.assign(providerFailure(429), {
      headers: new Headers({ "retry-after": "0" }),
    }));

    await expect(parse()).rejects.toThrow("Groq parsing is unavailable");
    expect(mockCreate).toHaveBeenCalledTimes(3); // initial attempt plus the contract's two retries
  });

  it("surfaces only a generic error for provider failure and respects the kill switch", async () => {
    mockCreate.mockRejectedValue(providerFailure());
    await expect(parse()).rejects.toThrow("Groq parsing is unavailable");

    vi.stubEnv("GROQ_DISABLED", "true");
    expect(groqModule.groqEnabled()).toBe(false);
    await expect(parse()).rejects.toThrow("Groq is disabled");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("does not enable Groq when the API key is absent", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    expect(groqModule.groqEnabled()).toBe(false);
    await expect(parse()).rejects.toThrow("Groq is disabled");
    expect(MockGroq).not.toHaveBeenCalled();
  });

  it("opens after three failures within 60 seconds, keeps successes from erasing failures, and closes after two minutes", async () => {
    vi.useFakeTimers();
    mockCreate
      .mockRejectedValueOnce(providerFailure())
      .mockResolvedValueOnce({ choices: [{ message: { content: "success" } }] })
      .mockRejectedValueOnce(providerFailure())
      .mockRejectedValueOnce(providerFailure())
      .mockResolvedValue({ choices: [{ message: { content: "recovered" } }] });

    await expect(parse()).rejects.toThrow("Groq parsing is unavailable");
    await expect(parse()).resolves.toBe("success");
    await expect(parse()).rejects.toThrow("Groq parsing is unavailable");
    await expect(parse()).rejects.toThrow("Groq parsing is unavailable");
    expect(mockCreate).toHaveBeenCalledTimes(4);

    await expect(parse()).rejects.toThrow("Groq circuit is open");
    expect(mockCreate).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(119_999);
    await expect(parse()).rejects.toThrow("Groq circuit is open");
    expect(mockCreate).toHaveBeenCalledTimes(4);

    await vi.advanceTimersByTimeAsync(1);
    await expect(parse()).resolves.toBe("recovered");
    expect(mockCreate).toHaveBeenCalledTimes(5);
  });

  it("expires failures outside the 60-second window", async () => {
    vi.useFakeTimers();
    mockCreate
      .mockRejectedValueOnce(providerFailure())
      .mockRejectedValueOnce(providerFailure())
      .mockResolvedValue({ choices: [{ message: { content: "available" } }] });

    await expect(parse()).rejects.toThrow("Groq parsing is unavailable");
    await vi.advanceTimersByTimeAsync(60_001);
    await expect(parse()).rejects.toThrow("Groq parsing is unavailable");
    await expect(parse()).resolves.toBe("available");
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-429 failures and stops concurrent 429 retries once the breaker opens", async () => {
    vi.useFakeTimers();
    mockCreate.mockRejectedValueOnce(providerFailure());
    await expect(parse()).rejects.toThrow("Groq parsing is unavailable");
    expect(mockCreate).toHaveBeenCalledTimes(1);

    vi.resetModules();
    groqModule = await import("../groq");
    mockCreate.mockClear();
    mockModelsList.mockClear();
    mockModelsList.mockResolvedValue({ data: [{ id: process.env.GROQ_MODEL_PARSE }] });
    mockCreate.mockRejectedValue(Object.assign(providerFailure(429), {
      headers: new Headers({ "retry-after": "0" }),
    }));

    const resultsPromise = Promise.allSettled(Array.from({ length: 5 }, () => parse()));
    await vi.advanceTimersByTimeAsync(1);
    const results = await resultsPromise;
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    // Five already-started requests may fail, but none keeps retrying after the third opens the circuit.
    expect(mockCreate).toHaveBeenCalledTimes(5);
    await expect(parse()).rejects.toThrow("Groq circuit is open");
    expect(mockCreate).toHaveBeenCalledTimes(5);
  });
});
