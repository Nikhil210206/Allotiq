import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireRole, mockTranscribe, mockDb } = vi.hoisted(() => ({
  mockRequireRole: vi.fn(),
  mockTranscribe: vi.fn(),
  mockDb: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireRole: mockRequireRole }));
vi.mock("@/lib/ai/transcribe", () => ({ transcribe: mockTranscribe }));
vi.mock("@/lib/db/server", () => ({ db: mockDb }));

import { POST } from "./route";

function makeAudioRequest(options: {
  audio?: Blob | string;
  hasAudio?: boolean;
  contentType?: string;
  notFormData?: boolean;
} = {}): Request {
  if (options.notFormData) {
    return new Request("http://localhost/api/ai/transcribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ audio: "not-a-file" }),
    });
  }

  const formData = new FormData();
  if (options.hasAudio !== false) {
    const audio = options.audio ?? new Blob(["audio-bytes"], { type: "audio/webm" });
    if (typeof audio === "string") {
      formData.append("audio", audio);
    } else {
      formData.append("audio", audio, "test.webm");
    }
  }

  return new Request("http://localhost/api/ai/transcribe", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/ai/transcribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ id: "user-1", role: "requester" });
    mockTranscribe.mockResolvedValue("Need a lab for 30 students next Tuesday");
  });

  it("rejects unauthorized requests with 401 when not signed in", async () => {
    const denied = new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401 });
    mockRequireRole.mockRejectedValue(denied);

    const response = await POST(makeAudioRequest());
    expect(response.status).toBe(401);
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(mockDb).not.toHaveBeenCalled();
  });

  it("rejects forbidden requests with 403 when lacking required roles", async () => {
    const denied = new Response(JSON.stringify({ error: "FORBIDDEN" }), { status: 403 });
    mockRequireRole.mockRejectedValue(denied);

    const response = await POST(makeAudioRequest());
    expect(response.status).toBe(403);
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(mockDb).not.toHaveBeenCalled();
  });

  it("successfully processes valid audio for authorized requester/admin", async () => {
    const audioBlob = new Blob(["test-audio-content"], { type: "audio/webm" });
    const response = await POST(makeAudioRequest({ audio: audioBlob }));

    expect(response.status).toBe(200);
    expect(mockRequireRole).toHaveBeenCalledWith("requester", "admin");
    expect(mockTranscribe).toHaveBeenCalledTimes(1);

    const passedAudio = mockTranscribe.mock.calls[0][0];
    expect(passedAudio).toBeInstanceOf(Blob);

    const data = await response.json();
    expect(data).toEqual({ text: "Need a lab for 30 students next Tuesday" });
    expect(mockDb).not.toHaveBeenCalled();
  });

  it("rejects missing audio field with 400 BAD_REQUEST", async () => {
    const response = await POST(makeAudioRequest({ hasAudio: false }));
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data).toMatchObject({ error: "BAD_REQUEST" });
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(mockDb).not.toHaveBeenCalled();
  });

  it("rejects invalid/non-file audio field with 400 BAD_REQUEST", async () => {
    const response = await POST(makeAudioRequest({ audio: "plain string text instead of file" }));
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data).toMatchObject({ error: "BAD_REQUEST" });
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(mockDb).not.toHaveBeenCalled();
  });

  it("rejects non-multipart requests with 400 BAD_REQUEST", async () => {
    const response = await POST(makeAudioRequest({ notFormData: true }));
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data).toMatchObject({ error: "BAD_REQUEST" });
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(mockDb).not.toHaveBeenCalled();
  });

  it("rejects empty audio files with 400 BAD_REQUEST", async () => {
    const emptyBlob = new Blob([], { type: "audio/webm" });
    const response = await POST(makeAudioRequest({ audio: emptyBlob }));
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data).toMatchObject({ error: "BAD_REQUEST" });
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(mockDb).not.toHaveBeenCalled();
  });

  it("rejects oversized audio files with 400 BAD_REQUEST", async () => {
    // Construct a blob exceeding 25MB
    const oversizedBlob = new Blob([new Uint8Array(26 * 1024 * 1024)], { type: "audio/webm" });

    const response = await POST(makeAudioRequest({ audio: oversizedBlob }));
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data).toMatchObject({ error: "BAD_REQUEST" });
    expect(data.message).toContain("25MB");
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(mockDb).not.toHaveBeenCalled();
  });

  it("rejects unsupported MIME types with 400 BAD_REQUEST", async () => {
    const imageBlob = new Blob(["png-data"], { type: "image/png" });
    const response = await POST(makeAudioRequest({ audio: imageBlob }));
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data).toMatchObject({ error: "BAD_REQUEST" });
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(mockDb).not.toHaveBeenCalled();
  });

  it("handles provider failure safely without leaking API keys or internal details", async () => {
    mockTranscribe.mockRejectedValueOnce(new Error("Groq API key gsk_secret_12345 leaked in private error"));

    const response = await POST(makeAudioRequest());
    expect(response.status).toBe(500);

    const body = await response.text();
    expect(body).not.toContain("gsk_secret");
    expect(body).not.toContain("private error");

    const data = JSON.parse(body);
    expect(data).toMatchObject({
      error: "TRANSCRIBE_FAILED",
      message: "Couldn't transcribe audio right now.",
    });
    expect(mockDb).not.toHaveBeenCalled();
  });
});
