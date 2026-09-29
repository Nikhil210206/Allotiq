// GET /api/audit?entityId=<id> — Audit timeline for a request or room (admin/approver only).
// Owner: Aditi · Task D13
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import type { AuditEntry } from "@/contracts/domain";

function rowToAudit(r: Record<string, unknown>): AuditEntry {
  return {
    id: r.id as number,
    at: r.at as string,
    actorId: (r.actor_id as string) ?? null,
    entity: r.entity as AuditEntry["entity"],
    entityId: r.entity_id as string,
    action: r.action as string,
    fromStatus: (r.from_status as AuditEntry["fromStatus"]) ?? null,
    toStatus: (r.to_status as AuditEntry["toStatus"]) ?? null,
    details: (r.details as Record<string, unknown>) ?? {},
  };
}

export async function GET(req: Request) {
  try {
    await requireRole("admin", "approver");
  } catch (e) {
    return e as Response;
  }

  const url = new URL(req.url);
  const entityId = url.searchParams.get("entityId");
  const supabase = db();

  let query = supabase
    .from("audit_log")
    .select("*")
    .order("at", { ascending: false })
    .limit(200);

  if (entityId) {
    query = query.eq("entity_id", entityId);
  }

  const { data, error } = await query;
  if (error) return apiError(500, "DB_ERROR", error.message);
  return Response.json((data ?? []).map((r) => rowToAudit(r as Record<string, unknown>)));
}
