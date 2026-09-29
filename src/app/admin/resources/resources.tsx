"use client";
// Resources: every room, searchable, with an add form. Owner: Nikhil (UI) · Aditi (API)
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import type { RoomType } from "@/contracts/domain";
import { ErrorNote, Input, Loading, PageHeader, Panel, RoomCode, Segmented, Select, Tag, toast } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useRooms } from "@/hooks/use-rooms";
import { api } from "@/lib/api/client";
import { BUILDINGS } from "@/lib/campus";
import { cn } from "@/lib/utils";
import { RoomForm, TYPE_LABEL } from "./room-form";

export function Resources() {
  const router = useRouter();
  const { rooms, loading, error, buildingCode } = useRooms();
  const [q, setQ] = useState("");
  const [type, setType] = useState<RoomType | "all">("all");
  const [building, setBuilding] = useState("");
  const [adding, setAdding] = useState(false);

  const shown = useMemo(
    () =>
      rooms
        .filter((r) => (type === "all" || r.type === type) && (!building || r.buildingId === building))
        .filter((r) => !q || `${r.code} ${r.name}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => a.code.localeCompare(b.code)),
    [rooms, q, type, building],
  );
  const seats = shown.reduce((s, r) => s + r.capacity, 0);

  return (
    <div className="flex flex-col pb-16">
      <PageHeader
        eyebrow="Resources"
        lead="Every room,"
        accent="in one place."
        lede={`${rooms.length} rooms across ${BUILDINGS.length} buildings. Maintenance windows and check-in codes live on each room.`}
        actions={
          <Button size="xl" variant={adding ? "outline" : "default"} onClick={() => setAdding((a) => !a)}>
            {adding ? <X /> : <Plus />} {adding ? "Close" : "Add room"}
          </Button>
        }
      />
      {adding && (
        <Panel tone="white" className="mb-8 p-6 md:p-8">
          <RoomForm
            submitLabel="Add room"
            onSubmit={async (input) => {
              const room = await api.rooms.create(input);
              toast(`${room.code} added`);
              router.push(`/admin/resources/${room.id}`);
            }}
          />
        </Panel>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-fg-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search rooms" className="h-11 w-64 pl-11 text-[15px]" />
        </label>
        <Segmented
          size="sm"
          value={type}
          onChange={setType}
          options={[{ value: "all", label: "All" }, ...(Object.keys(TYPE_LABEL) as RoomType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] }))]}
        />
        <Select value={building} onChange={(e) => setBuilding(e.target.value)} className="h-11 w-52 text-[14px]">
          <option value="">All buildings</option>
          {BUILDINGS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <span className="ml-auto font-mono text-xs tracking-[0.1em] text-fg-3 uppercase">
          {shown.length} rooms · {seats.toLocaleString("en-IN")} seats
        </span>
      </div>

      {loading && !rooms.length ? (
        <Loading rows={5} />
      ) : error && !rooms.length ? (
        <ErrorNote>{error.message}</ErrorNote>
      ) : (
        <Panel tone="white" className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-[15px]">
            <thead>
              <tr className="border-b border-line font-mono text-[11px] tracking-[0.14em] text-fg-3 uppercase">
                <th className="px-6 py-4 font-medium">Room</th>
                <th className="px-3 py-4 font-medium">Type</th>
                <th className="px-3 py-4 text-right font-medium">Seats</th>
                <th className="px-3 py-4 text-right font-medium">Systems</th>
                <th className="px-3 py-4 font-medium">Features</th>
                <th className="px-3 py-4 font-medium">Access</th>
                <th className="px-6 py-4 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="group border-b border-line last:border-0 hover:bg-bone/60">
                  <td className="px-6 py-3.5">
                    <Link href={`/admin/resources/${r.id}`} className="flex items-center gap-3">
                      <RoomCode code={r.code} />
                      <span className="font-medium text-fg group-hover:underline">{r.name}</span>
                      <span className="text-[13px] text-fg-3">{buildingCode(r.buildingId)}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-3.5 text-fg-2">{TYPE_LABEL[r.type]}</td>
                  <td className="px-3 py-3.5 text-right font-mono tabular-nums">{r.capacity}</td>
                  <td className="px-3 py-3.5 text-right font-mono text-fg-2 tabular-nums">{r.systemsCount || "—"}</td>
                  <td className="max-w-72 px-3 py-3.5 text-[13px] text-fg-2">{r.features.join(" · ").replace(/_/g, " ")}</td>
                  <td className="px-3 py-3.5 text-[13px] text-fg-2">{r.access === "open" ? "Anyone" : "Dept only"}</td>
                  <td className="px-6 py-3.5 text-right">
                    <Tag className={cn(r.isActive ? "bg-[#d6f2df] text-[#0b5a2f]" : "")}>{r.isActive ? "In service" : "Off"}</Tag>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
