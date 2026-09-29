"use client";
// My bookings (N5): upcoming and past requests with live status. Owner: Nikhil
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CalendarPlus, Inbox } from "lucide-react";
import { Countdown, EmptyState, ErrorNote, Loading, PageHeader, RollLabel, RoomCode, Segmented, StatusBadge } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { useNow } from "@/hooks/use-clock";
import { useRooms } from "@/hooks/use-rooms";
import { api } from "@/lib/api/client";
import type { RequestRow } from "@/lib/api/types";
import { fmtRange, relDay } from "@/lib/time";
import { cn } from "@/lib/utils";

const OPEN = new Set(["pending", "approved", "checked_in", "waitlisted", "bumped"]);

export function MyBookings() {
  const { data, error, loading } = useApi("mine", api.requests.mine, { refreshMs: 8000 });
  const { room } = useRooms();
  const now = useNow(30_000);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const t = now?.getTime() ?? 0;
  const all = data ?? [];
  const upcoming = all
    .filter((r) => OPEN.has(r.status) && Date.parse(r.during.end) > t)
    .sort((a, b) => a.during.start.localeCompare(b.during.start));
  const past = all.filter((r) => !upcoming.includes(r)).sort((a, b) => b.during.start.localeCompare(a.during.start));
  const rows = tab === "upcoming" ? upcoming : past;

  return (
    <div className="flex flex-col pb-10">
      <PageHeader
        eyebrow="My bookings"
        lead="Your bookings."
        accent="All in one place."
        lede="Holds, approvals and anything the engine re-planned for you — live."
        actions={
          <Link href="/r/new" className={buttonVariants({ size: "xl" })}>
            <CalendarPlus />
            <RollLabel>New request</RollLabel>
          </Link>
        }
      />
      <div className="mb-6 flex items-center justify-between gap-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "upcoming", label: `Upcoming · ${upcoming.length}` },
            { value: "past", label: `Past · ${past.length}` },
          ]}
        />
      </div>
      {loading && !data ? (
        <Loading rows={4} />
      ) : error && !data ? (
        <ErrorNote>{error.message}</ErrorNote>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          eyebrow={tab === "upcoming" ? "Nothing coming up" : "No history yet"}
          title={tab === "upcoming" ? "Need a room? Just say it." : "Your past bookings land here."}
          body="Type or say what you need — the engine finds the best room and holds it while it's approved."
          action={
            <Link href="/r/new" className={buttonVariants({})}>
              New request
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <BookingRow key={r.id} r={r} code={room(r.roomId)?.code} roomName={room(r.roomId)?.name} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BookingRow({ r, code, roomName, now }: { r: RequestRow; code?: string; roomName?: string; now: Date | null }) {
  const d = new Date(r.during.start);
  const day = d.toLocaleDateString("en-IN", { day: "numeric", timeZone: "Asia/Kolkata" });
  const mon = d.toLocaleDateString("en-IN", { month: "short", timeZone: "Asia/Kolkata" });
  return (
    <li>
      <Link
        href={`/r/${r.id}`}
        className={cn(
          "group flex items-center gap-5 rounded-[1.5rem] bg-white p-4 pr-6 ring-1 ring-line transition-[box-shadow,transform] hover:ring-ink/30 md:gap-7 md:p-5 md:pr-8",
          ["completed", "cancelled", "expired", "rejected", "auto_released"].includes(r.status) && "bg-white/60",
        )}
      >
        <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-bone text-center md:size-20">
          <p className="figure text-[1.9rem] text-fg md:text-[2.4rem]">{day}</p>
          <p className="-mt-1 font-mono text-[10px] tracking-[0.14em] text-fg-3 uppercase">{mon}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold text-fg md:text-lg">{r.title}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-fg-2">
            {code ? <RoomCode code={code} /> : <span className="text-fg-3">No room yet</span>}
            <span className="hidden md:inline">{roomName}</span>
            <span className="font-mono text-[13px] text-fg-3">
              {now ? relDay(r.during.start, now) : ""} · {fmtRange(r.during)}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusBadge status={r.status} />
          {r.status === "pending" && r.holdExpiresAt && (
            <span className="text-xs text-fg-3">
              hold <Countdown to={r.holdExpiresAt} />
            </span>
          )}
        </div>
        <ArrowRight className="hidden size-5 shrink-0 text-fg-3 transition-transform group-hover:translate-x-1 md:block" />
      </Link>
    </li>
  );
}
