"use client";
// Demo controls: the virtual clock and the buttons the demo script needs (+15 min, jump to 14:16,
// run jobs, reset, switch persona). Used by /admin/demo and the Ctrl+. drawer. Owner: Nikhil
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Clock3, FastForward, RotateCcw, Timer, UserRound, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-clock";
import { api } from "@/lib/api/client";
import { fmtDayLong, fmtTime, istDate, toIso } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "./feedback";

const PERSONAS = [
  { id: "faculty", label: "Faculty", who: "Dr. Priya Raman" },
  { id: "club", label: "Club", who: "AI Club" },
  { id: "student", label: "Student", who: "Rahul S" },
  { id: "approver", label: "Approver", who: "Judge" },
  { id: "admin", label: "Admin", who: "Facilities" },
] as const;

/** "WED 13:50" in the shell, ticking with the virtual clock. */
export function LiveClock({ className }: { className?: string }) {
  const now = useNow();
  return (
    <span
      title="Demo time — the virtual clock all business logic uses"
      className={cn("inline-flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.14em] text-fg-2 uppercase", className)}
    >
      <Clock3 className="size-3.5 text-fg-3" strokeWidth={2.25} aria-hidden />
      {now ? `${now.toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" })} ${fmtTime(now)}` : "—"}
    </span>
  );
}

export function DemoControls({ compact = false }: { compact?: boolean }) {
  const now = useNow();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(label);
    try {
      await fn();
      toast(done);
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "That didn't work", "error");
    } finally {
      setBusy(null);
    }
  };
  const today = now ? istDate(now) : null;

  return (
    <div className={cn("flex flex-col", compact ? "gap-6" : "gap-8")}>
      <div>
        <p className="eyebrow text-fg-3">Demo time · IST</p>
        <p className={cn("figure mt-3 text-fg", compact ? "text-[4rem]" : "text-[clamp(5rem,10vw,8.5rem)]")}>
          {now ? fmtTime(now) : "—"}
        </p>
        <p className="mt-2 text-[15px] text-fg-2">{now ? fmtDayLong(now) : ""}</p>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <Button variant="secondary" disabled={!!busy} onClick={() => run("15", () => api.clock.advance(15), "Moved the clock 15 minutes on")}>
          <FastForward /> +15 min
        </Button>
        <Button variant="secondary" disabled={!!busy} onClick={() => run("60", () => api.clock.advance(60), "Moved the clock an hour on")}>
          <FastForward /> +1 h
        </Button>
        <Button
          variant="volt"
          disabled={!!busy || !today}
          onClick={() => today && run("jump", () => api.clock.set(toIso(today, "14:16")), "Jumped to 14:16 — jobs ran")}
        >
          <Timer /> Jump to 14:16
        </Button>
        <Button variant="secondary" disabled={!!busy} onClick={() => run("tick", () => api.demo.tick(), "Jobs ran: holds, no-shows, waitlist")}>
          <Zap /> Run jobs now
        </Button>
        <Button
          variant="outline"
          disabled={!!busy}
          onClick={() => run("reset", () => api.demo.reset(), "Demo reset — Wednesday 13:50")}
        >
          <RotateCcw /> Reset demo
        </Button>
      </div>

      <div>
        <p className="eyebrow mb-3 text-fg-3">Sign in as</p>
        <div className="flex flex-wrap gap-2">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={!!busy}
              onClick={() =>
                run(
                  p.id,
                  async () => {
                    const { redirect } = await api.demo.login(p.id);
                    router.push(redirect);
                  },
                  `Signed in as ${p.who}`,
                )
              }
              className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-fg-2 ring-1 ring-line transition-colors hover:bg-fg/[0.06] hover:text-fg"
            >
              <UserRound className="size-4 text-fg-3" />
              {p.label} <span className="text-fg-3">· {p.who}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Ctrl + . anywhere opens the controls — the presenter's backstage. */
export function DemoDrawer() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ".") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[55] flex justify-end" role="dialog" aria-modal aria-label="Demo controls">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      <div className="dark relative flex h-full w-full max-w-md animate-in flex-col gap-8 overflow-y-auto bg-ink p-8 text-bone duration-300 slide-in-from-right">
        <div className="flex items-center justify-between">
          <p className="eyebrow text-fg-3">Demo controls · Ctrl + .</p>
          <button type="button" onClick={() => setOpen(false)} className="text-sm text-fg-3 hover:text-fg">
            Close
          </button>
        </div>
        <DemoControls compact />
      </div>
    </div>
  );
}
