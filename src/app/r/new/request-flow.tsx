"use client";
// New request (N4): say it → check what we understood → choose one of the top 3 rooms → hold it.
// The AI only fills the form; the person confirms it and the engine picks. Owner: Nikhil
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ArrowUp, CalendarClock, ListPlus, LoaderCircle, Mic, Square, Wand2 } from "lucide-react";
import { FEATURES, PURPOSES, ROOM_TYPES, type Feature, type Purpose, type RoomType } from "@/contracts/domain";
import type { Alternatives, ParsedRequest, RecommendResponse, RequestDraft } from "@/contracts";
import {
  ChipToggle,
  ErrorNote,
  Eyebrow,
  Field,
  Headline,
  Input,
  Panel,
  RoomCard,
  RoomCode,
  RollLabel,
  Select,
  Tag,
  WhyNot,
  pulseFrom,
  toast,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-clock";
import { useRooms } from "@/hooks/use-rooms";
import { useVoice } from "@/hooks/use-voice";
import { ApiError, api } from "@/lib/api/client";
import { BUILDINGS } from "@/lib/campus";
import { fmtDay, fmtRange, fmtWhen, istDate, toIso } from "@/lib/time";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "Need a lab with 60 systems Thursday 2 to 4 for DBMS lab",
  "Seminar hall for 120 people with a mic, Friday 11am to 1pm, guest lecture",
  "Meeting room for 10 with video call tomorrow 3 to 4",
];
const PURPOSE_LABEL: Record<Purpose, string> = {
  exam: "Exam",
  academic: "Class / lab",
  department_event: "Department event",
  club_event: "Club event",
  meeting: "Meeting",
  student_activity: "Student activity",
};
const TYPE_LABEL: Record<RoomType, string> = {
  lab: "Lab",
  classroom: "Classroom",
  seminar_hall: "Seminar hall",
  meeting_room: "Meeting room",
  auditorium: "Auditorium",
};
const FEATURE_LABEL: Record<Feature, string> = {
  projector: "Projector",
  mic: "Mic",
  computers: "Computers",
  smart_board: "Smart board",
  ac: "AC",
  video_conf: "Video call",
  whiteboard: "Whiteboard",
  stage: "Stage",
  recording: "Recording",
};

interface Form {
  title: string;
  purpose: Purpose;
  headcount: string;
  minSystems: string;
  date: string;
  start: string;
  end: string;
  roomType: RoomType | "";
  features: Feature[];
  building: string;
}

type Phase = "say" | "form" | "choose";

export interface Prefill {
  room?: string;
  date?: string;
  start?: string;
  end?: string;
}

export function RequestFlow({ prefill }: { prefill: Prefill }) {
  const router = useRouter();
  const now = useNow(30_000);
  const { rooms, room: roomOf, buildingName } = useRooms();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>(prefill.date ? "form" : "say");
  const [busy, setBusy] = useState<"parse" | "find" | "hold" | null>(null);
  const [parsed, setParsed] = useState<{ p: ParsedRequest; via: string } | null>(null);
  const [form, setForm] = useState<Form>({
    title: "",
    purpose: "academic",
    headcount: "",
    minSystems: "",
    date: prefill.date ?? "",
    start: prefill.start ?? "",
    end: prefill.end ?? "",
    roomType: "",
    features: [],
    building: "",
  });
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ message: string; alternatives: Alternatives } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const chooseRef = useRef<HTMLDivElement>(null);
  const holdRef = useRef<HTMLButtonElement>(null);

  // A cell clicked on the availability grid: that room's type goes into the form.
  const prefillRoom = prefill.room ? rooms.find((r) => r.id === prefill.room) : undefined;
  useEffect(() => {
    if (!prefillRoom) return;
    const t = setTimeout(
      () => setForm((f) => (f.roomType ? f : { ...f, roomType: prefillRoom.type, building: prefillRoom.buildingId })),
      0,
    );
    return () => clearTimeout(t);
  }, [prefillRoom]);

  const voice = useVoice((heard, final) => {
    setText(heard);
    if (final && heard.trim()) void understand(heard);
  });

  const flags = useMemo(() => {
    const miss = new Set(parsed?.p.missing_fields ?? []);
    const low = (parsed?.p.confidence ?? 1) < 0.8;
    return {
      headcount: miss.has("headcount") || (low && !!parsed?.p.notes.includes("Headcount")),
      date: miss.has("date"),
      start: miss.has("start_time"),
      end: miss.has("end_time"),
    };
  }, [parsed]);

  async function understand(input = text) {
    if (!input.trim()) return;
    setBusy("parse");
    setError(null);
    try {
      const { parsed: p, via } = await api.requests.parse(input);
      setParsed({ p, via });
      setForm((f) => ({
        ...f,
        title: p.title || f.title,
        purpose: p.purpose,
        headcount: p.headcount?.toString() ?? f.headcount,
        minSystems: p.min_systems?.toString() ?? "",
        date: p.date ?? f.date,
        start: p.start_time ?? f.start,
        end: p.end_time ?? f.end,
        roomType: p.room_type ?? f.roomType,
        features: p.required_features.filter((x) => x !== "computers"),
        building: BUILDINGS.find((b) => b.code === p.preferred_building_code)?.id ?? f.building,
      }));
      setPhase("form");
      setResult(null);
      setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that — try the form instead.");
    } finally {
      setBusy(null);
    }
  }

  function draft(): RequestDraft | null {
    const headcount = Number(form.headcount);
    if (!form.title.trim() || !headcount || !form.date || !form.start || !form.end) return null;
    const during = { start: toIso(form.date, form.start), end: toIso(form.date, form.end) };
    if (during.end <= during.start) return null;
    return {
      title: form.title.trim(),
      purpose: form.purpose,
      headcount,
      minSystems: Number(form.minSystems) || 0,
      requiredFeatures: form.features,
      roomType: form.roomType || null,
      preferredBuildingId: form.building || null,
      during,
      source: parsed ? (voice.listening ? "voice" : "text") : "form",
      rawInput: text || null,
    };
  }

  async function find(e?: FormEvent) {
    e?.preventDefault();
    const d = draft();
    if (!d) {
      setError("Add what it's for, how many people, the day and the time — the end has to be after the start.");
      return;
    }
    setBusy("find");
    setError(null);
    setConflict(null);
    try {
      const res = await api.requests.recommend(d);
      setResult(res);
      const preferred = prefill.room && res.top.some((t) => t.roomId === prefill.room) ? prefill.room : res.top[0]?.roomId;
      setPicked(preferred ?? null);
      setPhase("choose");
      setTimeout(() => chooseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't find rooms right now.");
    } finally {
      setBusy(null);
    }
  }

  async function hold(roomId: string | null, override?: RequestDraft) {
    const d = override ?? draft();
    if (!d) return;
    setBusy("hold");
    setError(null);
    try {
      const created = await api.requests.create(d, roomId);
      pulseFrom(holdRef.current);
      toast(roomId ? `${roomOf(roomId)?.code} is held for you` : "You're on the waitlist");
      router.push(`/r/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.conflict) setConflict({ message: err.conflict.message, alternatives: err.conflict.alternatives });
      else setError(err instanceof Error ? err.message : "Couldn't hold the room.");
      setBusy(null);
    }
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (phase === "choose") setPhase("form");
  };
  const today = now ? istDate(now) : undefined;
  const pickedRoom = roomOf(picked);
  const d = draft();

  return (
    <div className="flex flex-col gap-16 pb-32">
      {/* 01 · Say it */}
      <section className="flex flex-col gap-10 pt-6 md:pt-10">
        <Eyebrow index="01">New request</Eyebrow>
        <Headline as="h1" size="1" lead="What do you need?" accent="Just say it." />
        <Panel tone="outline" className="flex flex-col gap-4 p-4 md:p-5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void understand();
              }
            }}
            rows={2}
            placeholder="Need a lab with 60 systems Thursday 2 to 4 for DBMS lab"
            aria-label="Describe what you need"
            className="w-full resize-none bg-transparent px-2 pt-2 font-display text-[clamp(1.5rem,2.6vw,2.25rem)] leading-[1.15] font-semibold tracking-[-0.03em] text-fg outline-none placeholder:text-fg-3/60 [font-variation-settings:'opsz'_48,'wdth'_90]"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={voice.listening ? voice.stop : voice.start}
              disabled={!voice.supported || busy === "parse"}
              aria-label={voice.listening ? "Stop listening" : "Speak your request"}
              className={cn(
                "relative grid size-14 place-items-center rounded-full transition-colors disabled:opacity-40",
                voice.listening ? "bg-[#e5484d] text-white" : "bg-volt text-ink hover:bg-volt-2",
              )}
            >
              {voice.listening && (
                <span className="absolute inset-0 animate-[live-ping_1.4s_ease-out_infinite] rounded-full bg-[#e5484d] motion-reduce:animate-none" />
              )}
              {voice.listening ? <Square className="relative size-5" fill="currentColor" /> : <Mic className="relative size-6" />}
            </button>
            <p className="font-mono text-xs tracking-[0.1em] text-fg-3 uppercase">
              {voice.listening ? "Listening… tap to stop" : voice.working ? "Transcribing…" : "Tap the mic or type"}
            </p>
            <Button size="lg" className="ml-auto" disabled={!text.trim() || busy === "parse"} onClick={() => understand()}>
              {busy === "parse" ? <LoaderCircle className="animate-spin" /> : <Wand2 />}
              <RollLabel>Understand it</RollLabel>
            </Button>
          </div>
        </Panel>
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow mr-1 text-fg-3">Try</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setText(ex);
                void understand(ex);
              }}
              className="rounded-full bg-fg/[0.06] px-3.5 py-2 text-left text-[14px] text-fg-2 transition-colors hover:bg-fg/[0.1] hover:text-fg"
            >
              “{ex}”
            </button>
          ))}
          <button type="button" onClick={() => setPhase("form")} className="ml-1 text-[14px] font-medium text-fg underline decoration-fg/30 underline-offset-4 hover:decoration-fg">
            or fill the form
          </button>
        </div>
      </section>

      {/* 02 · Understood */}
      {phase !== "say" && (
        <section ref={formRef} className="flex scroll-mt-24 flex-col gap-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow index="02">Understood</Eyebrow>
              <Headline size="3" lead="Here's what we heard." accent="Fix anything." className="mt-4" />
            </div>
            {parsed && (
              <div className="flex items-center gap-2">
                <Tag>{parsed.via === "groq" ? "Read by AI" : "Read offline"}</Tag>
                <Tag className={parsed.p.confidence >= 0.8 ? "bg-[#d6f2df] text-[#0b5a2f]" : "bg-[#fbeec8] text-[#6f4800]"}>
                  {Math.round(parsed.p.confidence * 100)}% sure
                </Tag>
              </div>
            )}
          </div>
          <form onSubmit={find}>
            <Panel tone="white" className="grid gap-x-6 gap-y-6 p-6 md:grid-cols-6 md:p-8">
              <Field label="What's it for" className="md:col-span-4">
                <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="DBMS Lab — III Year A" />
              </Field>
              <Field label="Purpose" className="md:col-span-2" hint="Sets priority — exams first">
                <Select value={form.purpose} onChange={(e) => set("purpose", e.target.value as Purpose)}>
                  {PURPOSES.map((p) => (
                    <option key={p} value={p}>
                      {PURPOSE_LABEL[p]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="People" flag={flags.headcount} hint={parsed?.p.notes || undefined} className="md:col-span-2">
                <Input flag={flags.headcount} inputMode="numeric" value={form.headcount} onChange={(e) => set("headcount", e.target.value.replace(/\D/g, ""))} placeholder="60" />
              </Field>
              <Field label="Systems needed" className="md:col-span-2">
                <Input inputMode="numeric" value={form.minSystems} onChange={(e) => set("minSystems", e.target.value.replace(/\D/g, ""))} placeholder="0" />
              </Field>
              <Field label="Room type" className="md:col-span-2">
                <Select value={form.roomType} onChange={(e) => set("roomType", e.target.value as RoomType | "")}>
                  <option value="">Any</option>
                  {ROOM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Day" flag={flags.date} className="md:col-span-2" hint={form.date ? fmtDay(toIso(form.date, "12:00")) : undefined}>
                <Input flag={flags.date} type="date" min={today} value={form.date} onChange={(e) => set("date", e.target.value)} />
              </Field>
              <Field label="From" flag={flags.start} className="md:col-span-2">
                <Input flag={flags.start} type="time" step={1800} min="08:00" max="20:00" value={form.start} onChange={(e) => set("start", e.target.value)} />
              </Field>
              <Field label="To" flag={flags.end} className="md:col-span-2">
                <Input flag={flags.end} type="time" step={1800} min="08:00" max="20:00" value={form.end} onChange={(e) => set("end", e.target.value)} />
              </Field>
              <Field label="Needs" className="md:col-span-4">
                <div className="flex flex-wrap gap-2">
                  {FEATURES.filter((f) => f !== "computers").map((f) => (
                    <ChipToggle
                      key={f}
                      selected={form.features.includes(f)}
                      onToggle={() => set("features", form.features.includes(f) ? form.features.filter((x) => x !== f) : [...form.features, f])}
                    >
                      {FEATURE_LABEL[f]}
                    </ChipToggle>
                  ))}
                </div>
              </Field>
              <Field label="Near building" className="md:col-span-2" hint="Optional">
                <Select value={form.building} onChange={(e) => set("building", e.target.value)}>
                  <option value="">No preference</option>
                  {BUILDINGS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 md:col-span-6">
                <p className="text-[15px] text-fg-2">
                  {d ? (
                    <>
                      <CalendarClock className="mr-2 inline size-4 text-fg-3" />
                      {fmtWhen(d.during)} · {d.headcount} people
                      {d.minSystems ? ` · ${d.minSystems} systems` : ""}
                    </>
                  ) : (
                    "Fill the marked fields to find rooms."
                  )}
                </p>
                <Button type="submit" size="xl" disabled={busy === "find"}>
                  {busy === "find" ? <LoaderCircle className="animate-spin" /> : null}
                  <RollLabel>
                    Find rooms <ArrowRight />
                  </RollLabel>
                </Button>
              </div>
            </Panel>
          </form>
        </section>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      {/* 03 · Choose */}
      {phase === "choose" && result && d && (
        <section ref={chooseRef} className="flex scroll-mt-24 flex-col gap-8">
          <div>
            <Eyebrow index="03">Choose a room</Eyebrow>
            {result.top.length ? (
              <Headline
                size="3"
                lead={result.top.length === 1 ? "One room fits." : `${result.top.length === 2 ? "Two" : "Three"} rooms fit.`}
                accent="One fits best."
                className="mt-4"
              />
            ) : (
              <Headline size="3" lead="Nothing's free then." accent="Here's what is." className="mt-4" />
            )}
          </div>

          {result.top.length > 0 && (
            <div role="radiogroup" aria-label="Recommended rooms" className="grid gap-5 lg:grid-cols-3">
              {result.top.map((rec, i) => {
                const room = roomOf(rec.roomId);
                if (!room) return null;
                return (
                  <RoomCard
                    key={rec.roomId}
                    room={room}
                    rank={i + 1}
                    rec={rec}
                    meta={`${buildingName(room.buildingId)} · ${room.capacity} seats${room.systemsCount ? ` · ${room.systemsCount} systems` : ""}`}
                    selected={picked === rec.roomId}
                    onSelect={() => setPicked(rec.roomId)}
                  />
                );
              })}
            </div>
          )}

          <WhyNot
            items={result.whyNot
              .map((w) => ({ code: roomOf(w.roomId)?.code ?? "", reason: w.violations[0]?.message ?? "" }))
              .filter((w) => w.code)}
          />

          {(result.alternatives || conflict) && (
            <Alternatives
              alts={conflict?.alternatives ?? result.alternatives!}
              note={conflict?.message}
              during={d.during}
              roomLabel={(id) => roomOf(id)?.code ?? "Room"}
              onTake={(roomId, during) => hold(roomId, { ...d, during })}
              onWaitlist={() => hold(null)}
            />
          )}
        </section>
      )}

      {/* Sticky hold bar */}
      {phase === "choose" && pickedRoom && d && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bone/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-[88rem] flex-wrap items-center gap-4 px-6 py-4 md:px-10">
            <RoomCode code={pickedRoom.code} />
            <p className="min-w-0 flex-1 text-[15px] text-fg-2">
              <span className="font-semibold text-fg">{pickedRoom.name}</span> · {fmtDay(d.during.start)} · {fmtRange(d.during)}
              <span className="hidden text-fg-3 md:inline"> · held for you while it&apos;s approved</span>
            </p>
            <Button ref={holdRef} variant="volt" size="lg" disabled={busy === "hold"} onClick={() => hold(pickedRoom.id)}>
              {busy === "hold" ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
              Hold {pickedRoom.code}
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}

function Alternatives({
  alts,
  note,
  during,
  roomLabel,
  onTake,
  onWaitlist,
}: {
  alts: Alternatives;
  note?: string;
  during: { start: string; end: string };
  roomLabel: (id: string) => string;
  onTake: (roomId: string, during: { start: string; end: string }) => void;
  onWaitlist: () => void;
}) {
  return (
    <Panel tone="ink" className="flex flex-col gap-6 p-6 md:p-8">
      <div>
        <Tag>Never a bare no</Tag>
        <p className="mt-3 text-lg text-fg">{note ?? "Your room isn't free then. Pick another time or a similar room, or wait for one to open up."}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="eyebrow text-fg-3">Same room, other times</p>
          {alts.sameRoomOtherSlot.length ? (
            alts.sameRoomOtherSlot.map((s) => (
              <button
                key={s.interval.start}
                type="button"
                onClick={() => onTake(s.roomId, s.interval)}
                className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.05] px-4 py-3 text-left ring-1 ring-line transition-colors hover:bg-white/[0.1]"
              >
                <span className="flex items-center gap-3">
                  <RoomCode code={roomLabel(s.roomId)} />
                  <span className="text-[15px] text-fg">{fmtWhen(s.interval)}</span>
                </span>
                <ArrowRight className="size-4 text-fg-3" />
              </button>
            ))
          ) : (
            <p className="text-[15px] text-fg-3">No nearby times.</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <p className="eyebrow text-fg-3">Similar rooms, same time</p>
          {alts.similarRoomSameSlot.length ? (
            alts.similarRoomSameSlot.map((r) => (
              <button
                key={r.roomId}
                type="button"
                onClick={() => onTake(r.roomId, during)}
                className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.05] px-4 py-3 text-left ring-1 ring-line transition-colors hover:bg-white/[0.1]"
              >
                <span className="flex items-center gap-3">
                  <RoomCode code={roomLabel(r.roomId)} />
                  <span className="text-[15px] text-fg">{r.why[0]}</span>
                </span>
                <ArrowRight className="size-4 text-fg-3" />
              </button>
            ))
          ) : (
            <p className="text-[15px] text-fg-3">None free at that time.</p>
          )}
        </div>
      </div>
      <Button variant="outline" className="self-start" onClick={onWaitlist}>
        <ListPlus /> Join the waitlist instead
      </Button>
    </Panel>
  );
}
