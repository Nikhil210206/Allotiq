// POST /api/ai/transcribe — Whisper speech-to-text (English)
// Owner: Aaditya · Task A13
import { requireRole } from "@/lib/auth/session";
import { apiError } from "@/lib/http";
import { transcribe } from "@/lib/ai/transcribe";

const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export async function POST(request: Request) {
  try {
    await requireRole("requester", "admin");
  } catch (error) {
    return error as Response;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return apiError(400, "BAD_REQUEST", "Provide multipart form data with an audio file.");
  }

  const audio = formData.get("audio");
  if (!audio) {
    return apiError(400, "BAD_REQUEST", "Audio field is required.");
  }

  if (typeof audio === "string" || !(audio instanceof Blob)) {
    return apiError(400, "BAD_REQUEST", "Audio field must be a valid file.");
  }

  if (audio.size === 0) {
    return apiError(400, "BAD_REQUEST", "Audio file cannot be empty.");
  }

  if (audio.size > MAX_AUDIO_SIZE_BYTES) {
    return apiError(400, "BAD_REQUEST", "Audio file exceeds maximum size limit of 25MB.");
  }

  if (
    audio.type &&
    !audio.type.startsWith("audio/") &&
    audio.type !== "video/webm" &&
    audio.type !== "application/octet-stream"
  ) {
    return apiError(400, "BAD_REQUEST", "Unsupported audio file type.");
  }

  try {
    const text = await transcribe(audio);
    return Response.json({ text });
  } catch {
    return apiError(500, "TRANSCRIBE_FAILED", "Couldn't transcribe audio right now.");
  }
}
