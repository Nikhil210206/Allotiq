"use client";
// Utilisation dashboard (N7): KPI band, weekday × hour heatmap, ghost bookings, unmet demand,
// underused rooms, and "Ask the dashboard". Analytics are computed from bookings — never by the LLM.
// Owner: Nikhil
import { useMemo, useState, type FormEvent } from "react";
import { ArrowUp, LoaderCircle, MessageCircleQuestion, Sparkles } from "lucide-react";
import type { AskResponse } from "@/contracts/ai";
import type { RoomType } from "@/contracts/domain";
import { ErrorNote, Eyebrow, Headline, KpiBand, Loading, Panel, RoomCode, Segmented, Select, Tag } from "@/components/kit";
import { BarList, Heatmap } from "@/components/kit/charts";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { useNow } from "@/hooks/use-clock";
import { api } from "@/lib/api/client";
import type { DashboardMetrics } from "@/lib/api/types";
import { BUILDINGS } from "@/lib/campus";
import { istDate } from "@/lib/time";

const RANGES = [
  { value: "7", label: "7 days" },
  { value: "14", label: "2 weeks" },
  { value: "28", label: "4 weeks" },
] as const;
const TYPE_LABEL: Record<RoomType, string> = {
  lab: "Labs",
  classroom: "Classrooms",
  seminar_hall: "Seminar halls",
  meeting_room: "Meeting rooms",
  auditorium: "Auditorium",
};
const QUESTIONS = [
  "Which labs are underused on Fridays?",
  "Where do ghost bookings happen most?",
  "What demand couldn't we meet last month?",
];

export function Dashboard() {
  const now = useNow(60_000);
  const [range, setRange] = useState<"7" | "14" | "28">("28");
  const [type, setType] = useState<RoomType | "">("");
  const [building, setBuilding] = useState("");
  const day = now ? istDate(now) : null;
  const filters = useMemo(() => {
    if (!now) return null;
    const to = new Date(`${day}T00:00:00+05:30`);
    return {
      from: new Date(to.getTime() - Number(range) * 86_400_000).toISOString(),
      to: to.toISOString(),
      type: type || undefined,
      building: BUILDINGS.find((b) => b.id === building)?.code,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute per day, not per clock tick
  }, [day, range, type, building]);
  const { data, error, loading } = useApi(filters ? `dash:${JSON.stringify(filters)}` : null, () => api.dashboard(filters!));

  return (
    <div className="flex flex-col gap-10 pb-16">
      <header className="flex flex-col gap-6 pt-6 md:pt-10">
        <Eyebrow>Dashboard · simulated month</Eyebrow>
        <Headline as="h1" size="1" lead="How the campus" accent="really uses its rooms." />
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={range} onChange={setRange} options={[...RANGES]} />
        <Select value={type} onChange={(e) => setType(e.target.value as RoomType | "")} className="h-11 w-44 text-[14px]">
          <option value="">All room types</option>
          {(Object.keys(TYPE_LABEL) as RoomType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        <Select value={building} onChange={(e) => setBuilding(e.target.value)} className="h-11 w-52 text-[14px]">
          <option value="">All buildings</option>
          {BUILDINGS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </div>

      {loading && !data ? (
        <Loading rows={4} />
      ) : error && !data ? (
        <ErrorNote>{error.message}</ErrorNote>
      ) : data ? (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <Body m={data} />
        </div>
      ) : null}

      <Ask />
    </div>
  );
}

function Body({ m }: { m: DashboardMetrics }) {
  const s = m.summary;
  const d = (cur: number, prev: number, label: string, better: "up" | "down") =>
    m.previousAvailable && Math.round(cur - prev) !== 0 ? { value: Math.round(cur - prev), label, better } : undefined;
  return (
    <div className="flex flex-col gap-5">
      <KpiBand
        tone="forest"
        items={[
          { label: "of open room-hours used", value: Math.round(s.occupancyPct), unit: "%", delta: d(s.occupancyPct, s.previous.occupancyPct, "pts vs before", "up") },
          { label: "ghost bookings — approved, never used", value: Math.round(s.ghostRatePct), unit: "%", delta: d(s.ghostRatePct, s.previous.ghostRatePct, "pts vs before", "down") },
          { label: "requests we couldn't place", value: s.unmet, delta: d(s.unmet, s.previous.unmet, "vs before", "down") },
          { label: "idle building-hours — AC could be off", value: s.idleBuildingHours, compact: s.idleBuildingHours > 9999, delta: d(s.idleBuildingHours, s.previous.idleBuildingHours, "vs before", "down") },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Panel tone="white" className="flex flex-col gap-6 p-6 md:p-8">
          <div>
            <Eyebrow>When rooms are busy</Eyebrow>
            <p className="display-4 mt-3 text-fg">Late mornings and early afternoons fill up. Fridays empty out.</p>
          </div>
          <Heatmap {...m.heatmap} />
        </Panel>
        <Panel tone="ink" className="flex flex-col gap-6 p-6 md:p-8">
          <div>
            <Eyebrow>Ghost bookings</Eyebrow>
            <p className="figure mt-4 text-[5.5rem] text-fg">
              {Math.round(m.ghost.ratePct)}
              <span className="text-[0.45em]">%</span>
            </p>
            <p className="mt-2 text-[15px] text-fg-2">booked, approved, never checked in — now released after 15 minutes.</p>
          </div>
          <BarList tone="volt" unit="%" max={100} rows={m.ghost.byTime.map((g) => ({ label: g.label, value: g.ratePct }))} />
          <BarList tone="bone" unit="%" max={100} rows={m.ghost.byKind.map((g) => ({ label: g.label, value: g.ratePct }))} />
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel tone="white" className="flex flex-col gap-6 p-6 md:p-8">
          <Eyebrow>Occupancy by room type</Eyebrow>
          <BarList unit="%" max={100} rows={s.byType.map((t) => ({ label: TYPE_LABEL[t.type], value: t.occupancyPct, sub: `${t.rooms} rooms` }))} />
        </Panel>
        <Panel tone="volt" className="flex flex-col gap-5 p-6 md:p-8">
          <Eyebrow className="text-ink/60">Unmet demand</Eyebrow>
          <p className="display-3 text-ink">
            {m.unmet.total} requests for 100+ seats <span className="serif-accent">on weekday evenings.</span>
          </p>
          <ul className="flex flex-col gap-2">
            {m.unmet.items.slice(0, 4).map((u) => (
              <li key={u.id} className="flex items-baseline justify-between gap-3 border-t border-ink/10 pt-2 text-[14px]">
                <span className="truncate text-ink">{u.title} · {u.headcount}</span>
                <span className="shrink-0 font-mono text-[12px] text-ink/60">{u.when.split(" · ")[0]}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel tone="white" className="flex flex-col gap-5 p-6 md:p-8">
          <Eyebrow>Underused rooms</Eyebrow>
          <ul className="flex flex-col gap-3">
            {m.underused.rooms.map((r) => (
              <li key={r.roomId} className="flex items-center gap-3">
                <RoomCode code={r.code} />
                <span className="min-w-0 flex-1 truncate text-[14px] text-fg-2">{r.name}</span>
                <span className="font-mono text-[13px] font-medium text-fg">{Math.round(r.occupancyPct)}%</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Ask() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<{ q: string; a: AskResponse } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (question: string, e?: FormEvent) => {
    e?.preventDefault();
    if (question.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      setAnswer({ q: question, a: await api.ai.ask(question) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't answer that");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel tone="ink" className="flex flex-col gap-7 p-6 md:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Ask the dashboard</Eyebrow>
          <Headline size="3" lead="Ask it anything." accent="It only answers from the numbers." className="mt-4" />
        </div>
        <Tag>
          <Sparkles className="mr-1.5 size-3" /> Tools, never SQL
        </Tag>
      </div>
      <form onSubmit={(e) => run(q, e)} className="flex items-center gap-3 rounded-full bg-white/[0.06] p-2 pl-6 ring-1 ring-line focus-within:ring-2 focus-within:ring-volt/60">
        <MessageCircleQuestion className="size-5 shrink-0 text-fg-3" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Which labs are underused on Fridays?"
          className="h-12 min-w-0 flex-1 bg-transparent text-lg text-fg outline-none placeholder:text-fg-3"
        />
        <Button type="submit" variant="volt" size="icon-lg" disabled={busy} aria-label="Ask">
          {busy ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {QUESTIONS.map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => {
              setQ(x);
              void run(x);
            }}
            className="rounded-full bg-white/[0.06] px-3.5 py-2 text-[14px] text-fg-2 ring-1 ring-line transition-colors hover:bg-white/[0.12] hover:text-fg"
          >
            {x}
          </button>
        ))}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {answer && (
        <div className="grid gap-8 border-t border-line pt-8 lg:grid-cols-[1.2fr_1fr]">
          <div className="flex flex-col gap-5">
            <p className="font-mono text-xs text-fg-3">“{answer.q}”</p>
            <p className="text-[clamp(1.25rem,2vw,1.6rem)] leading-snug tracking-[-0.01em] text-fg">{answer.a.answer}</p>
            {answer.a.highlights.length > 0 && (
              <div className="flex flex-wrap gap-6">
                {answer.a.highlights.map((h) => (
                  <div key={h.label}>
                    <p className="figure text-[2.75rem] text-volt">{h.value}</p>
                    <p className="text-[13px] text-fg-3">{h.label}</p>
                  </div>
                ))}
              </div>
            )}
            {answer.a.via !== "groq" && (
              <p className="font-mono text-[11px] tracking-[0.12em] text-fg-3 uppercase">Answered from templates — AI offline</p>
            )}
          </div>
          {answer.a.chart && (
            <div className="flex flex-col gap-4">
              <p className="eyebrow text-fg-3">{answer.a.chart.title}</p>
              <BarList tone="volt" unit={answer.a.chart_tool_call_id === "unmet" ? "" : "%"} rows={answer.a.chart.rows} />
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
