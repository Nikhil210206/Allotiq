// GET /api/dashboard/[metric]?from&to&type&building — all | summary | heatmap | ghost | unmet | underused
// Defaults to the 28 days before today (IST midnight, virtual clock). Admin only.
// Owner: Nikhil · Task N7
import { z } from "zod";
import { ROOM_TYPES } from "@/contracts/domain";
import { requireRole } from "@/lib/auth/session";
import { getNow } from "@/lib/clock";
import { apiError } from "@/lib/http";
import { AnalyticsNotInstalled, dashboardMetrics } from "@/lib/analytics";
import { istDate } from "@/lib/time";

const METRICS = ["all", "summary", "heatmap", "ghost", "unmet", "underused"] as const;
const DAY = 86_400_000;
const MAX_DAYS = 366;

const QuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    type: z.enum(ROOM_TYPES).optional(),
    building: z.string().min(1).max(20).optional(),
  })
  .refine((q) => !q.from || !q.to || q.from < q.to, "from must be before to");

export async function GET(req: Request, { params }: { params: Promise<{ metric: string }> }) {
  try {
    await requireRole("admin");
  } catch (e) {
    return e as Response;
  }

  const { metric } = await params;
  if (!(METRICS as readonly string[]).includes(metric))
    return apiError(404, "NOT_FOUND", `Unknown metric — use one of ${METRICS.join(", ")}`);

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries([...url.searchParams].filter(([, v]) => v !== "")));
  if (!parsed.success) return apiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid query");
  const q = parsed.data;

  const to = q.to ?? new Date(`${istDate(await getNow())}T00:00:00+05:30`).toISOString();
  const from = q.from ?? new Date(Date.parse(to) - 28 * DAY).toISOString();
  if (Date.parse(to) - Date.parse(from) > MAX_DAYS * DAY)
    return apiError(400, "BAD_REQUEST", `Range is limited to ${MAX_DAYS} days`);

  try {
    const m = await dashboardMetrics({ from, to, type: q.type, building: q.building });
    return Response.json(metric === "all" ? m : m[metric as Exclude<(typeof METRICS)[number], "all">]);
  } catch (e) {
    // 501 makes the UI fall back to its in-browser numbers instead of showing an error.
    if (e instanceof AnalyticsNotInstalled) return apiError(501, "NOT_IMPLEMENTED", e.message);
    console.error("[dashboard]", e);
    return apiError(500, "ANALYTICS_ERROR", e instanceof Error ? e.message : "Analytics failed");
  }
}
