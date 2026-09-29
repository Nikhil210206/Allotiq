// Form controls in the house style: big, rounded, projector-legible. `flag` marks a field the parser
// wasn't sure about (amber), as the "Understood" form requires.
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Field({
  label,
  hint,
  flag,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  flag?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-2", className)}>
      <span className="flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.14em] text-fg-3 uppercase">
        {label}
        {flag && (
          <span className="rounded-full bg-[#fbeec8] px-1.5 py-px text-[10px] tracking-[0.08em] text-[#6f4800]">check</span>
        )}
      </span>
      {children}
      {hint && <span className="text-[13px] text-fg-3">{hint}</span>}
    </label>
  );
}

const control =
  "h-12 w-full rounded-2xl bg-card px-4 text-[16px] text-fg ring-1 ring-line outline-none transition-shadow placeholder:text-fg-3 focus:ring-2 focus:ring-fg/40 data-[flag=true]:bg-[#fffaf0] data-[flag=true]:ring-2 data-[flag=true]:ring-[#e8a200]";

export function Input({ flag, className, ...props }: ComponentProps<"input"> & { flag?: boolean }) {
  return <input data-flag={flag || undefined} className={cn(control, className)} {...props} />;
}

export function Select({ flag, className, children, ...props }: ComponentProps<"select"> & { flag?: boolean }) {
  return (
    <span className="relative block">
      <select data-flag={flag || undefined} className={cn(control, "appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <svg viewBox="0 0 16 16" aria-hidden className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-fg-3">
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "h-auto min-h-28 py-3 leading-relaxed", className)} {...props} />;
}

/** Pill group for one choice: "Today · Week · Month". */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" className={cn("inline-flex flex-wrap gap-1 rounded-full bg-fg/[0.06] p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full font-medium text-fg-2 transition-colors hover:text-fg aria-checked:bg-fg aria-checked:text-background",
            size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-[15px]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Multi-select chips: features, reasons. */
export function ChipToggle({
  selected,
  onToggle,
  children,
}: {
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-fg-2 ring-1 ring-line transition-colors hover:text-fg aria-pressed:bg-fg aria-pressed:text-background aria-pressed:ring-fg"
    >
      {children}
    </button>
  );
}
