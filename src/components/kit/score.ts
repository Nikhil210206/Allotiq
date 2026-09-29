// Score components in their fixed series order (server + client). Colours: validated --viz-1…6.
import type { ScoreBreakdown, Weights } from "@/contracts/engine";

export const SCORE_COMPONENTS: { key: keyof Weights; label: string; hint: string; color: string }[] = [
  { key: "capacityFit", label: "Capacity fit", hint: "A snug fit — few empty seats", color: "var(--viz-1)" },
  { key: "featureMatch", label: "Features", hint: "Has what the request asked for", color: "var(--viz-2)" },
  { key: "proximity", label: "Proximity", hint: "Close to the requester's department", color: "var(--viz-3)" },
  { key: "scarcity", label: "Scarcity", hint: "Leaves rare rooms free for bigger needs", color: "var(--viz-4)" },
  { key: "preference", label: "Preference", hint: "A room they've used before", color: "var(--viz-5)" },
  { key: "energy", label: "Energy", hint: "Building already in use — fewer buildings lit", color: "var(--viz-6)" },
];

/** Each component's contribution in points (weight × component × 100) and where its segment starts. */
export function scoreSegments(score: ScoreBreakdown) {
  let start = 0;
  return SCORE_COMPONENTS.map((c) => {
    const points = 100 * score.weights[c.key] * score[c.key];
    const segment = { ...c, raw: score[c.key], weight: score.weights[c.key], points, start };
    start += points;
    return segment;
  });
}
