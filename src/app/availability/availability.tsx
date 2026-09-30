"use client";
// Availability (N6): the day grid, filtered by day, building and room type. Click a free slot to
// start a request for that room and time. Owner: Nikhil
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, SearchX } from "lucide-react";
import type { AvailabilitySlot } from "@/contracts";
import type { RoomType } from "@/contracts/domain";
import { EmptyState, ErrorNote, Loading, PageHeader, Segmented, Select } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { DayGrid, GridLegend } from "@/components/kit/day-grid";
import { useNow } from "@/hooks/use-clock";
import { useRooms } from "@/hooks/use-rooms";
import { DATA_EVENT, api } from "@/lib/api/client";
import { BUILDINGS } from "@/lib/campus";
import { addDaysIso, fmtDayLong, hhmmOf, istDate, istMinutes, relDay, toIso } from "@/lib/time";

type TypeFilter = RoomType | "all";
const TYPES: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "lab", label: "Labs" },
  { value: "classroom", label: "Classrooms" },
  { value: "seminar_hall", label: "Halls" },
  { value: "meeting_room", label: "Meeting rooms" },
];

export function Availability() {
  const router = useRouter();
  const now = useNow(60_000);
  const { rooms, buildingCode, loading: roomsLoading, error: roomsError } = useRooms();
  const [date, setDate] = useState<string | null>(null);
  const [type, setType] = useState<TypeFilter>("lab");
  const [building, setBuilding] = useState("");
  const [slots, setSlots] = useState<Record<string, AvailabilitySlot[] | undefined>>({});
  /** Rooms whose schedule didn't load on the last attempt (they keep their last good schedule, if any). */
  const [failed, setFailed] = useState(0);
  const day = date ?? (now ? istDate(now) : null);

  const shown = useMemo(
    () =>
      rooms
        .filter((r) => r.isActive && (type === "all" || r.type === type) && (!building || r.buildingId === building))
        .sort((a, b) => a.code.localeCompare(b.code)),
    [rooms, type, building],
  );

  useEffect(() => {
    if (!day || !shown.length) return;
    let live = true;
    // A failed room must never read as "free": it keeps its last good schedule (or keeps shimmering)
    // and the page says so; the 20-second refresh retries it.
    const load = () =>
      Promise.all(shown.map(async (r) => [`${day}|${r.id}`, await api.rooms.availability(r.id, day).catch(() => null)] as const)).then(
        (pairs) => {
          if (!live) return;
          const loaded: Record<string, AvailabilitySlot[]> = {};
          for (const [key, list] of pairs) if (list) loaded[key] = list;
          setSlots((s) => ({ ...s, ...loaded }));
          setFailed(pairs.length - Object.keys(loaded).length);
        },
      );
    void load();
    window.addEventListener(DATA_EVENT, load);
    const t = setInterval(load, 20_000);
    return () => {
      live = false;
      window.removeEventListener(DATA_EVENT, load);
      clearInterval(t);
    };
  }, [day, shown]);

  const today = now ? istDate(now) : null;
  const gridSlots = Object.fromEntries(shown.map((r) => [r.id, slots[`${day}|${r.id}`]]));

  return (
    <div className="flex flex-col pb-10">
      <PageHeader eyebrow="Availability" lead="What's free," accent="at a glance." />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous day"
            onClick={() => day && setDate(addDaysIso(day, -1))}
            className="grid size-10 place-items-center rounded-full bg-fg/[0.06] hover:bg-fg/[0.12]"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="min-w-56 px-2">
            <p className="display-4 text-fg">{day && now ? relDay(toIso(day, "12:00"), now) : "—"}</p>
            <p className="text-[13px] text-fg-3">{day ? fmtDayLong(toIso(day, "12:00")) : ""}</p>
          </div>
          <button
            type="button"
            aria-label="Next day"
            onClick={() => day && setDate(addDaysIso(day, 1))}
            className="grid size-10 place-items-center rounded-full bg-fg/[0.06] hover:bg-fg/[0.12]"
          >
            <ChevronRight className="size-5" />
          </button>
          {date && date !== today && (
            <button type="button" onClick={() => setDate(null)} className="ml-2 text-sm font-medium text-fg underline decoration-fg/30 underline-offset-4">
              Today
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented size="sm" value={type} onChange={setType} options={TYPES} />
          <Select value={building} onChange={(e) => setBuilding(e.target.value)} className="h-10 w-48 text-[14px]">
            <option value="">All buildings</option>
            {BUILDINGS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {failed > 0 && (
        <ErrorNote className="mb-4">
          {failed === shown.length ? "Couldn't load today's schedule" : `Couldn't load the schedule for ${failed} of ${shown.length} rooms`} —
          retrying. Rooms still shimmering aren&apos;t confirmed free yet.
        </ErrorNote>
      )}
      {roomsLoading && !rooms.length ? (
        <Loading rows={5} />
      ) : roomsError && !rooms.length ? (
        <ErrorNote>{roomsError.message}</ErrorNote>
      ) : !shown.length ? (
        <EmptyState
          icon={<SearchX />}
          title="No rooms match."
          body="Nothing of that type in this building. Try All, or another building."
          action={
            <Button variant="outline" onClick={() => { setType("all"); setBuilding(""); }}>
              Show every room
            </Button>
          }
        />
      ) : (
        <DayGrid
          rooms={shown}
          slots={gridSlots}
          nowMinutes={day === today && now ? istMinutes(now) : null}
          meta={(r) => `${buildingCode(r.buildingId)} · ${r.capacity} seats${r.systemsCount ? ` · ${r.systemsCount} PCs` : ""}`}
          onPick={(room, startMin) => {
            if (!day) return;
            const q = new URLSearchParams({ room: room.id, date: day, start: hhmmOf(startMin), end: hhmmOf(Math.min(startMin + 60, 20 * 60)) });
            router.push(`/r/new?${q}`);
          }}
        />
      )}
      <div className="mt-5">
        <GridLegend />
      </div>
    </div>
  );
}
