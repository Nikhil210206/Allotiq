"use client";
// Review one request on a phone: the fit at a glance, then big Approve / Reject. Rejecting needs a
// reason (chips) and always sends the requester alternatives. Owner: Nikhil (UI) · Aditi (API)
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Check, X } from "lucide-react";
import {
  ChipToggle,
  Countdown,
  ErrorNote,
  Eyebrow,
  Headline,
  Loading,
  Panel,
  RoomCode,
  StatusBadge,
  Tag,
  Textarea,
  WhyList,
  toast,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useRequestLive } from "@/hooks/use-request-live";
import { useRooms } from "@/hooks/use-rooms";
import { api } from "@/lib/api/client";
import { fmtDay, fmtRange } from "@/lib/time";
import { PURPOSE_TAG, requesterLine } from "../approval-queue";

const REASONS = [
  "Room is needed for an exam",
  "Not enough notice",
  "Needs a department sign-off",
  "Better suited to another room",
  "Duplicate request",
];

export function ApprovalReview({ id }: { id: string }) {
  const router = useRouter();
  const { data, error, loading } = useRequestLive(id);
  const { room: roomOf, buildingName } = useRooms();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <Loading className="mx-auto w-full max-w-3xl pt-16" rows={3} />;
  if (error && !data) return <ErrorNote className="mx-auto mt-16 w-full max-w-3xl">{error}</ErrorNote>;
  if (!data) return null;
  const r = data.request;
  const room = data.room ?? roomOf(r.roomId);
  const decided = r.status !== "pending";

  const fit = room
    ? [
        `${room.capacity} seats for ${r.headcount} people${room.capacity - r.headcount <= 10 ? " — a snug fit" : ""}`,
        ...(r.minSystems ? [`${room.systemsCount} systems for ${r.minSystems} needed`] : []),
        ...(r.requiredFeatures.length ? [`Has ${r.requiredFeatures.join(", ").replace(/_/g, " ")}`] : []),
        `${buildingName(room.buildingId)}, open ${room.openTime}–${room.closeTime}`,
      ]
    : [];

  const decide = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast(done);
      router.push("/approvals");
    } catch (e) {
      toast(e instanceof Error ? e.message : "That didn't work", "error");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 pt-6 pb-40 md:pt-10">
      <Link href="/approvals" className="inline-flex items-center gap-2 self-start text-[15px] text-fg-3 hover:text-fg">
        <ArrowLeft className="size-4" /> Queue
      </Link>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={r.status} size="lg" />
          <Tag className={r.purpose === "exam" ? "bg-volt text-ink" : undefined}>{PURPOSE_TAG[r.purpose]}</Tag>
        </div>
        <Headline as="h1" size="2" lead={r.title} accent={requesterLine(r) || undefined} />
        {r.status === "pending" && r.holdExpiresAt && (
          <p className="text-[15px] text-fg-2">
            Hold expires in <Countdown to={r.holdExpiresAt} suffix="" className="text-fg" /> — after that the room frees
            up by itself.
          </p>
        )}
      </div>

      <Panel tone="outline" className="flex flex-col gap-6 p-6 md:p-8">
        <div className="flex items-center gap-3.5">
          {room && <RoomCode code={room.code} />}
          <div>
            <p className="display-4 text-fg">{room?.name ?? "No room"}</p>
            <p className="mt-1 text-sm text-fg-3">
              {fmtDay(r.during.start)} · {fmtRange(r.during)}
            </p>
          </div>
        </div>
        <div className="border-t border-line pt-6">
          <Eyebrow className="mb-4">Why this room fits</Eyebrow>
          <WhyList items={fit} />
        </div>
      </Panel>

      {rejecting && !decided && (
        <Panel tone="white" className="flex flex-col gap-5 p-6 md:p-8">
          <Eyebrow>Reason — the requester sees this</Eyebrow>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((x) => (
              <ChipToggle key={x} selected={reason === x} onToggle={() => setReason(reason === x ? "" : x)}>
                {x}
              </ChipToggle>
            ))}
          </div>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Or write your own…" rows={2} />
          <p className="text-[13px] text-fg-3">They&apos;ll also get the engine&apos;s alternatives — other times and similar rooms.</p>
        </Panel>
      )}

      {!decided && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bone/90 backdrop-blur-md">
          <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3 px-6 py-4">
            {rejecting ? (
              <>
                <Button variant="outline" size="xl" disabled={busy} onClick={() => setRejecting(false)}>
                  Back
                </Button>
                <Button
                  size="xl"
                  disabled={busy || reason.trim().length < 2}
                  onClick={() => decide(() => api.requests.reject(r.id, reason.trim()), "Rejected — alternatives sent")}
                  className="bg-[#c4262b] text-white hover:bg-[#a91f24]"
                >
                  <X /> Reject
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="xl" disabled={busy} onClick={() => setRejecting(true)}>
                  <X /> Reject
                </Button>
                <Button variant="volt" size="xl" disabled={busy} onClick={() => decide(() => api.requests.approve(r.id), `Approved · ${r.title}`)}>
                  <Check /> Approve
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
