// Thin wrappers over the analytics_* SQL functions (supabase/analytics/analytics.sql). The five tool
// functions are also the ONLY tools "Ask the dashboard" may call. Owner: Nikhil · N7
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "@/lib/db/server";
import { analytics, type Rpc } from "./core";

export type * from "./core";

/** The analytics SQL hasn't been applied to this database yet (PostgREST can't find the function). */
export class AnalyticsNotInstalled extends Error {}

const rpc: Rpc = async (fn, args) => {
  // analytics_* live in supabase/analytics/analytics.sql, not in the generated types, so call untyped.
  const { data, error } = await (db() as unknown as SupabaseClient).rpc(fn, args);
  if (error?.code === "PGRST202")
    throw new AnalyticsNotInstalled(`${fn} is missing — run supabase/analytics/analytics.sql on this database`);
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
