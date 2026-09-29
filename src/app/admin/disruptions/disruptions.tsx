"use client";
// Disruptions (demo scene 3): close a room for a window → preview who's affected and the engine's
// re-plan (rehomed or offered another time) → apply, which notifies everyone. Owner: Nikhil
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Check, LoaderCircle, Wrench } from "lucide-react";
import type { DisruptionPreviewResponse, RequestDetail } from "@/contracts";
import type { PlanMove } from "@/contracts/engine";
import { ChipToggle, ErrorNote, Eyebrow, Field, Headline, Input, Panel, RoomCode, Select, StatusBadge, Tag, toast } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-clock";
import { useRooms } from "@/hooks/use-rooms";
import { api } from "@/lib/api/client";
import type { RequestRow } from "@/lib/api/types";
import { addDaysIso, fmtDay, fmtRange, fmtWhen, istDate, toIso } from "@/lib/time";

const REASONS = ["AC maintenance", "Electrical work", "Deep cleaning", "Exam setup"];

export function Disruptions() {
  const now = useNow(60_000);
  const { rooms, room: roomOf } = useRooms();
  const [roomId, setRoomId] = useState("");
  const [date, setDate] = useState("");
  const [from, setFrom] = useState("08:00");
  const [to, setTo] = useState("20:00");
  const [reason, setReason] = useState(REASONS[0]);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [preview, setPreview] = useState<DisruptionPreviewResponse | null>(null);
  const [details, setDetails] = useState<Record<string, RequestRow>>({});
  const [applied, setApplied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Demo default: UB Seminar Hall, tomorrow (Thursday), all day.
  useEffect(() => {
    if (roomId || !rooms.length || !now) return;
    const t = setTimeout(() => {
      setRoomId(rooms.find((r) => r.code === "UB-SEM")?.id ?? rooms[0].id);
      setDate(addDaysIso(istDate(now), 1));
    }, 0);
    return () => clearTimeout(t);
  }, [rooms, now, roomId]);

  const run = async (e: FormEvent) => {
    e.preventDefault();
    if (!roomId || !date || to <= from) return setError("Pick a room, a day and a window that ends after it starts.");
    setBusy("preview");
    setError(null);
    setApplied(null);
    try {
      const p = await api.disruptions.preview(roomId, { start: toIso(date, from), end: toIso(date, to) }, reason);
      setPreview(p);
      const got = await Promise.all(p.plan.moves.map((m) => api.requests.get(m.requestId).catch(() => null)));
      setDetails(Object.fromEntries(got.filter((d): d is RequestDetail & { request: RequestRow } => !!d).map((d) => [d.request.id, d.request])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't preview that");
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    if (!preview) return;
    setBusy("apply");
    try {
      const res = await api.disruptions.apply(preview.previewId);
      setApplied(res.summary ?? preview.plan.summary);
      toast(`Applied — ${preview.affected} people notified`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't apply", "error");
    } finally {
      setBusy(null);
    }
  };

  const rehomed = preview?.plan.moves.filter((m) => m.roomId).length ?? 0;
  const offered = preview?.plan.moves.filter((m) => !m.roomId).length ?? 0;
  const closed = roomOf(roomId);

  return (
    <div className="flex flex-col gap-10 pt-6 pb-16 md:pt-10">
      <header className="flex flex-col gap-6">
        <Eyebrow>Disruptions</Eyebrow>
        <Headline as="h1" size="1" lead="Plans change." accent="Nobody gets a bare no." />
        <p className="lede max-w-2xl">
          Close a room for maintenance and the engine re-plans every booking in it: same time in an equal room where it
          can, the best other time where it can&apos;t. Nothing is written until you apply.
        </p>
      </header>

      <form onSubmit={run}>
        <Panel tone="white" className="grid gap-6 p-6 md:grid-cols-6 md:p-8">
          <Field label="Room" className="md:col-span-2">
            <Select value={roomId} onChange={(e) => (setRoomId(e.target.value), setPreview(null))}>
              {rooms
                .filter((r) => r.isActive)
                .sort((a, b) => a.code.localeCompare(b.code))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} — {r.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Day" className="md:col-span-2" hint={date ? fmtDay(toIso(date, "12:00")) : undefined}>
            <Input type="date" value={date} onChange={(e) => (setDate(e.target.value), setPreview(null))} />
          </Field>
          <Field label="From" className="md:col-span-1">
            <Input type="time" step={1800} value={from} onChange={(e) => (setFrom(e.target.value), setPreview(null))} />
          </Field>
          <Field label="To" className="md:col-span-1">
            <Input type="time" step={1800} value={to} onChange={(e) => (setTo(e.target.value), setPreview(null))} />
          </Field>
          <Field label="Reason — everyone affected sees it" className="md:col-span-4">
            <div className="flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <ChipToggle key={r} selected={reason === r} onToggle={() => setReason(r)}>
                  {r}
                </ChipToggle>
              ))}
            </div>
          </Field>
          <div className="flex items-end md:col-span-2 md:justify-end">
            <Button type="submit" size="xl" disabled={busy !== null}>
              {busy === "preview" ? <LoaderCircle className="animate-spin" /> : <Wrench />} Preview impact
            </Button>
          </div>
        </Panel>
      </form>

      {error && <ErrorNote>{error}</ErrorNote>}

      {preview && (
        <section className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <p className="display-2 max-w-4xl text-fg">
              {preview.affected} affected · {rehomed} rehomed
              {offered ? (
                <>
                  {" "}
                  · <span className="serif-accent text-hl">{offered} offered another time.</span>
                </>
              ) : (
                "."
              )}
            </p>
            {applied ? (
              <Tag className="h-9 bg-volt px-4 text-ink">
                <Check className="mr-1.5 size-3.5" /> Applied · notified
              </Tag>
            ) : (
              <Button variant="volt" size="xl" disabled={busy !== null || preview.affected === 0} onClick={apply}>
                {busy === "apply" ? <LoaderCircle className="animate-spin" /> : <Check />} Apply &amp; notify
              </Button>
            )}
          </div>
          {preview.affected === 0 ? (
            <Panel tone="white" className="p-8 text-lg text-fg-2">
              Nothing is booked in {closed?.code} then — closing it affects nobody.
            </Panel>
          ) : (
            <ul className="flex flex-col gap-3">
              {preview.plan.moves.map((m) => (
                <MoveRow key={m.requestId} m={m} r={details[m.requestId]} fromCode={closed?.code ?? ""} codeOf={(id) => roomOf(id)?.code ?? "Room"} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function MoveRow({ m, r, fromCode, codeOf }: { m: PlanMove; r?: RequestRow; fromCode: string; codeOf: (id: string) => string }) {
  const offer = m.offers?.sameRoomOtherSlot[0];
  return (
    <li className="light grid items-center gap-4 rounded-[1.5rem] bg-white p-5 text-ink ring-1 ring-line md:grid-cols-[1.3fr_auto_1.2fr] md:p-6">
      <div className="min-w-0">
        <p className="truncate text-[17px] font-semibold">{r?.title ?? "Booking"}</p>
        <p className="mt-1 text-[14px] text-fg-3">
          {r?.requester?.fullName} · {r ? fmtRange(r.during) : ""} · {r?.headcount} people
        </p>
      </div>
      <div className="flex items-center gap-2">
        <RoomCode code={fromCode} className="line-through decoration-2 opacity-60" />
        <ArrowRight className="size-4 text-fg-3" />
      </div>
      {m.roomId ? (
        <div className="flex flex-wrap items-center gap-3">
          <RoomCode code={codeOf(m.roomId)} />
          <span className="text-[15px] text-fg-2">Same time — rehomed</span>
          <StatusBadge status="approved" size="sm" />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {offer ? (
            <>
              <RoomCode code={codeOf(offer.roomId)} />
              <span className="text-[15px] text-fg-2">Offered {fmtWhen(offer.interval)}</span>
            </>
          ) : (
            <span className="text-[15px] text-fg-2">No equal room — offered the waitlist</span>
          )}
          <StatusBadge status="bumped" size="sm" />
        </div>
      )}
    </li>
  );
}
