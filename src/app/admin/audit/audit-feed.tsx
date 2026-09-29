"use client";
// Audit log: every status change, rehome and decision, newest first, live. Owner: Nikhil (UI) · Aditi (API)
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { ErrorNote, Eyebrow, Headline, Loading, Panel, Segmented, StatusBadge } from "@/components/kit";
import { useApi } from "@/hooks/use-api";
import { useNow } from "@/hooks/use-clock";
import { api } from "@/lib/api/client";
import { ago, fmtDay, fmtTime } from "@/lib/time";

type Filter = "all" | "decisions" | "replans" | "no-shows";
const MATCH: Record<Filter, (a: string) => boolean> = {
  all: () => true,
  decisions: (a) => ["approved", "rejected", "created", "cancelled"].includes(a),
  replans: (a) => ["rehomed", "bumped", "waitlist_fill", "accepted_offer"].includes(a),
  "no-shows": (a) => ["auto_released", "checked_in", "expired"].includes(a),
};

export function AuditFeed() {
  const { data, error, loading } = useApi("audit", () => api.audit(), { refreshMs: 5000 });
  const now = useNow(30_000);
  const [filter, setFilter] = useState<Filter>("all");
  const rows = (data ?? []).filter((a) => MATCH[filter](a.action));

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
          {rows.map((a) => (
            <Link
              key={a.id}
              href={`/r/${a.entityId}`}
              className="group grid grid-cols-[5.5rem_1fr_auto] items-center gap-4 px-6 py-4 transition-colors hover:bg-bone/70 md:grid-cols-[7rem_1fr_auto_auto]"
            >
              <span className="font-mono text-[13px] text-fg-3">
                {fmtTime(a.at)}
                <span className="block text-[11px]">{now ? ago(a.at, now) : fmtDay(a.at)}</span>
              </span>
              <span className="text-[15px] text-fg">{a.summary ?? a.action}</span>
              {a.toStatus ? <StatusBadge status={a.toStatus} size="sm" className="hidden md:inline-flex" /> : <span />}
              <ArrowUpRight className="size-4 text-fg-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          ))}
        </Panel>
      )}
    </div>
  );
}
