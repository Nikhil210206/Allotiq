// Small inline pieces: room codes, the AI indicator, the demo clock.
import { Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";

/** "TP-401" — the room's short code, set like a receipt reference (OneClick's step chips). */
export function RoomCode({ code, className }: { code: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center rounded-lg bg-ink px-2 font-mono text-[13px] font-medium tracking-tight text-volt ring-1 ring-white/10 ring-inset",
        className,
      )}
    >
      {code}
    </span>
  );
}

/** Groq status. Offline is fine — every AI feature has a template/chrono fallback. */
export function AiChip({ online, className }: { online: boolean; className?: string }) {
  return (
    <span
      title={online ? "AI features are live" : "AI is offline — forms and explanations use built-in fallbacks"}
      className={cn(
        "inline-flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.14em] text-fg-3 uppercase",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", online ? "bg-mint" : "bg-fg-3/60")} aria-hidden />
      {online ? "AI on" : "AI offline"}
    </span>
  );
}

/** The virtual clock the demo runs on (Wed 13:50 IST at reset). */
export function ClockChip({ label, className }: { label: string; className?: string }) {
  return (
    <span
      title="Demo time — the virtual clock all business logic uses"
      className={cn(
        "inline-flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.14em] text-fg-2 uppercase",
        className,
      )}
    >
      <Clock3 className="size-3.5 text-fg-3" strokeWidth={2.25} aria-hidden />
      {label}
    </span>
  );
}
