"use client";
// Audit log: every status change, rehome and decision, newest first, live. Owner: Nikhil (UI) · Aditi (API)
// Rows are described from what the trigger records (status change, room move, time) rather than the
// free-form `action`, which is whatever the code path named it ("approve", "auto_complete", "lab_apply"…).
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { Interval } from "@/contracts/domain";
import { ErrorNote, Eyebrow, Headline, Loading, Panel, Segmented, StatusBadge } from "@/components/kit";
import { useApi } from "@/hooks/use-api";
import { useNow } from "@/hooks/use-clock";
import { useRooms } from "@/hooks/use-rooms";
import { api } from "@/lib/api/client";
import type { AuditRow } from "@/lib/api/types";
import { ago, fmtDay, fmtRange, fmtTime } from "@/lib/time";

type Filter = "all" | "decisions" | "replans" | "no-shows";

const moved = (a: AuditRow) => !!a.details.room_from && !!a.details.room_to && a.details.room_from !== a.details.room_to;
const MATCH: Record<Filter, (a: AuditRow) => boolean> = {
  all: () => true,
  decisions: (a) => !moved(a) && ["pending", "waitlisted", "approved", "rejected", "cancelled"].includes(a.toStatus ?? ""),
  replans: (a) => moved(a) || a.toStatus === "bumped" || /rehome|bump|waitlist|offer|disruption|lab/.test(a.action),
  "no-shows": (a) => ["checked_in", "auto_released", "expired"].includes(a.toStatus ?? ""),
};

/** Postgres range text (`["2026-09-30 07:00:00+00","…")`) or an ISO pair → Interval; Safari can't parse the raw form. */
function intervalOf(raw: unknown): Interval | null {
  if (raw && typeof raw === "object" && "start" in raw && "end" in raw) return raw as Interval;
  if (typeof raw !== "string") return null;
  const iso = (s: string) => {
    const t = s.replace(/"/g, "").trim().replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };
  const [start, end] = raw.slice(1, -1).split(",").map(iso);
  return start && end ? { start, end } : null;
}

export function AuditFeed() {
  const { data, error, loading } = useApi("audit", () => api.audit(), { refreshMs: 5000 });
  const { room } = useRooms();
  const now = useNow(30_000);
  const [filter, setFilter] = useState<Filter>("all");
  const rows = (data ?? []).filter((a) => MATCH[filter](a));

  const code = (id: unknown) => (typeof id === "string" ? room(id)?.code : undefined);

  function describe(a: AuditRow): string {
    if (a.summary) return a.summary;
    if (a.entity === "blackout") return `Maintenance window ${a.action === "delete" ? "removed" : "set"}${code(a.details.room_id) ? ` · ${code(a.details.room_id)}` : ""}`;
    if (a.entity === "room") return `Room ${a.action === "insert" ? "added" : a.action === "delete" ? "removed" : "updated"}${code(a.details.id) ? ` · ${code(a.details.id)}` : ""}`;
    const to = code(a.details.room_to);
    const from = code(a.details.room_from);
    const when = intervalOf(a.details.during);
    const at = [to, when && fmtRange(when)].filter(Boolean).join(" · ");
    const tail = at ? ` · ${at}` : "";
    if (moved(a)) return `Moved ${from ?? "a room"} → ${to ?? "another room"}${when ? ` · ${fmtRange(when)}` : ""}`;
    switch (a.toStatus) {
      case "pending":
        return a.fromStatus === "bumped" ? `Offer accepted${tail}` : `Held${tail}`;
      case "waitlisted":
        return `Joined the waitlist${when ? ` · ${fmtRange(when)}` : ""}`;
      case "approved":
        return a.fromStatus === "waitlisted" ? `Filled from the waitlist${tail}` : `Approved${tail}`;
      case "rejected":
        return `Rejected${tail}`;
      case "cancelled":
        return `Cancelled${tail}`;
      case "expired":
        return `Hold expired${tail}`;
      case "checked_in":
        return `Checked in${tail}`;
      case "auto_released":
        return `No-show — ${from ?? to ?? "room"} released${when ? ` · ${fmtRange(when)}` : ""}`;
      case "bumped":
        return `Bumped — offered another time${tail}`;
      case "completed":
        return `Completed${tail}`;
      default:
        return `${a.action.replace(/_/g, " ")}${tail}`;
    }
  }

  return (
    <div className="flex flex-col gap-8 pt-6 pb-16 md:pt-10">
      <header className="flex flex-col gap-6">
        <Eyebrow dot="live">Audit · live</Eyebrow>
        <Headline as="h1" size="1" lead="Everything that happened," accent="and why." />
        <p className="lede max-w-2xl">Every hold, decision, check-in and re-plan is written by the database trigger — nothing changes without a trace.</p>
      </header>
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "Everything" },
          { value: "decisions", label: "Requests & decisions" },
          { value: "replans", label: "Re-plans" },
          { value: "no-shows", label: "Check-ins & no-shows" },
        ]}
      />
      {loading && !data ? (
        <Loading rows={6} />
      ) : error && !data ? (
        <ErrorNote>{error.message}</ErrorNote>
      ) : (
        <Panel tone="white" className="divide-y divide-line">
          {rows.length === 0 && <p className="p-8 text-[15px] text-fg-3">Nothing here yet.</p>}
          {rows.map((a) => {
            const body = (
              <>
                <span className="font-mono text-[13px] text-fg-3">
                  {fmtTime(a.at)}
                  <span className="block text-[11px]">{now ? ago(a.at, now) : fmtDay(a.at)}</span>
                </span>
                <span className="text-[15px] text-fg">{describe(a)}</span>
                {a.toStatus ? <StatusBadge status={a.toStatus} size="sm" className="hidden md:inline-flex" /> : <span />}
              </>
            );
            const cls = "group grid grid-cols-[5.5rem_1fr_auto] items-center gap-4 px-6 py-4 md:grid-cols-[7rem_1fr_auto_auto]";
            // Only requests have a page to open; room and blackout rows are plain lines.
            return a.entity === "request" ? (
              <Link key={a.id} href={`/r/${a.entityId}`} className={`${cls} transition-colors hover:bg-bone/70`}>
                {body}
                <ArrowUpRight className="size-4 text-fg-3 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ) : (
              <div key={a.id} className={cls}>
                {body}
                <span />
              </div>
            );
          })}
        </Panel>
      )}
    </div>
  );
}
