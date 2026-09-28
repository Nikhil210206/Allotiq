// Thin wrappers over the analytics_* SQL functions. Also the ONLY tools "Ask the dashboard" may call.
// Owner: Nikhil · N7
import "server-only";

export type Range = { from: string; to: string; roomType?: string; buildingCode?: string };

export async function utilization(_r: Range & { weekday?: number }) {
  throw new Error("Not implemented yet (N7)");
}
export async function heatmap(_r: Range) {
  throw new Error("Not implemented yet (N7)");
}
export async function ghostRate(_r: Range & { groupBy: "room" | "requester_kind" | "weekday" | "building" }) {
  throw new Error("Not implemented yet (N7)");
}
export async function unmetDemand(_r: Range & { groupBy: "capacity_band" | "time_band" | "room_type" }) {
  throw new Error("Not implemented yet (N7)");
}
export async function underusedRooms(_r: Range & { thresholdPct: number; weekday?: number }) {
  throw new Error("Not implemented yet (N7)");
}
