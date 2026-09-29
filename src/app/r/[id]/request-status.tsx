"use client";
// Request status (N5): live stepper, the room, what to do next, offers when plans changed, and the
// audit timeline. Updates itself as the approver acts. Owner: Nikhil
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, DoorOpen, QrCode, Users } from "lucide-react";
import type { RequestStatus } from "@/contracts/domain";
import type { Alternatives } from "@/contracts/engine";
import {
  Countdown,
  ErrorNote,
  Eyebrow,
  Headline,
  Loading,
  Panel,
  RoomCode,
  StatusBadge,
  StatusStepper,
  Tag,
  Timeline,
  toast,
} from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { useNow } from "@/hooks/use-clock";
import { useRequestLive } from "@/hooks/use-request-live";
import { useRooms } from "@/hooks/use-rooms";
import { api } from "@/lib/api/client";
import { countdown, fmtDay, fmtRange, fmtTime, fmtWhen } from "@/lib/time";

const HEADLINE: Record<RequestStatus, string> = {
  waitlisted: "On the waitlist.",
  pending: "Held for you.",
  approved: "You're booked.",
  checked_in: "You're in.",
  completed: "Done.",
  rejected: "Not this time.",
  expired: "Hold expired.",
  cancelled: "Cancelled.",
  auto_released: "Released.",
  bumped: "Pick a new slot.",
};

export function RequestStatusView({ id }: { id: string }) {
  const { data, error, loading } = useRequestLive(id);
  const { room: roomOf, buildingName } = useRooms();
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);

  if (loading && !data) return <Loading className="pt-16" rows={4} />;
  if (error && !data) return <ErrorNote className="mt-16">{error}</ErrorNote>;
  if (!data) return null;

  const r = data.request;
  const room = data.room ?? roomOf(r.roomId) ?? null;
  const offers = (r.offeredAlternatives as Alternatives | null) ?? null;
  const start = Date.parse(r.during.start);
  const t = now?.getTime() ?? 0;
  const canCancel = ["pending", "approved", "waitlisted", "bumped"].includes(r.status);
  const checkinOpen = r.status === "approved" && t >= start - 10 * 60_000 && t <= start + 15 * 60_000;

  const act = async (label: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(label);
    try {
      await fn();
      toast(done);
    } catch (e) {
      toast(e instanceof Error ? e.message : "That didn't work", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-12 pt-6 pb-10 md:pt-10">
      <Link href="/r" className="inline-flex items-center gap-2 self-start text-[15px] text-fg-3 hover:text-fg">
        <ArrowLeft className="size-4" /> My bookings
      </Link>

      <header className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={r.status} size="lg" />
          {r.status === "pending" && r.holdExpiresAt && (
            <Tag>
              Hold · <Countdown to={r.holdExpiresAt} className="ml-1" />
            </Tag>
          )}
          {["approved", "pending"].includes(r.status) && now && start > t && <Tag>Starts in {countdown(start - t)}</Tag>}
        </div>
        <Headline as="h1" size="2" lead={r.title} accent={HEADLINE[r.status]} />
      </header>

      <Panel tone="white" className="p-6 md:p-8">
        <StatusStepper status={r.status} />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-5">
          <Panel tone="outline" className="flex flex-col gap-6 p-6 md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              {room ? (
                <div className="flex items-center gap-3.5">
                  <RoomCode code={room.code} />
                  <div>
                    <p className="display-4 text-fg">{room.name}</p>
                    <p className="mt-1 text-sm text-fg-3">
                      {buildingName(room.buildingId)} · {room.capacity} seats
                      {room.systemsCount ? ` · ${room.systemsCount} systems` : ""}
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="display-4 text-fg">No room yet</p>
                  <p className="mt-1 text-sm text-fg-3">
                    {r.status === "waitlisted" ? "You'll get the first room that frees up and fits." : "Pick one of the options below."}
                  </p>
                </div>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-6 md:grid-cols-3">
              <Fact label="When" value={fmtDay(r.during.start)} sub={fmtRange(r.during)} />
              <Fact label="People" value={String(r.headcount)} sub={r.minSystems ? `${r.minSystems} systems` : undefined} />
              <Fact label="Needs" value={r.requiredFeatures.length ? r.requiredFeatures.map((f) => f.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase())).join(", ") : "Nothing special"} />
            </dl>
            {r.decisionReason && (
              <p className="rounded-2xl bg-[#fbe2e1] px-4 py-3 text-[15px] text-[#a1161b]">
                <span className="font-semibold">Approver&apos;s note:</span> {r.decisionReason}
              </p>
            )}
          </Panel>

          {offers && (offers.sameRoomOtherSlot.length > 0 || offers.similarRoomSameSlot.length > 0) && (
            <Panel tone="ink" className="flex flex-col gap-5 p-6 md:p-8">
              <div>
                <Tag>Never a bare no</Tag>
                <p className="mt-3 text-lg text-fg">
                  {r.status === "bumped"
                    ? "Your room became unavailable. These work instead — one tap to take it."
                    : "These were free when your request was reviewed."}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {[
                  ...offers.sameRoomOtherSlot.map((o) => ({ roomId: o.roomId, during: o.interval })),
                  ...offers.similarRoomSameSlot.map((o) => ({ roomId: o.roomId, during: r.during })),
                ].map((o) => (
                  <button
                    key={`${o.roomId}-${o.during.start}`}
                    type="button"
                    disabled={!!busy}
                    onClick={() => act("offer", () => api.requests.acceptOffer(r.id, o.roomId, o.during), "New slot held for you")}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.05] px-4 py-3 text-left ring-1 ring-line transition-colors hover:bg-white/[0.1] disabled:opacity-50"
                  >
                    <span className="flex items-center gap-3">
                      <RoomCode code={roomOf(o.roomId)?.code ?? "Room"} />
                      <span className="text-[15px] text-fg">{fmtWhen(o.during)}</span>
                    </span>
                    <ArrowRight className="size-4 text-fg-3" />
                  </button>
                ))}
              </div>
            </Panel>
          )}

          <Panel tone="white" className="flex flex-col gap-6 p-6 md:p-8">
            <Eyebrow>What happened</Eyebrow>
            <Timeline entries={data.timeline} roomCode={(rid) => roomOf(typeof rid === "string" ? rid : null)?.code} />
          </Panel>
        </div>

        <div className="flex flex-col gap-5">
          {room && ["approved", "pending"].includes(r.status) && (
            <Panel tone="volt" className="flex flex-col gap-4 p-6 md:p-8">
              <span className="grid size-11 place-items-center rounded-full bg-ink/10">
                <QrCode className="size-5" />
              </span>
              <p className="display-4">Check in at the door</p>
              <p className="text-[15px] text-ink/80">
                Scan the code on {room.code} between {fmtTime(new Date(start - 10 * 60_000))} and{" "}
                {fmtTime(new Date(start + 15 * 60_000))}. No check-in by then and the room goes to the next person.
              </p>
              {checkinOpen && (
                <Link href={`/c/${room.code}`} className={buttonVariants({ size: "lg", className: "self-start" })}>
                  <DoorOpen /> Check in now
                </Link>
              )}
            </Panel>
          )}
          {r.status === "waitlisted" && (
            <Panel tone="mint" className="flex flex-col gap-3 p-6 md:p-8">
              <span className="grid size-11 place-items-center rounded-full bg-ink/10">
                <Users className="size-5" />
              </span>
              <p className="display-4">You&apos;re in line</p>
              <p className="text-[15px] text-ink/80">
                When a booking is cancelled or nobody shows up, the room goes to the best fit on the waitlist — we&apos;ll
                tell you straight away.
              </p>
            </Panel>
          )}
          <Panel tone="white" className="flex flex-col gap-3 p-6 md:p-8">
            <p className="eyebrow text-fg-3">Actions</p>
            {canCancel ? (
              <Button
                variant="outline"
                disabled={!!busy}
                onClick={() => act("cancel", () => api.requests.cancel(r.id), "Booking cancelled — the room is free again")}
              >
                Cancel this booking
              </Button>
            ) : (
              <p className="text-[15px] text-fg-3">Nothing to do here.</p>
            )}
            <Link href="/r/new" className={buttonVariants({ variant: "ghost" })}>
              Make another request
            </Link>
            {r.status === "approved" && (
              <Button
                variant="link"
                className="self-start text-fg-3"
                disabled={!!busy}
                onClick={() => act("sim", () => api.demo.simulateCheckin(r.id), "Checked in (simulated)")}
              >
                Demo: simulate check-in
              </Button>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="eyebrow text-fg-3">{label}</dt>
      <dd className="mt-2 text-[17px] font-semibold text-fg">{value}</dd>
      {sub && <dd className="text-[15px] text-fg-2">{sub}</dd>}
    </div>
  );
}
