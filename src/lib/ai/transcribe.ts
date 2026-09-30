// Whisper speech-to-text (English, whisper-large-v3-turbo). Owner: Aaditya · A13
import "server-only";
import { requestGroqTranscription } from "./groq";

export async function transcribe(audio: Blob): Promise<string> {
  return requestGroqTranscription(audio);
}
