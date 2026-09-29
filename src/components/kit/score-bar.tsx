"use client";
// Score visuals for an engine ScoreBreakdown. Palette: validated --viz-1…6 (see globals.css).
//  • ScoreBar — one stacked bar; each segment is a component's contribution (weight × value × 100).
//  • ScoreReceipt — the maths written out, one thin bar per component, "= 91" at the bottom
//    (echo's "Prioritize" card). Values are always printed, so hover only ever enhances.
import { useRef, useState, type RefObject } from "react";
import type { ScoreBreakdown } from "@/contracts/engine";
import { cn } from "@/lib/utils";
import { MOTION_OK, MOTION_REDUCED, gsap, useGSAP } from "./motion";
import { scoreSegments } from "./score";

const HEIGHT = { sm: "h-1.5", md: "h-2.5", lg: "h-3.5" };

function useGrow(scopeRef: RefObject<HTMLElement | null>, selector: string) {
  useGSAP(
    () => {
      const el = scopeRef.current;
      if (!el) return;
      const bars = el.querySelectorAll<HTMLElement>(selector);
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.set(el, { autoAlpha: 1 });
        gsap.from(bars, {
          scaleX: 0,
          transformOrigin: "left center",
          duration: 1.2,
          ease: "expo.out",
          stagger: 0.07,
          delay: 0.2,
          scrollTrigger: { trigger: el, start: "top 90%", once: true },
        });
      });
      mm.add(MOTION_REDUCED, () => {
        gsap.set(el, { autoAlpha: 1 });
      });
    },
    { scope: scopeRef },
  );
}

export function ScoreBar({
  score,
  size = "md",
  legend = true,
  showTotal = true,
  className,
}: {
  score: ScoreBreakdown;
  size?: keyof typeof HEIGHT;
  legend?: boolean;
  showTotal?: boolean;
  className?: string;
}) {
  const segments = scoreSegments(score);
  const filled = Math.min(100, segments.reduce((s, x) => s + x.points, 0));
  const [active, setActive] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const current = active === null ? null : segments[active];
  useGrow(ref, "[data-seg]");

  return (
    <div ref={ref} data-reveal="" className={cn("@container flex flex-col gap-3", className)}>
      <div className="flex items-center gap-4">
        <div className="relative min-w-0 flex-1">
          {current && (
            <div
              role="status"
              className="light pointer-events-none absolute bottom-full z-10 mb-3 w-max max-w-64 -translate-x-1/2 rounded-2xl bg-white px-3.5 py-2.5 text-ink shadow-xl ring-1 ring-line"
              style={{ left: `clamp(4rem, ${current.start + current.points / 2}%, calc(100% - 4rem))` }}
            >
              <p className="text-base font-semibold tracking-tight">+{current.points.toFixed(1)} pts</p>
              <p className="flex items-center gap-1.5 text-[13px] text-fg-2">
                <span className="h-0.5 w-3 rounded-full" style={{ background: current.color }} />
                {current.label} · {current.raw.toFixed(2)} × {Math.round(current.weight * 100)}%
              </p>
            </div>
          )}
          <div
            role="img"
            aria-label={`Score ${Math.round(score.total)} out of 100`}
            className={cn("relative w-full", HEIGHT[size])}
            onPointerLeave={() => setActive(null)}
          >
            {filled < 99.5 && (
              <span
                className="absolute inset-y-0 right-0 rounded-full bg-viz-track"
                style={{ left: `calc(${filled}% + 2px)` }}
              />
            )}
            {segments.map((s, i) =>
              s.points <= 0 ? null : (
                <span
                  key={s.key}
                  data-seg=""
                  onPointerEnter={() => setActive(i)}
                  className={cn(
                    "absolute inset-y-0 rounded-full transition-opacity duration-200",
                    active !== null && active !== i && "opacity-25",
                  )}
                  style={{
                    left: `${s.start}%`,
                    width: `max(2px, calc(${s.points}% - 2px))`,
                    background: s.color,
                  }}
                />
              ),
            )}
          </div>
        </div>
        {showTotal && (
          <p className="figure shrink-0 text-[2.25rem] text-fg">
            {Math.round(score.total)}
            <span className="font-sans text-sm font-medium tracking-normal text-fg-3">/100</span>
          </p>
        )}
      </div>

      {legend && (
        <ul className="grid grid-cols-2 gap-x-5 gap-y-1 @md:grid-cols-3">
          {segments.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                title={s.hint}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md py-0.5 text-left text-[13px] transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active !== null && active !== i && "opacity-40",
                )}
              >
                <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="truncate text-fg-2">{s.label}</span>
                <span className="ml-auto font-mono text-xs font-medium text-fg">{s.points.toFixed(1)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The score written out as a receipt: each component's value × weight, then the total. */
export function ScoreReceipt({
  score,
  caption = "score",
  className,
}: {
  score: ScoreBreakdown;
  /** Mono note after the total, e.g. "best match". */
  caption?: string;
  className?: string;
}) {
  const segments = scoreSegments(score);
  const ref = useRef<HTMLDivElement>(null);
  useGrow(ref, "[data-fill]");
  return (
    <div ref={ref} data-reveal="" className={cn("flex flex-col gap-3.5", className)}>
      {segments.map((s) => (
        <div key={s.key} className="flex flex-col gap-1.5" title={s.hint}>
          <div className="flex items-baseline justify-between gap-3 font-mono text-xs">
            <span className="text-fg-2">{s.label}</span>
            <span className="text-fg">
              {s.raw.toFixed(2)} <span className="text-fg-3">× {s.weight.toFixed(2)}</span>
            </span>
          </div>
          <div className="relative h-1.5 overflow-hidden rounded-full bg-viz-track">
            <span
              data-fill=""
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${Math.max(0, Math.min(1, s.raw)) * 100}%`, background: s.color }}
            />
          </div>
        </div>
      ))}
      <p className="mt-1 flex items-baseline gap-3 border-t border-line pt-4">
        <span className="figure text-[2.75rem] text-fg">= {Math.round(score.total)}</span>
        <span className="font-mono text-xs tracking-[0.08em] text-fg-3 uppercase">{caption}</span>
      </p>
    </div>
  );
}
