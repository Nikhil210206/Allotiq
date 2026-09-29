"use client";
// Toasts, inline errors, loading blocks and a live countdown.
import { useEffect, useState, type ReactNode } from "react";
import { Check, CircleAlert, X } from "lucide-react";
import { useNow } from "@/hooks/use-clock";
import { countdown } from "@/lib/time";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
}
const TOAST_EVENT = "allotiq:toast";

export function toast(text: string, tone: ToastTone = "success") {
  window.dispatchEvent(new CustomEvent<Omit<ToastItem, "id">>(TOAST_EVENT, { detail: { text, tone } }));
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    let n = 0;
    const on = (e: Event) => {
      const t = { ...(e as CustomEvent<Omit<ToastItem, "id">>).detail, id: ++n };
      setItems((xs) => [...xs, t].slice(-3));
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 4200);
    };
    window.addEventListener(TOAST_EVENT, on);
    return () => window.removeEventListener(TOAST_EVENT, on);
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          className="light pointer-events-auto flex max-w-md animate-in items-center gap-3 rounded-full bg-ink py-2.5 pr-5 pl-2.5 text-[15px] text-bone shadow-2xl duration-300 fade-in slide-in-from-bottom-4"
        >
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-full",
              t.tone === "success" && "bg-volt text-ink",
              t.tone === "error" && "bg-[#e5484d] text-white",
              t.tone === "info" && "bg-white/15 text-bone",
            )}
          >
            {t.tone === "error" ? <X className="size-4" strokeWidth={3} /> : <Check className="size-4" strokeWidth={3} />}
          </span>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function ErrorNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p role="alert" className={cn("flex items-start gap-2.5 rounded-2xl bg-[#fbe2e1] px-4 py-3 text-[15px] text-[#a1161b]", className)}>
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** Quiet placeholder block while the first load is in flight. */
export function Loading({ className, rows = 3 }: { className?: string; rows?: number }) {
  return (
    <div className={cn("flex flex-col gap-3", className)} aria-busy>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-[1.5rem] bg-fg/[0.05]" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </div>
  );
}

/** "1h 42m left" against the virtual clock. */
export function Countdown({ to, suffix = "left", className }: { to: string; suffix?: string; className?: string }) {
  const now = useNow();
  if (!now) return null;
  const ms = Date.parse(to) - now.getTime();
  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {ms > 0 ? `${countdown(ms)} ${suffix}` : "expired"}
    </span>
  );
}
