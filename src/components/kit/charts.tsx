"use client";
// Small HTML charts. One series → one colour and no legend (the title names it); values are always
// printed, so hover only adds detail. The heatmap is a single-hue sequential ramp (forest).
import { useState } from "react";
import { cn } from "@/lib/utils";

export function BarList({
  rows,
  max,
  unit = "",
  tone = "forest",
  className,
}: {
  rows: { label: string; value: number; sub?: string }[];
  max?: number;
  unit?: string;
  tone?: "forest" | "volt" | "ink" | "bone";
  className?: string;
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  const fill = { forest: "bg-forest", volt: "bg-volt", ink: "bg-ink", bone: "bg-bone" }[tone];
  return (
    <ul className={cn("flex flex-col gap-3.5", className)}>
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(6rem,9rem)_1fr_auto] items-center gap-3">
          <span className="truncate text-[14px] text-fg-2" title={r.sub}>
            {r.label}
          </span>
          <span className="relative h-2.5 overflow-hidden rounded-full bg-fg/[0.07]">
            <span
              className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out", fill)}
              style={{ width: `${Math.max(2, (r.value / top) * 100)}%` }}
            />
          </span>
          <span className="min-w-12 text-right font-mono text-[13px] font-medium text-fg tabular-nums">
            {Math.round(r.value)}
            {unit}
          </span>
        </li>
      ))}
    </ul>
  );
}

const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function Heatmap({ days, hours, cells }: { days: number[]; hours: number[]; cells: number[][] }) {
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const max = Math.max(0.01, ...cells.flat());
  const cur = hover ? cells[hover.d][hover.h] : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-1" style={{ gridTemplateColumns: `2.5rem repeat(${hours.length}, 1fr)` }} onPointerLeave={() => setHover(null)}>
        <span />
        {hours.map((h) => (
          <span key={h} className="pb-1 text-center font-mono text-[11px] text-fg-3">
            {String(h).padStart(2, "0")}
          </span>
        ))}
        {days.map((d, di) => (
          <div key={d} className="contents">
            <span className="flex items-center font-mono text-[11px] tracking-[0.1em] text-fg-3 uppercase">{DAY[d]}</span>
            {hours.map((h, hi) => {
              const v = cells[di][hi];
              return (
                <span
                  key={h}
                  onPointerEnter={() => setHover({ d: di, h: hi })}
                  title={`${DAY[d]} ${String(h).padStart(2, "0")}:00 · ${Math.round(v * 100)}% booked`}
                  className={cn("aspect-[1.6] rounded-md transition-transform", hover?.d === di && hover?.h === hi && "scale-110 ring-2 ring-ink")}
                  style={{ background: `color-mix(in oklab, #00583f ${Math.round((v / max) * 100)}%, #eef1ec)` }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-fg-3">
        <span className="flex items-center gap-2">
          Quiet
          <span className="h-2.5 w-28 rounded-full bg-[linear-gradient(90deg,#eef1ec,#00583f)]" />
          Busy
        </span>
        <span className="font-mono text-fg-2">
          {hover && cur !== null
            ? `${DAY[days[hover.d]]} ${String(hours[hover.h]).padStart(2, "0")}:00 · ${Math.round(cur * 100)}% of rooms booked`
            : "Hover a cell"}
        </span>
      </div>
    </div>
  );
}
