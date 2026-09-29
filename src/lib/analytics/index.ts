// Thin wrappers over the analytics_* SQL functions (supabase/migrations/20260929134309_analytics.sql).
// The five tool functions are also the ONLY tools "Ask the dashboard" may call. Owner: Nikhil · N7
import "server-only";
import { db } from "@/lib/db/server";
import type { Database } from "@/lib/db/types.gen";
import { analytics, type Rpc } from "./core";

export type * from "./core";

type AnalyticsFn = Extract<keyof Database["public"]["Functions"], `analytics_${string}`>;

/** The analytics SQL hasn't been applied to this database yet (PostgREST can't find the function). */
export class AnalyticsNotInstalled extends Error {}

const rpc: Rpc = async (fn, args) => {
  // core.ts names the function at runtime (it also runs against plain Postgres), so narrow it here.
  const { data, error } = await db().rpc(
    fn as AnalyticsFn,
    args as Database["public"]["Functions"][AnalyticsFn]["Args"],
  );
  if (error?.code === "PGRST202")
    throw new AnalyticsNotInstalled(`${fn} is missing — apply supabase/migrations (supabase db push)`);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return (data ?? []) as unknown[];
};

const a = analytics(rpc);

// ── "Ask the dashboard" tools (plan §6.4) ──
export const utilization = a.utilization;
export const heatmap = a.heatmap;
export const ghostRate = a.ghostRate;
export const unmetDemand = a.unmetDemand;
export const underusedRooms = a.underusedRooms;

// ── Dashboard only ──
export const unmetRequests = a.unmetRequests;
export const idleBuildingHours = a.idleBuildingHours;
export const dashboardMetrics = a.dashboard;
