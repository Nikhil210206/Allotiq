"use client";
// Demo control room: the virtual clock, reset, persona switching, a shortcut per demo scene, and the
// QR the judges scan to join as the approver. Ctrl + . opens the same controls anywhere. Owner: Nikhil
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { DemoControls, Eyebrow, Headline, Panel, Tag } from "@/components/kit";
import { JUDGE_JOIN_TOKEN } from "@/lib/seed/catalog";

const SCENES = [
  { n: "01", title: "Say it, get the right room", who: "Nikhil · faculty", href: "/r/new", note: "“Need a lab with 60 systems Thursday 2 to 4 for DBMS lab” → TP-401 · judge approves on their phone" },
  { n: "02", title: "The Lab: FCFS vs the engine", who: "Aaditya · admin", href: "/admin/lab", note: "Play FCFS → 6/8, the DBMS exam and Networking lab hit the wall → Run engine → 8/8" },
  { n: "03", title: "Maintenance, re-planned", who: "Aditi · admin", href: "/admin/disruptions", note: "UB Seminar Hall, Thursday 08:00–18:00 → 4 affected · 3 rehomed · 1 offered 6 PM → Apply" },
  { n: "04", title: "The no-show frees a room", who: "Aditi · admin", href: "/availability", note: "TP-402 at 14:00 isn't checked in → Jump to 14:16 → Robotics Club gets it" },
  { n: "05", title: "What the campus learned", who: "Nikhil · admin", href: "/admin/dashboard", note: "Heatmap · 18% ghost bookings · 7 unmet · Ask: “Which labs are underused on Fridays?”" },
];

export function Demo() {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setOrigin(window.location.origin), 0);
    return () => clearTimeout(t);
  }, []);
  // /join checks the seeded token and signs in as the demo approver; unlike the role cards it works in
  // production without DEMO_MODE.
  const joinUrl = `${origin}/join?t=${encodeURIComponent(JUDGE_JOIN_TOKEN)}`;

  return (
    <div className="flex flex-col gap-10 pt-6 pb-16 md:pt-10">
      <header className="flex flex-col gap-6">
        <Eyebrow>Demo controls · Ctrl + . anywhere</Eyebrow>
        <Headline as="h1" size="1" lead="Four minutes." accent="Five scenes." />
      </header>
      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Panel tone="ink" className="p-7 md:p-10">
          <DemoControls />
        </Panel>
        <Panel tone="volt" className="flex flex-col items-start gap-5 p-7 md:p-10">
          <Eyebrow className="text-ink/60">Judges · scan to approve</Eyebrow>
          <div className="rounded-2xl bg-white p-4">{origin ? <QRCodeSVG value={joinUrl} size={196} level="M" /> : <div className="size-[196px]" />}</div>
          <p className="text-[15px] text-ink/80">
            Opens Allotiq on your phone as the approver for every Tech Park lab — scene 1&apos;s request lands in your queue.
          </p>
          <Tag className="bg-ink/10 text-ink">Fallback: Nikhil&apos;s phone is signed in</Tag>
        </Panel>
      </div>
      <div className="flex flex-col gap-3">
        {SCENES.map((s) => (
          <Link
            key={s.n}
            href={s.href}
            className="group grid items-center gap-4 rounded-[1.5rem] bg-white p-5 ring-1 ring-line transition-shadow hover:ring-ink/30 md:grid-cols-[4rem_1fr_auto] md:p-6"
          >
            <span className="figure text-[2.5rem] text-fg-3">{s.n}</span>
            <span>
              <span className="block text-lg font-semibold text-fg">{s.title}</span>
              <span className="mt-1 block text-[14px] text-fg-2">{s.note}</span>
            </span>
            <span className="flex items-center gap-3">
              <Tag>{s.who}</Tag>
              <ArrowUpRight className="size-5 text-fg-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
