"use client";
// Full-page status screens (404, crashes) in the landing's look: ink field, wave dither, the status
// code set huge in the display cut. `StatusPanel` is the in-shell version for errors inside a signed-in
// layout, so the nav stays put and the person can move on.
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Wordmark } from "./brand";
import { DITHER_GREEN, DitherField } from "./dither-field";
import { Panel } from "./panel";
import { Eyebrow, Headline } from "./section";

interface StatusProps {
  /** Shown huge: "404", "500". */
  code: string;
  eyebrow: string;
  lead: ReactNode;
  accent?: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
  /** Small mono line under the actions, e.g. an error digest to quote from the logs. */
  detail?: string;
}

export function StatusScreen({ code, eyebrow, lead, accent, body, actions, detail }: StatusProps) {
  return (
    <div data-tone="dark" className="dark relative isolate flex min-h-dvh flex-col overflow-hidden bg-ink text-bone">
      <DitherField palette={DITHER_GREEN} sources={[{ x: 0.82, y: 1.1, strength: 1.05 }]} floor={0.26} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgb(12_14_13/0.85),rgb(12_14_13/0.35)_60%,transparent)]" aria-hidden />
      <header className="relative mx-auto flex h-18 w-full max-w-[88rem] items-center px-6 md:px-10">
        <Link href="/" aria-label="Allotiq home" className="rounded-lg">
          <Wordmark />
        </Link>
      </header>
      <main className="relative mx-auto flex w-full max-w-[88rem] flex-1 flex-col justify-center gap-7 px-6 pb-24 md:px-10">
        <Eyebrow>{eyebrow}</Eyebrow>
        <p aria-hidden className="display-hero text-volt">{code}</p>
        <Headline as="h1" size="2" lead={lead} accent={accent} reveal={false} />
        {body && <p className="lede max-w-xl">{body}</p>}
        {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
        {detail && <p className="font-mono text-[11px] tracking-[0.12em] text-fg-3 uppercase">{detail}</p>}
      </main>
    </div>
  );
}

/** error.tsx body for the signed-in areas: the shell (nav, bell) stays; only the page is replaced. */
export function ShellError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <StatusPanel
      eyebrow="Something broke"
      lead="This page didn't"
      accent="load."
      body="Anything you'd already sent is safe. Try again — if it keeps happening, go back and take another route."
      detail={error.digest ? `Ref ${error.digest}` : undefined}
      actions={
        <>
          <Button variant="volt" onClick={() => retry()}>
            <RotateCcw /> Try again
          </Button>
          <Button variant="outline" onClick={() => window.history.back()}>
            <ArrowLeft /> Go back
          </Button>
        </>
      }
    />
  );
}

export function StatusPanel({ eyebrow, lead, accent, body, actions, detail, className }: Omit<StatusProps, "code"> & { className?: string }) {
  return (
    <Panel tone="white" className={cn("mt-10 flex flex-col items-start gap-5 p-8 md:mt-16 md:p-12", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Headline as="h1" size="3" lead={lead} accent={accent} reveal={false} />
      {body && <p className="max-w-xl text-[16px] leading-relaxed text-fg-2">{body}</p>}
      {actions && <div className="mt-1 flex flex-wrap gap-3">{actions}</div>}
      {detail && <p className="font-mono text-[11px] tracking-[0.12em] text-fg-3 uppercase">{detail}</p>}
    </Panel>
  );
}
