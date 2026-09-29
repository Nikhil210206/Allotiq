// Request status pill, echo-style: mono caps with a dot. Colour never carries meaning alone —
// the label is always there. Live states (pending, approved, checked in) pulse.
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowLeftRight,
  Ban,
  Check,
  CheckCheck,
  DoorOpen,
  Hourglass,
  ListOrdered,
  TimerOff,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import type { RequestStatus } from "@/contracts/domain";
import { cn } from "@/lib/utils";

/** Labels and icons per status (icons are for steppers and timelines). */
export const STATUS_META: Record<RequestStatus, { label: string; icon: LucideIcon; live?: boolean }> = {
  waitlisted: { label: "Waitlisted", icon: ListOrdered },
  pending: { label: "Pending", icon: Hourglass, live: true },
  approved: { label: "Approved", icon: Check, live: true },
  checked_in: { label: "Checked in", icon: DoorOpen, live: true },
  completed: { label: "Completed", icon: CheckCheck },
  rejected: { label: "Rejected", icon: X },
  expired: { label: "Expired", icon: TimerOff },
  cancelled: { label: "Cancelled", icon: Ban },
  auto_released: { label: "Auto-released", icon: Undo2 },
  bumped: { label: "Bumped", icon: ArrowLeftRight },
};

const SIZE = {
  sm: "h-5 gap-1.5 px-2 text-[10px]",
  md: "h-6 gap-1.5 px-2.5 text-[11px]",
  lg: "h-8 gap-2 px-3.5 text-[13px]",
};

export function StatusBadge({
  status,
  size = "md",
  className,
}: {
  status: RequestStatus;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const { label, live } = STATUS_META[status];
  const vars = {
    "--st": `var(--st-${status})`,
    "--st-bg": `var(--st-${status}-bg)`,
    "--st-fg": `var(--st-${status}-fg)`,
  } as CSSProperties;
  return (
    <span
      data-status={status}
      style={vars}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full bg-(--st-bg) font-mono font-medium tracking-[0.08em] whitespace-nowrap text-(--st-fg) uppercase",
        SIZE[size],
        className,
      )}
    >
      <span className="relative flex size-1.5" aria-hidden>
        {live && (
          <span className="absolute inline-flex size-full animate-[live-ping_2s_ease-out_infinite] rounded-full bg-(--st) motion-reduce:animate-none" />
        )}
        <span className="relative inline-flex size-1.5 rounded-full bg-(--st)" />
      </span>
      {label}
    </span>
  );
}

/** A neutral mono tag in the same shape: "BEST MATCH", "FIXED IN 1 DAY". */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full bg-fg/[0.07] px-2.5 font-mono text-[11px] font-medium tracking-[0.08em] whitespace-nowrap text-fg-2 uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}
