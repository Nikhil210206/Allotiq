"use client";
// Approver queue (mobile-first): every hold waiting on me, soonest-expiring first, one tap to approve.
// Owner: Nikhil (UI) · Aditi (API)
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, Inbox } from "lucide-react";
import type { Purpose } from "@/contracts/domain";
import { Countdown, EmptyState, ErrorNote, Eyebrow, Headline, Loading, RoomCode, StatusBadge, Tag, toast } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { useNow } from "@/hooks/use-clock";
import { useRooms } from "@/hooks/use-rooms";
import { api } from "@/lib/api/client";
import type { RequestRow } from "@/lib/api/types";
import { fmtRange, relDay } from "@/lib/time";

export const PURPOSE_TAG: Record<Purpose, string> = {
  exam: "Exam · top priority",
  academic: "Class / lab",
  department_event: "Department event",
  club_event: "Club event",
  meeting: "Meeting",
  student_activity: "Student activity",
};

export function requesterLine(r: RequestRow) {
  const who = r.requester;
  if (!who) return "";
  if (who.kind === "club" || who.kind === "department") return who.fullName;
  return `${who.fullName}${who.kind ? ` · ${who.kind[0].toUpperCase()}${who.kind.slice(1)}` : ""}`;
}

export function ApprovalQueue() {
  const { data, error, loading } = useApi("approvals", api.approvals, { refreshMs: 5000 });
  const [gone, setGone] = useState<Set<string>>(new Set());
  // Soonest-expiring hold first, as the page promises; the API doesn't guarantee an order.
  const rows = (data ?? [])
    .filter((r) => !gone.has(r.id))
    .sort((a, b) => (a.holdExpiresAt ?? "￿").localeCompare(b.holdExpiresAt ?? "￿") || a.during.start.localeCompare(b.during.start));

  const approve = async (r: RequestRow) => {
    setGone((g) => new Set(g).add(r.id));
    try {
      await api.requests.approve(r.id);
      toast(`Approved · ${r.title}`);
    } catch (e) {
      setGone((g) => {
        const n = new Set(g);
        n.delete(r.id);
        return n;
      });
      toast(e instanceof Error ? e.message : "Couldn't approve", "error");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 pt-6 pb-16 md:pt-10">
      <div className="flex flex-col gap-5">
        <Eyebrow>Approvals</Eyebrow>
        <Headline
          as="h1"
          size="2"
          lead={rows.length ? "Waiting on you." : "All clear."}
          accent={rows.length ? `${rows.length} request${rows.length === 1 ? "" : "s"}.` : "Nothing to approve."}
        />
        <p className="lede">Holds expire on their own, so the soonest are first. Rejecting always sends alternatives.</p>
      </div>
      {loading && !data ? (
        <Loading rows={3} />
      ) : error && !data ? (
        <ErrorNote>{error.message}</ErrorNote>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title="No requests waiting"
          body="New requests for your rooms land here the moment they're held."
          action={
            <Link href="/availability" className={buttonVariants({ variant: "secondary" })}>
              See today&apos;s grid
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((r) => (
            <QueueCard key={r.id} r={r} onApprove={() => approve(r)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function QueueCard({ r, onApprove }: { r: RequestRow; onApprove: () => void }) {
  const { room } = useRooms();
  const now = useNow(30_000);
  const rm = room(r.roomId);
  return (
    <li className="light flex flex-col gap-5 rounded-[1.75rem] bg-white p-5 text-ink ring-1 ring-line md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status="pending" />
          <Tag className={r.purpose === "exam" ? "bg-volt text-ink" : undefined}>{PURPOSE_TAG[r.purpose]}</Tag>
        </div>
        {r.holdExpiresAt && (
          <span className="text-[13px] text-fg-3">
            expires in <Countdown to={r.holdExpiresAt} suffix="" className="text-fg" />
          </span>
        )}
      </div>
      <div>
        <p className="display-4 text-fg">{r.title}</p>
        <p className="mt-1.5 text-[15px] text-fg-2">{requesterLine(r)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px] text-fg-2">
        {rm && <RoomCode code={rm.code} />}
        <span className="font-mono text-[13px]">
          {now ? relDay(r.during.start, now) : ""} · {fmtRange(r.during)}
        </span>
        <span>
          {r.headcount} people{rm ? ` · ${rm.capacity} seats` : ""}
          {r.minSystems ? ` · ${r.minSystems} systems` : ""}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Button variant="volt" size="lg" onClick={onApprove}>
          <Check /> Approve
        </Button>
        <Link href={`/approvals/${r.id}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
          Review <ArrowRight />
        </Link>
      </div>
    </li>
  );
}
