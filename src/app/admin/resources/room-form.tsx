"use client";
// Add / edit a room (RoomInput contract). Owner: Nikhil
import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { FEATURES, ROOM_TYPES, type Feature, type Room, type RoomType } from "@/contracts/domain";
import type { RoomInput } from "@/contracts";
import { ChipToggle, ErrorNote, Field, Input, Select } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { BUILDINGS, DEPARTMENTS, PROFILES } from "@/lib/campus";

export const TYPE_LABEL: Record<RoomType, string> = {
  lab: "Lab",
  classroom: "Classroom",
  seminar_hall: "Seminar hall",
  meeting_room: "Meeting room",
  auditorium: "Auditorium",
};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function RoomForm({ room, submitLabel, onSubmit }: { room?: Room; submitLabel: string; onSubmit: (input: RoomInput) => Promise<void> }) {
  const [f, setF] = useState<RoomInput>(() => ({
    code: room?.code ?? "",
    name: room?.name ?? "",
    buildingId: room?.buildingId ?? BUILDINGS[0].id,
    type: room?.type ?? "classroom",
    capacity: room?.capacity ?? 60,
    systemsCount: room?.systemsCount ?? 0,
    features: room?.features ?? ["projector", "whiteboard"],
    departmentId: room?.departmentId ?? null,
    access: room?.access ?? "open",
    approverId: room?.approverId ?? PROFILES.find((p) => p.role === "approver")?.id ?? null,
    openTime: room?.openTime ?? "08:00",
    closeTime: room?.closeTime ?? "20:00",
    openDays: room?.openDays ?? [1, 2, 3, 4, 5, 6],
    attributes: room?.attributes ?? {},
    isActive: room?.isActive ?? true,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof RoomInput>(k: K, v: RoomInput[K]) => setF((x) => ({ ...x, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (f.code.trim().length < 2 || f.name.trim().length < 2) return setError("Give the room a code and a name.");
    if (f.closeTime <= f.openTime) return setError("Closing time has to be after opening time.");
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ ...f, code: f.code.trim().toUpperCase(), name: f.name.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-6 md:grid-cols-6">
      <Field label="Code" className="md:col-span-2" hint="On the door and the QR, e.g. TP-401">
        <Input value={f.code} onChange={(e) => set("code", e.target.value)} placeholder="TP-401" />
      </Field>
      <Field label="Name" className="md:col-span-4">
        <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="TP 401 Lab" />
      </Field>
      <Field label="Building" className="md:col-span-2">
        <Select value={f.buildingId} onChange={(e) => set("buildingId", e.target.value)}>
          {BUILDINGS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Type" className="md:col-span-2">
        <Select value={f.type} onChange={(e) => set("type", e.target.value as RoomType)}>
          {ROOM_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Seats" className="md:col-span-1">
        <Input inputMode="numeric" value={f.capacity} onChange={(e) => set("capacity", Number(e.target.value.replace(/\D/g, "")) || 0)} />
      </Field>
      <Field label="Systems" className="md:col-span-1">
        <Input inputMode="numeric" value={f.systemsCount} onChange={(e) => set("systemsCount", Number(e.target.value.replace(/\D/g, "")) || 0)} />
      </Field>
      <Field label="Features" className="md:col-span-6">
        <div className="flex flex-wrap gap-2">
          {FEATURES.map((x: Feature) => (
            <ChipToggle
              key={x}
              selected={f.features.includes(x)}
              onToggle={() => set("features", f.features.includes(x) ? f.features.filter((y) => y !== x) : [...f.features, x])}
            >
              {x.replace("_", " ")}
            </ChipToggle>
          ))}
        </div>
      </Field>
      <Field label="Department" className="md:col-span-2">
        <Select value={f.departmentId ?? ""} onChange={(e) => set("departmentId", e.target.value || null)}>
          <option value="">None — shared</option>
          {DEPARTMENTS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Who can book" className="md:col-span-2">
        <Select value={f.access} onChange={(e) => set("access", e.target.value as RoomInput["access"])}>
          <option value="open">Anyone</option>
          <option value="dept_only">Department only</option>
        </Select>
      </Field>
      <Field label="Approver" className="md:col-span-2">
        <Select value={f.approverId ?? ""} onChange={(e) => set("approverId", e.target.value || null)}>
          {PROFILES.filter((p) => p.role !== "requester").map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Opens" className="md:col-span-2">
        <Input type="time" step={1800} value={f.openTime} onChange={(e) => set("openTime", e.target.value)} />
      </Field>
      <Field label="Closes" className="md:col-span-2">
        <Input type="time" step={1800} value={f.closeTime} onChange={(e) => set("closeTime", e.target.value)} />
      </Field>
      <Field label="Open on" className="md:col-span-6">
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d, i) => (
            <ChipToggle
              key={d}
              selected={f.openDays.includes(i + 1)}
              onToggle={() => set("openDays", f.openDays.includes(i + 1) ? f.openDays.filter((x) => x !== i + 1) : [...f.openDays, i + 1].sort())}
            >
              {d}
            </ChipToggle>
          ))}
        </div>
      </Field>
      {error && <ErrorNote className="md:col-span-6">{error}</ErrorNote>}
      <div className="flex justify-end border-t border-line pt-6 md:col-span-6">
        <Button type="submit" size="lg" disabled={busy}>
          {busy && <LoaderCircle className="animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
