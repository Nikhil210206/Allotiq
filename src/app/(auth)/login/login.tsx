"use client";
// Sign in: pick a demo persona (role cards). ?as=<persona> signs straight in — the judges' QR uses it.
// Real campus sign-in (Supabase Auth, Aditi · D2) slots in behind the same /api/demo/login call.
// Owner: Nikhil (UI) · Aditi (auth)
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { DITHER_GREEN, DitherField, Eyebrow, Headline, Wordmark, toast } from "@/components/kit";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const CARDS = [
  { persona: "faculty", name: "Dr. Priya Raman", role: "Faculty · C.Tech", does: "Books labs and classrooms for her courses." },
  { persona: "club", name: "AI Club", role: "Student club", does: "Workshops, study groups, the odd hackathon." },
  { persona: "student", name: "Rahul S", role: "Student · CINTEL", does: "Project meetings and group study." },
  { persona: "approver", name: "Judge (demo approver)", role: "Approver · Tech Park labs", does: "Approves requests from their phone." },
  { persona: "admin", name: "Facilities Office", role: "Admin", does: "Rooms, maintenance, the Lab and the dashboard." },
] as const;

export function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const auto = useRef(false);

  const signIn = useCallback(
    async (persona: string) => {
      setBusy(persona);
      try {
        const { redirect } = await api.demo.login(persona);
        router.push(redirect);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Couldn't sign in", "error");
        setBusy(null);
      }
    },
    [router],
  );

  useEffect(() => {
    const as = params.get("as");
    if (!as || !CARDS.some((c) => c.persona === as)) return;
    // Guard inside the timer: Strict Mode runs this effect twice and cancels the first timer.
    const t = setTimeout(() => {
      if (auto.current) return;
      auto.current = true;
      void signIn(as);
    }, 0);
    return () => clearTimeout(t);
  }, [params, signIn]);

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section data-tone="dark" className="dark relative isolate flex min-h-[22rem] flex-col justify-between overflow-hidden bg-ink p-8 text-bone md:p-12">
        <DitherField palette={DITHER_GREEN} sources={[{ x: 0.7, y: 1.1, strength: 1.1 }]} floor={0.3} />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(12_14_13/0.7),transparent_55%)]" aria-hidden />
        <Wordmark className="relative" />
        <div className="relative">
          <Headline as="h1" size="1" lead="Every request." accent="The right room." />
          <p className="lede mt-6 max-w-md">Sign in to book, approve or run the campus — and watch the engine keep it optimal.</p>
        </div>
      </section>
      <section data-tone="light" className="light flex flex-col justify-center gap-8 bg-bone p-8 text-ink md:p-12">
        <div>
          <Eyebrow>Sign in · demo roles</Eyebrow>
          <p className="display-3 mt-4 text-fg">Who are you today?</p>
        </div>
        <ul className="flex flex-col gap-3">
          {CARDS.map((c) => (
            <li key={c.persona}>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => signIn(c.persona)}
                className={cn(
                  "group flex w-full items-center gap-4 rounded-[1.5rem] bg-white p-5 text-left ring-1 ring-line transition-[box-shadow] hover:ring-ink/40 disabled:opacity-60",
                  busy === c.persona && "ring-2 ring-ink",
                )}
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-volt text-sm font-bold text-ink">
                  {c.name.replace(/^Dr\.\s*/, "").split(/[\s(]+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-semibold text-fg">{c.name}</span>
                  <span className="block font-mono text-[11px] tracking-[0.12em] text-fg-3 uppercase">{c.role}</span>
                  <span className="mt-1 block text-[14px] text-fg-2">{c.does}</span>
                </span>
                {busy === c.persona ? (
                  <LoaderCircle className="size-5 animate-spin text-fg-3" />
                ) : (
                  <ArrowRight className="size-5 text-fg-3 transition-transform group-hover:translate-x-1" />
                )}
              </button>
            </li>
          ))}
        </ul>
        <p className="text-[13px] text-fg-3">Campus email sign-in switches on with the production auth — demo roles use seeded accounts.</p>
      </section>
    </div>
  );
}
