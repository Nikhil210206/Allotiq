// Cards. Light tones reset tokens (`light`), dark ones flip them (`dark`), so anything inside —
// status pills, score bars, shadcn primitives — renders correctly on any section.
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type Tone = "white" | "bone" | "volt" | "mint" | "outline" | "ink" | "forest";

export const TONE_CLASS: Record<Tone, string> = {
  white: "light bg-white text-ink",
  bone: "light bg-bone text-ink",
  volt: "light bg-volt text-ink",
  mint: "light bg-mint text-ink",
  /** OneClick "receipt": white with a 2px ink rule. */
  outline: "light bg-white text-ink ring-2 ring-ink ring-inset",
  ink: "dark bg-ink-2 text-bone ring-1 ring-white/[0.06] ring-inset",
  forest:
    "dark bg-forest text-bone [--card:rgb(255_255_255/0.08)] [--line:rgb(255_255_255/0.14)] [--viz-track:rgb(255_255_255/0.16)] [--fg-3:#b4d6c6]",
};

export function Panel({ tone = "white", className, ...props }: ComponentProps<"div"> & { tone?: Tone }) {
  return <div className={cn("relative overflow-hidden rounded-[1.75rem]", TONE_CLASS[tone], className)} {...props} />;
}
