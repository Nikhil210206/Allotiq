"use client";
// The shell's AI chip, kept honest: it starts from the server's view (Groq configured and not disabled)
// and then follows what AI calls actually report — a parse or answer from a fallback flips it to offline
// until Groq answers again.
import { useEffect, useState } from "react";
import { AI_EVENT, type AiStatusDetail } from "@/lib/api/client";
import { AiChip } from "./chips";

export function AiStatus({ initial, className }: { initial: boolean; className?: string }) {
  const [online, setOnline] = useState(initial);
  useEffect(() => {
    const on = (e: Event) => setOnline((e as CustomEvent<AiStatusDetail>).detail.online);
    window.addEventListener(AI_EVENT, on);
    return () => window.removeEventListener(AI_EVENT, on);
  }, []);
  return <AiChip online={online} className={className} />;
}
