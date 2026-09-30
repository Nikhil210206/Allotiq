"use client";
// QR check-in (phone): scan the code on the door → see this room's booking → one big button.
// Window: 10 min before start … 15 min after; after that the room is released. Owner: Nikhil (UI) · Aditi (API)
import { useState } from "react";
import { DoorOpen, LoaderCircle } from "lucide-react";
import type { AvailabilitySlot } from "@/contracts";
import { Countdown, ErrorNote, Eyebrow, Headline, Loading, Panel, RoomCode, Tag, pulseFrom } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { useNow } from "@/hooks/use-clock";
import { useRooms } from "@/hooks/use-rooms";
import { api } from "@/lib/api/client";
import { fmtRange, fmtTime, istDate } from "@/lib/time";

export function CheckIn({ code, k }: { code: string; k: string }) {
  const { rooms, loading: roomsLoading, error: roomsError, buildingName } = useRooms();
  const now = useNow();
  const room = rooms.find((r) => r.code.toLowerCase() === code.toLowerCase());
  const today = now ? istDate(now) : null;
  const { data: slots } = useApi(room && today ? `slots:${room.id}:${today}` : null, () => api.rooms.availability(room!.id, today!), {
    refreshMs: 15_000,
  });
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  // Rooms reload after every action (check-in included); only the first load shows the skeleton.
  if ((roomsLoading && !rooms.length) || !now) return <Loading rows={2} />;
  if (roomsError && !rooms.length) return <ErrorNote>Couldn&apos;t load this room — {roomsError.message}</ErrorNote>;
  if (!room) return <ErrorNote>There&apos;s no room with the code {code}. Check the sticker on the door.</ErrorNote>;

  const t = now.getTime();
  const bookings = (slots ?? []).filter((s): s is AvailabilitySlot & { requestId: string } => s.state === "booked" && !!s.requestId);
  const current = bookings.find((s) => t >= Date.parse(s.start) - 10 * 60_000 && t < Date.parse(s.end));
  const next = bookings.find((s) => Date.parse(s.start) - 10 * 60_000 > t);
  const opensAt = current ? Date.parse(current.start) - 10 * 60_000 : null;
  const closesAt = current ? Date.parse(current.start) + 15 * 60_000 : null;
  const open = current && closesAt && t <= closesAt;

  const checkIn = async (el: HTMLElement) => {
    setState("busy");
    setError(null);
    try {
      await api.checkin(room.code, k);
      pulseFrom(el);
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't check in");
      setState("idle");
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Eyebrow>Check in · {buildingName(room.buildingId)}</Eyebrow>
        <div className="flex items-center gap-3">
          <RoomCode code={room.code} className="h-9 px-3 text-base" />
          <span className="text-lg text-fg-2">{room.name}</span>
        </div>
      </div>

      {state === "done" ? (
        <Panel tone="volt" className="flex flex-col gap-4 p-8">
          <span className="grid size-14 place-items-center rounded-full bg-ink text-volt">
            <DoorOpen className="size-7" />
          </span>
          <Headline as="h1" size="2" lead="You're in." reveal={false} />
          <p className="text-lg text-ink/80">
            Checked in at {fmtTime(now)}. {current ? `The room is yours until ${fmtTime(current.end)}.` : ""}
          </p>
        </Panel>
      ) : current ? (
        <>
          <Panel tone="outline" className="flex flex-col gap-5 p-7">
            <Tag className="self-start">Booked now</Tag>
            <p className="display-3 text-fg">{current.label}</p>
            <p className="font-mono text-[15px] text-fg-2">{fmtRange(current)}</p>
            {open ? (
              <p className="text-[15px] text-fg-2">
                Check in within <Countdown to={new Date(closesAt!).toISOString()} suffix="" className="text-fg" /> or the room goes to
                the next person.
              </p>
            ) : (
              <p className="text-[15px] text-fg-2">The check-in window closed at {fmtTime(new Date(closesAt!))}.</p>
            )}
          </Panel>
          {error && <ErrorNote>{error}</ErrorNote>}
          {open && t >= opensAt! && (
            <Button variant="volt" size="xl" className="h-18 w-full text-xl" disabled={state === "busy"} onClick={(e) => checkIn(e.currentTarget)}>
              {state === "busy" ? <LoaderCircle className="animate-spin" /> : <DoorOpen />}
              Check in
            </Button>
          )}
        </>
      ) : (
        <Panel tone="white" className="flex flex-col gap-4 p-7">
          <Headline as="h1" size="3" lead="Nothing booked" accent="right now." reveal={false} />
          {next ? (
            <p className="text-[15px] text-fg-2">
              Next: <span className="font-semibold text-fg">{next.label}</span> at {fmtTime(next.start)} — check-in opens{" "}
              <Countdown to={new Date(Date.parse(next.start) - 10 * 60_000).toISOString()} suffix="from now" className="text-fg" />.
            </p>
          ) : (
            <p className="text-[15px] text-fg-2">No more bookings today. The room is free — book it from Allotiq.</p>
          )}
        </Panel>
      )}
    </div>
  );
}
