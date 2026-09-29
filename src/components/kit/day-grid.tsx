"use client";
// Rooms × 30-minute slots, 08:00–20:00. Bookings are blocks across their slots; free slots are
// buttons (click → a prefilled request). A volt line marks "now" on today's grid.
import type { AvailabilitySlot } from "@/contracts";
import type { Room } from "@/contracts/domain";
import { fmtRange, hhmmOf, istMinutes } from "@/lib/time";
import { cn } from "@/lib/utils";
import { RoomCode } from "./chips";

export const GRID_START = 8 * 60;
export const GRID_END = 20 * 60;
const STEP = 30;
const COLS = (GRID_END - GRID_START) / STEP;

const col = (iso: string, end = false) => {
  const m = istMinutes(iso) || (end ? 24 * 60 : 0);
  return Math.max(0, Math.min(COLS, Math.round((m - GRID_START) / STEP)));
};

const STATE_CLASS: Record<AvailabilitySlot["state"], string> = {
  booked: "bg-ink text-bone",
  held: "bg-[repeating-linear-gradient(135deg,#fbeec8_0_6px,#f5dd95_6px_12px)] text-[#6f4800] ring-1 ring-[#e8a200]/50 ring-inset",
  blackout: "bg-[repeating-linear-gradient(135deg,#fbe2e1_0_6px,#f4c3c1_6px_12px)] text-[#a1161b]",
  closed: "bg-fg/[0.05] text-fg-3",
  free: "",
};

export function DayGrid({
  rooms,
  slots,
  nowMinutes,
  meta,
  onPick,
  onOpen,
}: {
  rooms: Room[];
  slots: Record<string, AvailabilitySlot[] | undefined>;
  /** Minutes after midnight for the "now" line (today only). */
  nowMinutes?: number | null;
  meta?: (room: Room) => string;
  onPick?: (room: Room, startMin: number) => void;
  onOpen?: (slot: AvailabilitySlot) => void;
}) {
  const hours = Array.from({ length: COLS / 2 }, (_, i) => GRID_START / 60 + i);
  const nowLeft = nowMinutes != null && nowMinutes >= GRID_START && nowMinutes <= GRID_END ? ((nowMinutes - GRID_START) / (GRID_END - GRID_START)) * 100 : null;

  return (
    <div className="light overflow-x-auto rounded-[1.75rem] bg-white ring-1 ring-line">
      <div className="min-w-[60rem]">
        {/* hour ruler */}
        <div className="sticky top-0 z-10 grid grid-cols-[13.5rem_1fr] border-b border-line bg-white">
          <div className="px-5 py-3 font-mono text-[11px] tracking-[0.14em] text-fg-3 uppercase">Room</div>
          <div className="relative grid" style={{ gridTemplateColumns: `repeat(${COLS / 2}, 1fr)` }}>
            {hours.map((h) => (
              <div key={h} className="border-l border-line py-3 pl-1.5 font-mono text-[11px] text-fg-3">
                {String(h).padStart(2, "0")}
              </div>
            ))}
          </div>
        </div>

        {rooms.map((room) => {
          const list = slots[room.id];
          const blocks = (list ?? []).filter((s) => s.state !== "free");
          const taken = new Set<number>();
          for (const b of blocks) for (let c = col(b.start); c < col(b.end, true); c++) taken.add(c);
          return (
            <div key={room.id} className="group/row grid grid-cols-[13.5rem_1fr] border-b border-line last:border-b-0">
              <div className="flex min-w-0 items-center gap-2.5 px-4 py-2.5">
                <RoomCode code={room.code} />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-fg">{room.name}</p>
                  {meta && <p className="truncate text-[11px] text-fg-3">{meta(room)}</p>}
                </div>
              </div>
              <div className="relative grid h-14" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
                {Array.from({ length: COLS }, (_, c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={!onPick || taken.has(c) || list === undefined}
                    onClick={() => onPick?.(room, GRID_START + c * STEP)}
                    aria-label={`Book ${room.code} at ${hhmmOf(GRID_START + c * STEP)}`}
                    className={cn(
                      "relative border-l border-line/60 transition-colors [&:nth-child(odd)]:border-line",
                      !taken.has(c) && list !== undefined && "hover:bg-volt/60 focus-visible:bg-volt/60 focus-visible:outline-none",
                      list === undefined && "animate-pulse bg-fg/[0.03]",
                    )}
                  />
                ))}
                {blocks.map((b) => (
                  <button
                    key={`${b.state}-${b.start}`}
                    type="button"
                    title={`${b.label ?? b.state} · ${fmtRange(b)}`}
                    onClick={() => onOpen?.(b)}
                    disabled={!onOpen || !b.requestId}
                    className={cn(
                      "absolute inset-y-1.5 z-[1] flex items-center overflow-hidden rounded-lg px-2 text-left text-[11px] leading-tight font-medium",
                      STATE_CLASS[b.state],
                    )}
                    style={{
                      left: `calc(${(col(b.start) / COLS) * 100}% + 2px)`,
                      width: `calc(${((col(b.end, true) - col(b.start)) / COLS) * 100}% - 4px)`,
                    }}
                  >
                    <span className="truncate">{b.state === "closed" ? "Closed" : b.label}</span>
                  </button>
                ))}
                {nowLeft !== null && (
                  <span aria-hidden className="pointer-events-none absolute inset-y-0 z-[2] w-0.5 -translate-x-1/2 bg-[#e5484d]" style={{ left: `${nowLeft}%` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function GridLegend() {
  const items: [string, string][] = [
    ["Free — click to book", "bg-white ring-1 ring-line"],
    ["Booked", STATE_CLASS.booked],
    ["Held, awaiting approval", STATE_CLASS.held],
    ["Maintenance", STATE_CLASS.blackout],
    ["Closed", STATE_CLASS.closed],
  ];
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2">
      {items.map(([label, cls]) => (
        <li key={label} className="flex items-center gap-2 text-[13px] text-fg-2">
          <span className={cn("h-3.5 w-6 rounded", cls)} />
          {label}
        </li>
      ))}
      <li className="flex items-center gap-2 text-[13px] text-fg-2">
        <span className="h-3.5 w-0.5 bg-[#e5484d]" /> Now
      </li>
    </ul>
  );
}
