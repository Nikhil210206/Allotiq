"use client";
// Allocation Lab (demo scene 2): the same requests, placed first-come-first-served and then by the
// engine. Play FCFS drops the chips in one by one; Run engine glides them into the better plan (GSAP
// Flip). Results come from /api/lab/run — the engine decides, this screen only shows it. Owner: Nikhil
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, LoaderCircle, Play, RotateCcw, Sparkles } from "lucide-react";
import type { Room } from "@/contracts/domain";
import type { EngineRequest, SolveResult } from "@/contracts/engine";
import type { LabRunResponse } from "@/contracts";
import { Delta, ErrorNote, Eyebrow, Headline, Loading, Panel, RoomCode, Select, Tag, toast } from "@/components/kit";
import { Flip, gsap } from "@/components/kit/motion";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { useRooms } from "@/hooks/use-rooms";
import { api } from "@/lib/api/client";
import type { LabScenario } from "@/lib/api/types";
import { fmtWhen } from "@/lib/time";
import { cn } from "@/lib/utils";

type Spot = string; // roomId | "queue" | "wall"
type Mode = "idle" | "fcfs" | "engine";

export function Lab() {
  const { data: scenarios, error, loading } = useApi("lab-scenarios", api.lab.scenarios);
  const [picked, setPicked] = useState<string | null>(null);
  const sc = scenarios?.find((s) => s.id === picked) ?? scenarios?.[0];
  if (loading && !scenarios) return <Loading className="pt-16" rows={3} />;
  if (error && !scenarios) return <ErrorNote className="mt-16">{error.message}</ErrorNote>;
  if (!sc) return null;
  return <Board key={sc.id} scenario={sc} scenarios={scenarios ?? []} onPick={setPicked} />;
}

function Board({ scenario, scenarios, onPick }: { scenario: LabScenario; scenarios: LabScenario[]; onPick: (id: string) => void }) {
  const { rooms: allRooms, buildingCode } = useRooms();
  const [run, setRun] = useState<LabRunResponse | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [spots, setSpots] = useState<Record<string, Spot>>(() => Object.fromEntries(scenario.requests.map((r) => [r.id, "queue"])));
  const [busy, setBusy] = useState(false);
  const board = useRef<HTMLDivElement>(null);
  const pending = useRef<Flip.FlipState | null>(null);

  const rooms: Room[] = useMemo(
    () => scenario.rooms ?? allRooms.filter((r) => scenario.roomIds?.includes(r.id)),
    [scenario, allRooms],
  );
  const fcfs = run?.results.find((r) => r.solver === "fcfs");
  const engine = run?.results.find((r) => r.solver !== "fcfs");
  const reqs = scenario.requests;

  // Animate every chip from where it was to where React just put it.
  useLayoutEffect(() => {
    if (!pending.current) return;
    const state = pending.current;
    pending.current = null;
    Flip.from(state, { duration: 0.9, ease: "power3.inOut", stagger: 0.06, absolute: true, nested: true });
  }, [spots]);

  const move = (next: Record<string, Spot>) => {
    if (board.current) pending.current = Flip.getState(board.current.querySelectorAll("[data-flip-id]"));
    setSpots(next);
  };

  const ensureRun = async () => {
    if (run) return run;
    const r = await api.lab.run(scenario.id);
    setRun(r);
    return r;
  };

  const place = (res: SolveResult) =>
    Object.fromEntries(reqs.map((q) => [q.id, res.assignments.find((a) => a.requestId === q.id)?.roomId ?? "wall"]));

  const playFcfs = async () => {
    setBusy(true);
    try {
      const r = await ensureRun();
      const res = r.results.find((x) => x.solver === "fcfs")!;
      const target = place(res);
      move(Object.fromEntries(reqs.map((q) => [q.id, "queue"])));
      setMode("fcfs");
      // one request at a time, in the order they were submitted
      const order = [...reqs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      let acc: Record<string, Spot> = Object.fromEntries(reqs.map((q) => [q.id, "queue"]));
      for (const q of order) {
        await new Promise((ok) => setTimeout(ok, 750));
        acc = { ...acc, [q.id]: target[q.id] };
        move(acc);
      }
      await new Promise((ok) => setTimeout(ok, 950));
      gsap.fromTo("[data-wall] [data-flip-id]", { x: -8 }, { x: 0, duration: 0.5, ease: "elastic.out(1.2,0.3)" });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't run the Lab", "error");
    } finally {
      setBusy(false);
    }
  };

  const runEngine = async () => {
    setBusy(true);
    try {
      const r = await ensureRun();
      const res = r.results.find((x) => x.solver !== "fcfs")!;
      move(place(res));
      setMode("engine");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't run the engine", "error");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    move(Object.fromEntries(reqs.map((q) => [q.id, "queue"])));
    setMode("idle");
  };

  const apply = async () => {
    if (!run) return;
    setBusy(true);
    try {
      await api.lab.apply(run.runId);
      toast("Engine plan applied");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't apply", "error");
    } finally {
      setBusy(false);
    }
  };

  const shown = mode === "engine" ? engine : mode === "fcfs" ? fcfs : undefined;
  const slot = reqs[0]?.interval;

  return (
    <div className="flex flex-col gap-10 pt-6 pb-16 md:pt-10">
      <header className="flex flex-col gap-6">
        <Eyebrow>Allocation Lab</Eyebrow>
        <Headline as="h1" size="1" lead="Same requests." accent="A better plan." />
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <p className="lede max-w-2xl">
            {scenario.description} First come, first served isn&apos;t fair — it&apos;s just first.
          </p>
          {scenarios.length > 1 && (
            <Select value={scenario.id} onChange={(e) => onPick(e.target.value)} className="w-64">
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      </header>

      <Metrics fcfs={fcfs} engine={engine} mode={mode} />

      <Panel tone="ink" className="flex flex-col gap-8 p-6 md:p-9">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Tag>{scenario.name}</Tag>
            {slot && <Tag>{fmtWhen(slot)}</Tag>}
            <Tag className={cn(mode === "engine" && "bg-volt text-ink")}>
              {mode === "idle" ? "Not placed yet" : mode === "fcfs" ? "First come, first served" : "Engine plan"}
            </Tag>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button variant="outline" disabled={busy} onClick={playFcfs}>
              <Play /> Play FCFS
            </Button>
            <Button variant="volt" disabled={busy || mode === "idle"} onClick={runEngine}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />} Run engine
            </Button>
            <Button disabled={busy || mode !== "engine"} onClick={apply}>
              <Check /> Apply plan
            </Button>
            <Button variant="ghost" size="icon" aria-label="Reset" disabled={busy} onClick={reset}>
              <RotateCcw />
            </Button>
          </div>
        </div>

        <div ref={board} className="flex flex-col gap-6">
          <Lane label="Incoming, in the order they were sent" wide>
            {reqs.filter((q) => spots[q.id] === "queue").map((q) => <Chip key={q.id} q={q} />)}
          </Lane>
          <div className="flex flex-col gap-2.5">
            {rooms.map((room) => (
              <div key={room.id} className="grid grid-cols-[13rem_1fr] items-stretch gap-3 max-md:grid-cols-1">
                <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-4 py-3 ring-1 ring-line">
                  <RoomCode code={room.code} />
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-fg">{room.capacity} seats</p>
                    <p className="truncate text-[12px] text-fg-3">
                      {buildingCode(room.buildingId)}
                      {room.features.length ? ` · ${room.features.join(", ").replace(/_/g, " ")}` : " · no projector"}
                    </p>
                  </div>
                </div>
                <div className="flex min-h-16 flex-wrap items-center gap-2 rounded-2xl border border-dashed border-white/12 px-3 py-2">
                  {reqs.filter((q) => spots[q.id] === room.id).map((q) => (
                    <Chip key={q.id} q={q} room={room} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div data-wall className="flex min-h-18 flex-wrap items-center gap-3 rounded-2xl bg-[repeating-linear-gradient(135deg,rgb(229_72_77/0.14)_0_10px,transparent_10px_20px)] px-4 py-3 ring-1 ring-[#e5484d]/40">
            <span className="font-mono text-[11px] tracking-[0.14em] text-[#ffa9ab] uppercase">No room</span>
            {reqs.filter((q) => spots[q.id] === "wall").map((q) => (
              <Chip key={q.id} q={q} stranded />
            ))}
          </div>
        </div>

        {mode === "engine" && run?.explanation && (
          <p className="max-w-4xl border-t border-line pt-7 text-[clamp(1.2rem,1.9vw,1.55rem)] leading-snug text-fg">
            <span className="serif-accent text-[1.2em] text-volt">What changed: </span>
            {run.explanation}
          </p>
        )}
        {shown && <p className="font-mono text-[11px] tracking-[0.12em] text-fg-3 uppercase">{shown.solver} · {shown.metrics.nodes} nodes · {shown.metrics.ms} ms</p>}
      </Panel>
    </div>
  );
}

function Lane({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-3", wide && "rounded-2xl bg-white/[0.03] p-4 ring-1 ring-line")}>
      <p className="eyebrow text-fg-3">{label}</p>
      <div className="flex min-h-12 flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ q, room, stranded }: { q: EngineRequest; room?: Room; stranded?: boolean }) {
  const wasted = room ? room.capacity - q.headcount : null;
  return (
    <span
      data-flip-id={q.id}
      className={cn(
        "inline-flex h-12 items-center gap-2.5 rounded-full py-1 pr-4 pl-1.5 text-[14px] font-medium",
        stranded ? "bg-[#e5484d] text-white" : room ? "bg-bone text-ink" : "bg-white/10 text-fg ring-1 ring-white/15",
      )}
    >
      <span className={cn("grid size-9 place-items-center rounded-full font-mono text-[12px] font-semibold", stranded ? "bg-white/20" : room ? "bg-ink text-volt" : "bg-white/10")}>
        {q.headcount}
      </span>
      {q.label ?? q.id}
      {q.features.length > 0 && <span className="text-[12px] opacity-60">· {q.features.join(", ")}</span>}
      {wasted !== null && <span className="font-mono text-[11px] opacity-55">{wasted} spare</span>}
    </span>
  );
}

function Metrics({ fcfs, engine, mode }: { fcfs?: SolveResult; engine?: SolveResult; mode: Mode }) {
  const show = (r?: SolveResult) => (mode === "idle" ? undefined : r);
  const f = show(fcfs)?.metrics;
  const e = mode === "engine" ? engine?.metrics : undefined;
  const cells: { label: string; f?: string; e?: string; delta?: { value: number; better: "up" | "down" } }[] = [
    { label: "Requests placed", f: f && `${f.placed}/${f.total}`, e: e && `${e.placed}/${e.total}`, delta: e && f ? { value: e.placed - f.placed, better: "up" } : undefined },
    { label: "Seats wasted", f: f && String(f.seatsWasted), e: e && String(e.seatsWasted), delta: e && f ? { value: e.seatsWasted - f.seatsWasted, better: "down" } : undefined },
    { label: "Buildings lit", f: f && String(f.buildingsActive), e: e && String(e.buildingsActive), delta: e && f ? { value: e.buildingsActive - f.buildingsActive, better: "down" } : undefined },
    { label: "Priority requests lost", f: f && String(f.priorityTotal - f.priorityPlaced), e: e && String(e.priorityTotal - e.priorityPlaced) },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cells.map((c) => (
        <Panel key={c.label} tone={mode === "engine" ? "forest" : "white"} className="flex min-h-44 flex-col justify-between gap-4 p-6">
          <p className="text-[15px] font-medium text-fg-2">{c.label}</p>
          <div>
            <p className="figure text-[3.5rem] text-fg">{c.e ?? c.f ?? "—"}</p>
            {c.e && c.f && <p className="mt-1 font-mono text-xs tracking-[0.06em] text-fg-3 uppercase">FCFS: {c.f}</p>}
            {c.delta && c.delta.value !== 0 && <div className="mt-2"><Delta value={c.delta.value} label="vs FCFS" better={c.delta.better} /></div>}
          </div>
        </Panel>
      ))}
    </div>
  );
}
