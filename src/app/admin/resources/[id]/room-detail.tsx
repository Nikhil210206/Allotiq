"use client";
// One room: edit it, close it for maintenance, print its check-in QR, and see its day.
// Owner: Nikhil (UI) · Aditi (API)
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Printer, SearchX, Trash2, Wrench } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { AvailabilitySlot } from "@/contracts";
import { DayGrid, EmptyState, ErrorNote, Eyebrow, Field, Headline, Input, Loading, Panel, RoomCode, Tag, toast } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { useNow } from "@/hooks/use-clock";
import { useRooms } from "@/hooks/use-rooms";
import { DATA_EVENT, api } from "@/lib/api/client";
import { addDaysIso, fmtDay, fmtRange, fmtWhen, istDate, istMinutes, relDay, toIso } from "@/lib/time";
import { RoomForm, TYPE_LABEL } from "../room-form";

export function RoomDetail({ id }: { id: string }) {
  const { room: roomOf, buildingName, loading, error, rooms } = useRooms();
  const room = roomOf(id);
  const now = useNow(60_000);
  const { data: blackouts } = useApi(`blackouts:${id}`, () => api.rooms.blackouts(id));
  const { data: qr } = useApi(`qr:${id}`, () => api.rooms.qr(id));
  const [day, setDay] = useState<string | null>(null);
  const [slots, setSlots] = useState<AvailabilitySlot[] | undefined>(undefined);
  const [origin, setOrigin] = useState("");
  const shownDay = day ?? (now ? istDate(now) : null);

  useEffect(() => {
    const t = setTimeout(() => setOrigin(window.location.origin), 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!shownDay) return;
    let live = true;
    // On failure the grid keeps its last good day (or keeps shimmering) — never shows a failed day as free.
    const load = () =>
      api.rooms
        .availability(id, shownDay)
        .then((s) => live && setSlots(s))
        .catch(() => undefined);
    void load();
    window.addEventListener(DATA_EVENT, load);
    return () => {
      live = false;
      window.removeEventListener(DATA_EVENT, load);
    };
  }, [id, shownDay]);

  if (loading && !rooms.length) return <Loading className="pt-16" rows={3} />;
  if (error && !rooms.length) return <ErrorNote className="mt-16">{error.message}</ErrorNote>;
  if (!room)
    return (
      <EmptyState
        className="mt-16"
        icon={<SearchX />}
        title="No such room."
        body="It may have been removed from the catalog."
        action={
          <Link href="/admin/resources" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft /> All resources
          </Link>
        }
      />
    );
  const qrUrl = qr ? `${origin}${qr.path}` : "";

  return (
    <div className="flex flex-col gap-10 pt-6 pb-16 md:pt-10">
      <Link href="/admin/resources" className="inline-flex items-center gap-2 self-start text-[15px] text-fg-3 hover:text-fg">
        <ArrowLeft className="size-4" /> All rooms
      </Link>
      <header className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <RoomCode code={room.code} className="h-9 px-3 text-base" />
          <Tag>{TYPE_LABEL[room.type]}</Tag>
          <Tag className={room.isActive ? "bg-[#d6f2df] text-[#0b5a2f]" : ""}>{room.isActive ? "In service" : "Off"}</Tag>
        </div>
        <Headline as="h1" size="2" lead={room.name} accent={`${buildingName(room.buildingId)}.`} />
      </header>

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous day" onClick={() => shownDay && setDay(addDaysIso(shownDay, -1))} className="grid size-9 place-items-center rounded-full bg-fg/[0.06]">
            <ChevronLeft className="size-4" />
          </button>
          <p className="min-w-40 px-2 font-semibold text-fg">{shownDay && now ? `${relDay(toIso(shownDay, "12:00"), now)} · ${fmtDay(toIso(shownDay, "12:00"))}` : ""}</p>
          <button type="button" aria-label="Next day" onClick={() => shownDay && setDay(addDaysIso(shownDay, 1))} className="grid size-9 place-items-center rounded-full bg-fg/[0.06]">
            <ChevronRight className="size-4" />
          </button>
        </div>
        <DayGrid rooms={[room]} slots={{ [room.id]: slots }} nowMinutes={shownDay === (now && istDate(now)) && now ? istMinutes(now) : null} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Panel tone="white" className="p-6 md:p-8">
          <Eyebrow className="mb-6">Details</Eyebrow>
          <RoomForm
            key={room.id}
            room={room}
            submitLabel="Save changes"
            onSubmit={async (input) => {
              await api.rooms.update(room.id, input);
              toast(`${input.code} saved`);
            }}
          />
        </Panel>
        <div className="flex flex-col gap-5">
          <Panel tone="volt" className="flex flex-col items-start gap-5 p-6 md:p-8 print:shadow-none">
            <Eyebrow className="text-ink/60">Check-in code</Eyebrow>
            <div className="rounded-2xl bg-white p-4">{qrUrl ? <QRCodeSVG value={qrUrl} size={168} level="M" /> : <div className="size-[168px]" />}</div>
            <p className="text-[15px] text-ink/80">
              Stick this on the door of {room.code}. Scanning it checks in the current booking — no app needed.
            </p>
            <Button variant="default" onClick={() => window.print()}>
              <Printer /> Print
            </Button>
          </Panel>
          <Blackouts roomId={room.id} items={blackouts ?? []} />
        </div>
      </div>
    </div>
  );
}

function Blackouts({ roomId, items }: { roomId: string; items: { id: string; during: { start: string; end: string }; reason: string }[] }) {
  const now = useNow(60_000);
  const [date, setDate] = useState("");
  const [from, setFrom] = useState("08:00");
  const [to, setTo] = useState("20:00");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const d = date || (now ? addDaysIso(istDate(now), 1) : "");
    if (!d || reason.trim().length < 2 || to <= from) return toast("Add a day, a window and a reason", "error");
    setBusy(true);
    try {
      await api.rooms.addBlackout(roomId, { start: toIso(d, from), end: toIso(d, to) }, reason.trim());
      toast("Closed for maintenance — use Disruptions to re-plan bookings");
      setReason("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't add", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel tone="white" className="flex flex-col gap-5 p-6 md:p-8">
      <Eyebrow>Maintenance windows</Eyebrow>
      {items.length === 0 ? (
        <p className="text-[15px] text-fg-3">None planned.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 rounded-2xl bg-bone px-4 py-3">
              <span className="text-[15px]">
                <span className="font-semibold">{b.reason}</span>
                <span className="text-fg-3"> · {fmtWhen(b.during)}</span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${b.reason}`}
                onClick={() => api.rooms.removeBlackout(b.id).then(() => toast("Removed"))}
                className="text-fg-3 hover:text-[#c4262b]"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="grid grid-cols-2 gap-4 border-t border-line pt-5">
        <Field label="Day" className="col-span-2">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="From">
          <Input type="time" step={1800} value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="time" step={1800} value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Reason" className="col-span-2">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="AC maintenance" />
        </Field>
        <Button type="submit" variant="outline" className="col-span-2" disabled={busy}>
          <Wrench /> Close for maintenance
        </Button>
        <p className="col-span-2 text-[13px] text-fg-3">
          To move the bookings inside the window as well, use{" "}
          <Link href="/admin/disruptions" className="underline underline-offset-4">
            Disruptions
          </Link>{" "}
          — it previews the re-plan first. {items[0] ? `Next: ${fmtRange(items[0].during)}.` : ""}
        </p>
      </form>
    </Panel>
  );
}
