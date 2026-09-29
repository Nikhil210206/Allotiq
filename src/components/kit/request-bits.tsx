// Request-flow pieces: the recommendation "receipt" card, the lifecycle stepper and the audit timeline.
import type { ReactNode } from "react";
import { Check, CircleSlash, X } from "lucide-react";
import type { AuditEntry, RequestStatus, Room } from "@/contracts/domain";
import type { Recommendation } from "@/contracts/engine";
import { fmtTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { RoomCode } from "./chips";
import { ScoreBar } from "./score-bar";
import { Tag } from "./status-badge";

export function WhyList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {items.map((t) => (
        <li key={t} className="flex items-center gap-2.5 text-[15px] text-fg-2">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-volt text-ink">
            <Check className="size-3" strokeWidth={3.5} />
          </span>
          {t}
        </li>
      ))}
    </ul>
  );
}

export function RoomCard({
  room,
  rank,
  rec,
  meta,
  selected,
  onSelect,
  action,
}: {
  room: Room;
  rank: number;
  rec: Recommendation;
  meta: string;
  selected?: boolean;
  onSelect?: () => void;
  action?: ReactNode;
}) {
  return (
    <div
      role={onSelect ? "radio" : undefined}
      aria-checked={onSelect ? !!selected : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect?.()}
      className={cn(
        "light relative flex flex-col gap-6 rounded-[1.75rem] bg-white p-6 text-ink ring-2 ring-ink/10 transition-[box-shadow,transform] md:p-7",
        onSelect && "cursor-pointer outline-none hover:ring-ink/40 focus-visible:ring-ink",
        selected && "ring-[3px] ring-ink",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <RoomCode code={room.code} />
          <div className="min-w-0">
            <p className="display-4 truncate text-fg">{room.name}</p>
            <p className="mt-1 text-sm text-fg-3">{meta}</p>
          </div>
        </div>
        {rank === 1 ? <Tag className="bg-volt text-ink">Best match</Tag> : <span className="eyebrow text-fg-3">0{rank}</span>}
      </div>
      <ScoreBar score={rec.score} size="md" />
      <WhyList items={rec.why.slice(0, 3)} />
      {action}
      {selected && (
        <span className="absolute -top-2.5 -right-2.5 grid size-8 place-items-center rounded-full bg-ink text-volt shadow-lg">
          <Check className="size-4" strokeWidth={3} />
        </span>
      )}
    </div>
  );
}

const STEPS: { key: RequestStatus; label: string }[] = [
  { key: "pending", label: "Held" },
  { key: "approved", label: "Approved" },
  { key: "checked_in", label: "Checked in" },
  { key: "completed", label: "Done" },
];
const REACHED: Partial<Record<RequestStatus, number>> = { waitlisted: -1, pending: 0, approved: 1, checked_in: 2, completed: 3 };
const STOPPED: Partial<Record<RequestStatus, { at: number; label: string }>> = {
  rejected: { at: 1, label: "Not approved" },
  expired: { at: 1, label: "Hold expired" },
  cancelled: { at: 1, label: "Cancelled" },
  auto_released: { at: 2, label: "No-show — released" },
  bumped: { at: 1, label: "Moved — pick a new slot" },
};

/** Held → Approved → Checked in → Done, with the stop marked when a request leaves the happy path. */
export function StatusStepper({ status, className }: { status: RequestStatus; className?: string }) {
  const stop = STOPPED[status];
  const reached = stop ? stop.at - 1 : (REACHED[status] ?? 0);
  return (
    <ol className={cn("grid grid-cols-4 gap-2", className)}>
      {STEPS.map((step, i) => {
        const done = i <= reached;
        const here = stop ? i === stop.at : i === reached;
        const stopped = stop && i === stop.at;
        return (
          <li key={step.key} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full font-mono text-xs font-medium ring-1 transition-colors",
                  done && "bg-fg text-background ring-fg",
                  !done && !stopped && "text-fg-3 ring-line",
                  here && !stopped && "bg-volt text-ink ring-volt",
                  stopped && "bg-[#e5484d] text-white ring-[#e5484d]",
                )}
              >
                {stopped ? <X className="size-4" strokeWidth={3} /> : done && !here ? <Check className="size-4" strokeWidth={3} /> : `0${i + 1}`}
              </span>
              {i < STEPS.length - 1 && <span className={cn("h-0.5 flex-1 rounded-full", i < reached ? "bg-fg" : "bg-line")} />}
            </div>
            <p className={cn("text-[15px] font-medium", done || here ? "text-fg" : "text-fg-3")}>
              {stopped ? stop.label : step.label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

const ACTION_LABEL: Record<string, string> = {
  created: "Requested",
  approved: "Approved",
  rejected: "Not approved",
  cancelled: "Cancelled",
  expired: "Expired",
  checked_in: "Checked in",
  auto_released: "Released — no check-in",
  waitlist_fill: "Room found from the waitlist",
  rehomed: "Moved to another room",
  bumped: "Moved — offered other times",
  completed: "Completed",
  accepted_offer: "Accepted a new slot",
};

export function Timeline({ entries, roomCode }: { entries: AuditEntry[]; roomCode?: (id: unknown) => string | undefined }) {
  if (!entries.length) return <p className="text-[15px] text-fg-3">Nothing has happened yet.</p>;
  return (
    <ol className="relative flex flex-col gap-5 border-l border-line pl-6">
      {entries.map((e, i) => {
        const last = i === entries.length - 1;
        const bad = ["rejected", "expired", "cancelled", "auto_released", "bumped"].includes(e.action);
        const code = roomCode?.(e.details.roomId);
        return (
          <li key={e.id} className="relative">
            <span
              aria-hidden
              className={cn(
                "absolute top-1.5 left-[calc(-1.8125rem-0.5px)] size-2.5 rounded-full ring-4 ring-background",
                bad ? "bg-[#e5484d]" : last ? "bg-volt" : "bg-fg",
              )}
            />
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-mono text-xs text-fg-3">{fmtTime(e.at)}</span>
              <span className="font-semibold text-fg">{ACTION_LABEL[e.action] ?? e.action.replace(/_/g, " ")}</span>
              {code && e.action !== "created" && <span className="font-mono text-xs text-fg-3">{code}</span>}
            </p>
            {typeof e.details.reason === "string" && <p className="mt-1 text-[15px] text-fg-2">{e.details.reason}</p>}
          </li>
        );
      })}
    </ol>
  );
}

export function WhyNot({ items }: { items: { code: string; reason: string }[] }) {
  if (!items.length) return null;
  return (
    <details className="group rounded-2xl bg-fg/[0.04] px-5 py-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[15px] font-medium text-fg-2 marker:hidden">
        <CircleSlash className="size-4 text-fg-3" />
        Why not other rooms?
        <span className="ml-auto font-mono text-xs text-fg-3 group-open:hidden">show {items.length}</span>
      </summary>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((w) => (
          <li key={w.code} className="flex items-center gap-3 text-[15px]">
            <RoomCode code={w.code} />
            <span className="text-fg-2">{w.reason}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
