// Home: the public landing page (also the demo's title slide). Signed-in users use the nav to jump
// straight to their role's home. Owner: Nikhil
import Link from "next/link";
import { DemoDrawer, RollLabel, Toaster, Wordmark } from "@/components/kit";
import { ShellHeader } from "@/components/kit/shell-header";
import { Landing } from "@/components/landing";
import { buttonVariants } from "@/components/ui/button";

const LINKS = [
  { href: "#decides", label: "How it decides" },
  { href: "#lab", label: "The Lab" },
  { href: "#insight", label: "Insight" },
];

export default function Home() {
  return (
    <div data-tone="dark" className="dark flex min-h-dvh flex-col bg-ink text-bone">
      <ShellHeader tone="dark">
        <div className="mx-auto flex h-18 w-full max-w-[88rem] items-center gap-6 px-6 md:px-10">
          <Link href="/" aria-label="Allotiq home" className="shrink-0">
            <Wordmark />
          </Link>
          <nav aria-label="Sections" className="hidden flex-1 justify-center gap-2 md:flex">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className="rounded-full px-3.5 py-2 text-[15px] text-fg-3 transition-colors hover:text-fg">
                {l.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 md:ml-0">
            <Link href="/availability" className="hidden text-[15px] text-fg-3 hover:text-fg sm:inline">
              What&apos;s free
            </Link>
            <Link href="/login" className={buttonVariants({ size: "sm" })}>
              <RollLabel>Sign in</RollLabel>
            </Link>
          </div>
        </div>
      </ShellHeader>
      <main className="flex flex-1 flex-col">
        <Landing />
      </main>
      <Toaster />
      <DemoDrawer />
    </div>
  );
}
