// The landing page body (also shown at /kit as the style guide): every kit piece in the
// composition it's meant for. Sample data from the demo scenes. Owner: Nikhil · N2
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Building2, Check, Gauge, Users } from "lucide-react";
import { REQUEST_STATUSES } from "@/contracts/domain";
import { DEFAULT_WEIGHTS, type ScoreBreakdown } from "@/contracts/engine";
import {
  DITHER_FOREST,
  DITHER_GREEN,
  DitherField,
  Eyebrow,
  Headline,
  KpiBand,
  KpiTile,
  Panel,
  Reveal,
  RevealText,
  RollLabel,
  RoomCode,
  ScoreBar,
  ScoreReceipt,
  ScrollWords,
  Section,
  StatusBadge,
  Tag,
  Ticker,
  Wordmark,
  type TickerItem,
} from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function breakdown(parts: Omit<ScoreBreakdown, "weights" | "total" | "notes">, notes: string[] = []): ScoreBreakdown {
  const w = DEFAULT_WEIGHTS;
  const total =
    100 *
    (w.capacityFit * parts.capacityFit +
      w.featureMatch * parts.featureMatch +
      w.proximity * parts.proximity +
      w.scarcity * parts.scarcity +
      w.preference * parts.preference +
      w.energy * parts.energy);
  return { ...parts, weights: w, total, notes };
}

// The "dbms" scene: 60 people, 60 systems, Thursday 14:00–16:00, a C.Tech faculty member.
const TP401 = breakdown(
  { capacityFit: 0.95, featureMatch: 1, proximity: 1, scarcity: 0.72, preference: 0.8, energy: 1, wastedSeats: 6 },
  ["Same building as C.Tech", "64 systems for 60 people", "Snug fit — 6 spare seats"],
);
const RUNNERS_UP = [
  {
    code: "TP-501",
    name: "TP 501 Lab",
    meta: "Tech Park · 74 seats · 72 systems",
    score: breakdown({ capacityFit: 0.8, featureMatch: 1, proximity: 1, scarcity: 0.5, preference: 0.2, energy: 1, wastedSeats: 14 }),
  },
  {
    code: "HT-301",
    name: "HT 301 Lab",
    meta: "Hi-Tech Block · 72 seats · 70 systems",
    score: breakdown({ capacityFit: 0.86, featureMatch: 1, proximity: 0.35, scarcity: 0.6, preference: 0.1, energy: 0, wastedSeats: 12 }),
  },
];

// Requests as people typed or said them.
const INCOMING: TickerItem[] = [
  { id: "1", at: "13:41", status: "pending", text: "Need a lab with 60 systems Thursday 2 to 4 for DBMS lab" },
  { id: "2", at: "13:38", status: "approved", text: "Seminar hall for 120 with a mic, Friday 11 am" },
  { id: "3", at: "13:33", status: "waitlisted", text: "Robotics club build session, any lab after 4" },
  { id: "4", at: "13:29", status: "bumped", text: "Guest lecture — UB Seminar Hall is under maintenance" },
  { id: "5", at: "13:24", status: "checked_in", text: "Coding club weekly contest in TP 402" },
  { id: "6", at: "13:20", status: "approved", text: "Board of studies meeting, 12 people, video call" },
];

const TIMELINE: { at: string; title: string; body?: string; done: boolean }[] = [
  { at: "13:41", title: "Held for you", body: "TP-401 is yours until 15:41 while it's approved.", done: true },
  { at: "13:44", title: "Approved", body: "By the Tech Park labs approver, from their phone.", done: true },
  { at: "14:02", title: "Checked in", body: "QR scan at the door — the no-show clock stops.", done: true },
  { at: "16:00", title: "Completed", done: false },
];

function Why({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5 text-[15px] text-fg-2">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-volt text-ink">
        <Check className="size-3" strokeWidth={3.5} />
      </span>
      {children}
    </li>
  );
}

export function Landing() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <Section
        tone="ink"
        className="flex min-h-[calc(100svh-4.5rem)] flex-col"
        inner="flex flex-1 flex-col justify-center pt-16 pb-12"
        backdrop={
          <>
            <DitherField palette={DITHER_GREEN} sources={[{ x: 0.86, y: 0.52, strength: 1.15 }]} floor={0.22} />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(12_14_13/0.35),rgb(12_14_13/0.8))] md:bg-[linear-gradient(90deg,#0c0e0d_18%,rgb(12_14_13/0.55)_52%,transparent_80%)]"
            />
          </>
        }
        after={<Ticker items={INCOMING} quotes />}
      >
        <Eyebrow pill dot="live" className="self-start">
          Smart room allocation<span className="hidden sm:inline"> · always optimal</span>
        </Eyebrow>
        <RevealText as="h1" className="display-hero mt-8 text-fg">
          Every request.
          <br />
          The right <span className="serif-accent pr-[0.04em] text-hl">room.</span>
        </RevealText>
        <div className="mt-12 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <Reveal delay={0.5}>
            <p className="lede max-w-xl">
              Room finders answer <em>what&apos;s free?</em> Allotiq answers <em>what&apos;s the best arrangement for
              everyone</em> — and keeps it that way when plans change.
            </p>
          </Reveal>
          <Reveal delay={0.65} className="flex flex-wrap gap-3">
            <Link href="/r/new" className={buttonVariants({ size: "xl" })}>
              <RollLabel>
                New request <ArrowRight />
              </RollLabel>
            </Link>
            <Link href="/admin/lab" className={buttonVariants({ variant: "outline", size: "xl" })}>
              <RollLabel>Open the Lab</RollLabel>
            </Link>
          </Reveal>
        </div>
        <p className="eyebrow mt-12 text-fg-3">↳ Move your cursor. Every request makes a wave.</p>
      </Section>

      {/* ── 01 · The problem ─────────────────────────────────── */}
      <Section tone="bone" inner="grid items-center gap-16 py-28 md:py-40 lg:grid-cols-[1.35fr_1fr]">
        <div>
          <Eyebrow index="01">The problem</Eyebrow>
          <ScrollWords className="mt-8 font-display text-[clamp(2rem,3.6vw,3.4rem)] leading-[1.02] font-bold tracking-[-0.035em] text-fg [font-variation-settings:'opsz'_72,'wdth'_90]">
            Campus booking is first come, first served. A 150-seat hall goes to twelve people, a lab sits empty behind a
            no-show, and one maintenance notice cancels four plans. Nobody sees the whole picture.
          </ScrollWords>
          <p className="mt-10 text-[clamp(1.5rem,2.3vw,2.1rem)] leading-tight tracking-[-0.02em] text-fg">
            <span className="serif-accent text-hl">Allotiq plans for everyone,</span> and re-plans when things change.
          </p>
        </div>
        <Panel tone="ink" className="relative aspect-square w-full max-w-[34rem] justify-self-center">
          <DitherField palette={DITHER_GREEN} sources={[]} orbs={[{ x: 0.5, y: 0.52, r: 0.3 }]} cell={5} glow={90} />
          {[
            ["150 seats · 12 people", "top-[14%] left-[8%]"],
            ["No-show · TP-402", "top-[24%] right-[6%]"],
            ["Maintenance · UB-SEM", "bottom-[20%] left-[6%]"],
            ["Clash · Thu 16:00", "right-[10%] bottom-[10%]"],
          ].map(([label, place]) => (
            <span
              key={label}
              className={cn(
                "absolute rounded-full bg-bone px-3 py-1.5 font-mono text-[11px] text-ink shadow-lg",
                place,
              )}
            >
              {label}
            </span>
          ))}
          <p className="eyebrow absolute inset-x-0 bottom-5 text-center text-fg-3">One plan for the whole campus</p>
        </Panel>
      </Section>

      {/* ── 02 · How it decides ──────────────────────────────── */}
      <Section id="decides" tone="volt" inner="py-28 md:py-40">
        <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <Eyebrow index="02">How it decides</Eyebrow>
            <Headline size="1" lead="Every decision" accent="shows its receipt." className="mt-6" onScroll />
          </div>
          <div className="flex items-end gap-5">
            <p className="figure text-[clamp(6rem,13vw,11rem)] leading-[0.78] text-ink">
              91<span className="text-forest/45">/100</span>
            </p>
            <p className="max-w-44 pb-3 text-[15px] font-medium text-ink">for the best room — and every point accounted for.</p>
          </div>
        </div>

        <div className="mt-16 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
          <Panel tone="outline" className="flex flex-col gap-7 p-7 md:p-9">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <RoomCode code="TP-401" />
                <div>
                  <p className="display-4 text-fg">TP 401 Lab</p>
                  <p className="mt-1 text-sm text-fg-3">Tech Park · 66 seats · 64 systems</p>
                </div>
              </div>
              <Tag className="bg-volt text-ink">Best match</Tag>
            </div>
            <p className="rounded-2xl bg-sunken px-4 py-3 font-mono text-[13px] text-fg-2">
              “Need a lab with 60 systems Thursday 2 to 4 for DBMS lab”
            </p>
            <ScoreReceipt score={TP401} caption="best of 12 labs" />
            <ul className="flex flex-col gap-2.5">
              {TP401.notes.map((note) => (
                <Why key={note}>{note}</Why>
              ))}
            </ul>
          </Panel>

          <div className="flex flex-col gap-5">
            {RUNNERS_UP.map((room, i) => (
              <Panel key={room.code} tone="outline" className="flex flex-col gap-5 p-6 md:p-7">
                <div className="flex items-center gap-3.5">
                  <span className="eyebrow w-6 text-fg-3">0{i + 2}</span>
                  <RoomCode code={room.code} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-fg">{room.name}</p>
                    <p className="truncate text-sm text-fg-3">{room.meta}</p>
                  </div>
                </div>
                <ScoreBar score={room.score} size="md" legend={i === 0} />
              </Panel>
            ))}
            <Panel tone="ink" className="flex flex-col gap-3 p-6 md:p-7">
              <Tag>Why not the auditorium?</Tag>
              <p className="text-lg leading-snug text-fg">
                1,200 seats for 60 people.{" "}
                <span className="serif-accent text-[1.35em] text-hl">Kept free for bigger needs.</span>
              </p>
            </Panel>
          </div>
        </div>
      </Section>

      {/* ── 03 · The Lab ─────────────────────────────────────── */}
      <Section id="lab" tone="bone" inner="py-28 md:py-40">
        <Eyebrow index="03">The Lab</Eyebrow>
        <Headline size="1" lead="Same eight requests." accent="A better plan." className="mt-6" onScroll />
        <div className="mt-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <p className="lede max-w-2xl">
            First come, first served isn&apos;t fair — it&apos;s just first. The engine places everyone, wastes fewer seats
            and lights fewer buildings.
          </p>
          <Link href="/admin/lab" className={buttonVariants({ size: "lg" })}>
            <RollLabel>
              Replay it in the Lab <ArrowRight />
            </RollLabel>
          </Link>
        </div>
        <Reveal onScroll className="mt-14">
          <KpiBand
            tone="forest"
            items={[
              { label: "requests placed", value: 8, total: 8, delta: { value: 3, label: "vs FCFS", better: "up" } },
              { label: "priority requests lost", value: 0, delta: { value: -2, label: "vs FCFS", better: "down" } },
              { label: "seats wasted", value: 38, delta: { value: -102, label: "vs FCFS", better: "down" } },
              { label: "buildings lit", value: 3, delta: { value: -2, label: "vs FCFS", better: "down" } },
            ]}
          />
        </Reveal>
      </Section>

      {/* ── 04 · Lifecycle ───────────────────────────────────── */}
      <Section tone="ink" inner="grid items-center gap-14 py-28 md:py-40 lg:grid-cols-2">
        <div>
          <Eyebrow index="04">Lifecycle</Eyebrow>
          <Headline size="2" lead="Ten states." accent="Never a bare no." className="mt-6" onScroll />
          <p className="lede mt-8 max-w-xl">
            Every clash comes with alternatives. Every state has a label, not just a colour — and the live ones pulse.
          </p>
          <div className="mt-10 flex max-w-xl flex-wrap gap-2.5">
            {REQUEST_STATUSES.map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
        </div>

        <Panel tone="ink" className="flex flex-col gap-7 p-7 md:p-9">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="display-4 text-fg">DBMS Lab — III Year A</p>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-fg-3">
                <RoomCode code="TP-401" /> Thu 14:00–16:00 · 60 people
              </p>
            </div>
            <StatusBadge status="checked_in" size="lg" />
          </div>
          <ol className="relative flex flex-col gap-6 border-l border-line pl-6">
            {TIMELINE.map((step) => (
              <li key={step.title} className="relative">
                <span
                  className={cn(
                    "absolute top-1.5 left-[calc(-1.8125rem-0.5px)] size-2.5 rounded-full ring-4 ring-ink-2",
                    step.done ? "bg-volt" : "bg-fg-3/50",
                  )}
                  aria-hidden
                />
                <p className="flex items-baseline gap-3">
                  <span className="font-mono text-xs text-fg-3">{step.at}</span>
                  <span className={cn("font-semibold", step.done ? "text-fg" : "text-fg-3")}>{step.title}</span>
                </p>
                {step.body && <p className="mt-1 text-[15px] text-fg-2">{step.body}</p>}
              </li>
            ))}
          </ol>
          <div className="rounded-2xl bg-white/[0.04] p-5 ring-1 ring-line">
            <p className="eyebrow text-fg-3">Re-planned by the engine</p>
            <p className="mt-2 text-[15px] leading-relaxed text-fg">
              UB Seminar Hall is under maintenance on Thursday. You&apos;ve been moved to TP Mini Hall — same time, 180
              seats, projector and mic.
            </p>
          </div>
        </Panel>
      </Section>

      {/* ── 05 · Insight ─────────────────────────────────────── */}
      <Section id="insight" tone="mint" inner="grid gap-14 py-28 md:py-40 lg:grid-cols-[1fr_1.25fr] lg:items-center">
        <div>
          <Eyebrow index="05" className="text-ink/65">
            Insight · simulated month
          </Eyebrow>
          <p className="display-2 mt-6 text-ink">Ghost bookings</p>
          <p className="figure mt-4 text-[clamp(7rem,15vw,13rem)] leading-[0.8] text-ink">
            17<span className="text-[0.45em]">%</span>
          </p>
          <p className="mt-6 max-w-sm text-lg text-ink/80">
            of approved bookings were never checked in — most of them club slots after 4 pm. Now they&apos;re released
            automatically.
          </p>
          <Button variant="default" size="lg" className="mt-8">
            <RollLabel>
              Ask the dashboard <ArrowRight />
            </RollLabel>
          </Button>
        </div>
        <Reveal onScroll className="grid gap-4 sm:grid-cols-2">
          <KpiTile icon={<Users />} label="Unmet demand" value={7} unit="requests" badge={<Tag>100+ seats</Tag>} />
          <KpiTile icon={<Building2 />} label="Idle building-hours" value={42} unit="h" badge={<Tag>AC could be off</Tag>} />
          <KpiTile
            icon={<Gauge />}
            label="Peak occupancy"
            value={86}
            unit="%"
            badge={<Tag>Wed 10–12</Tag>}
            delta={{ value: 9, label: "vs last week", better: "up" }}
            className="sm:col-span-2"
          />
        </Reveal>
      </Section>

      {/* ── 06 · The kit ─────────────────────────────────────── */}
      <Section tone="bone" inner="py-28 md:py-36">
        <Eyebrow index="06">The kit</Eyebrow>
        <Headline size="2" lead="Bone, ink," accent="and one loud volt." className="mt-6" onScroll />
        <div className="mt-14 grid gap-5 lg:grid-cols-[1fr_1.1fr]">
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["Bone", "#F2F0E9", "bg-bone ring-1 ring-line text-ink"],
                ["Ink", "#0C0E0D", "bg-ink text-bone"],
                ["Volt", "#D4FF3A", "bg-volt text-ink"],
                ["Forest", "#00583F", "bg-forest text-bone"],
                ["Mint", "#41D58C", "bg-mint text-ink"],
                ["White", "#FFFFFF", "bg-white text-ink"],
              ] as const
            ).map(([name, hex, cls]) => (
              <div key={name} className={cn("flex aspect-square flex-col justify-end rounded-[1.25rem] p-4", cls)}>
                <p className="font-semibold">{name}</p>
                <p className="font-mono text-xs opacity-65">{hex}</p>
              </div>
            ))}
          </div>
          <Panel tone="white" className="flex flex-col justify-between gap-8 p-8">
            <div>
              <p className="display-2 text-fg">
                Bricolage, <span className="serif-accent text-hl">condensed.</span>
              </p>
              <p className="mt-4 text-lg text-fg-2">
                Geist for everything you read. Instrument Serif for one word that matters. Geist Mono for labels, codes
                and times.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg">
                <RollLabel>
                  Submit request <ArrowRight />
                </RollLabel>
              </Button>
              <Button variant="volt" size="lg">
                Say it
              </Button>
              <Button variant="outline" size="lg">
                See alternatives
              </Button>
              <Button variant="secondary" size="lg">
                Save draft
              </Button>
              <Button variant="link">Why this room?</Button>
            </div>
          </Panel>
        </div>
      </Section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <Section
        tone="forest"
        inner="flex flex-col items-center py-36 text-center md:py-52"
        backdrop={
          <>
            <DitherField palette={DITHER_FOREST} sources={[{ x: 0.5, y: 1.08, strength: 1.2 }]} floor={0.35} glow={140} />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-[linear-gradient(0deg,#00583f_30%,transparent)]"
            />
          </>
        }
        after={
          <footer className="mx-auto flex max-w-[88rem] flex-col gap-6 px-6 pt-4 pb-10 md:flex-row md:items-end md:justify-between md:px-10">
            <div className="flex flex-col gap-3">
              <Wordmark />
              <p className="max-w-sm text-sm text-fg-3">
                Every request. The right room. Built for Vision2Web 2026, Industry Innovation 2.
              </p>
            </div>
            <nav className="flex gap-6 text-sm text-fg-2">
              <Link href="/availability">Availability</Link>
              <Link href="/r">My bookings</Link>
              <Link href="/admin/dashboard">Dashboard</Link>
            </nav>
          </footer>
        }
      >
        <Headline size="1" lead="Need a room?" accent="Just say it." onScroll />
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <Link href="/r/new" className={buttonVariants({ size: "xl" })}>
            <RollLabel>
              New request <ArrowRight />
            </RollLabel>
          </Link>
          <Link href="/availability" className={buttonVariants({ variant: "outline", size: "xl" })}>
            <RollLabel>See what&apos;s free</RollLabel>
          </Link>
        </div>
      </Section>
    </>
  );
}
