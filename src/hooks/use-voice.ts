"use client";
// Mic input. While you talk, the browser's own speech recognition (Chrome/Edge) shows words live;
// when you stop, the recording goes to /api/ai/transcribe (Whisper) and its text replaces the draft.
// If Whisper isn't available yet, the live browser transcript stays. Owner: Nikhil
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

export function useVoice(onText: (text: string, final: boolean) => void) {
  const [listening, setListening] = useState(false);
  const [working, setWorking] = useState(false);
  const [supported, setSupported] = useState(true);
  const rec = useRef<Recognition | null>(null);
  const media = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const heard = useRef("");
  const cb = useRef(onText);
  useEffect(() => {
    cb.current = onText;
  });

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const t = setTimeout(() => setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition || navigator.mediaDevices)), 0);
    return () => clearTimeout(t);
  }, []);

  const start = useCallback(async () => {
    heard.current = "";
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (Ctor) {
      const r = new Ctor();
      r.lang = "en-IN";
      r.interimResults = true;
      r.continuous = true;
      r.onresult = (e) => {
        heard.current = Array.from(e.results, (x) => x[0].transcript).join(" ").replace(/\s+/g, " ").trim();
        cb.current(heard.current, false);
      };
      r.onend = () => setListening(false);
      rec.current = r;
      r.start();
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const m = new MediaRecorder(stream);
      chunks.current = [];
      m.ondataavailable = (e) => chunks.current.push(e.data);
      m.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const audio = new Blob(chunks.current, { type: m.mimeType || "audio/webm" });
        setWorking(true);
        try {
          const { text } = await api.ai.transcribe(audio);
          if (text?.trim()) cb.current(text.trim(), true);
          else cb.current(heard.current, true);
        } catch {
          cb.current(heard.current, true);
        } finally {
          setWorking(false);
        }
      };
      media.current = m;
      m.start();
    } catch {
      if (!Ctor) setSupported(false);
    }
    setListening(true);
  }, []);

  const stop = useCallback(() => {
    rec.current?.stop();
    rec.current = null;
    if (media.current?.state === "recording") media.current.stop();
    else cb.current(heard.current, true);
    media.current = null;
    setListening(false);
  }, []);

  return { listening, working, supported, start, stop };
}
