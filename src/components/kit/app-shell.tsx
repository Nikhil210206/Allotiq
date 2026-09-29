// The frame every signed-in screen sits in (echo's nav): wordmark, role links, demo clock, AI
// indicator, bell and user pill. tone="ink" for dark pages (the Lab, the kit); admin screens pass
// `ticker` for the live activity strip. Mobile-friendly for /approvals.
import Link from "next/link";
import type { ReactNode } from "react";
import type { UserRole } from "@/contracts/domain";
import { cn } from "@/lib/utils";
import { Wordmark } from "./brand";
import { AiChip } from "./chips";
import { DemoDrawer, LiveClock } from "./demo-controls";
import { Toaster } from "./feedback";
import { ROLE_HOME } from "./nav";
import { NotificationBell } from "./notification-bell";
import { ShellHeader } from "./shell-header";
import { MobileNav, ShellNav } from "./shell-nav";
import { Ticker, type TickerItem } from "./ticker";

export interface ShellUser {
  name: string;
  role: UserRole;
  /** Second line under the name: org, department or role. */
  caption: string;
}

export function AppShell(props: {
  user: ShellUser;
  children: ReactNode;
  /** Groq availability; omit to hide the indicator. */
  ai?: boolean;
  ticker?: TickerItem[];
  tone?: "bone" | "ink";
  /** Full-bleed pages compose their own <Section>s; otherwise content sits in the page column. */
  bleed?: boolean;
  className?: string;
}) {
  const { user, children, ai, ticker, tone = "bone", bleed } = props;
  const dark = tone === "ink";
  return (
    <div
      data-tone={dark ? "dark" : "light"}
      className={cn("flex min-h-dvh flex-col", dark ? "dark bg-ink text-bone" : "light bg-bone text-ink")}
    >
      <ShellHeader tone={dark ? "dark" : "light"}>
        <div className="relative mx-auto flex h-18 w-full max-w-[88rem] items-center gap-6 px-6 md:px-10">
          <Link href={ROLE_HOME[user.role]} aria-label="Allotiq home" className="shrink-0 rounded-lg">
            <Wordmark />
          </Link>
          <div className="flex flex-1 justify-center">
            <ShellNav role={user.role} />
          </div>
          <div className="flex items-center gap-4">
            <LiveClock className="hidden xl:inline-flex" />
            {ai !== undefined && <AiChip online={ai} className="hidden xl:inline-flex" />}
            <NotificationBell />
            <UserPill user={user} />
            <MobileNav role={user.role} user={user} />
          </div>
        </div>
        {ticker && <Ticker items={ticker} label="Live" />}
      </ShellHeader>
      <main
        className={cn(
          "flex flex-1 flex-col",
          !bleed && "mx-auto w-full max-w-[88rem] px-6 pb-20 md:px-10",
          props.className,
        )}
      >
        {children}
      </main>
      <Toaster />
      <DemoDrawer />
    </div>
  );
}

function initials(name: string) {
  const words = name.replace(/^(dr|mr|ms|mrs|prof)\.?\s+/i, "").split(/[\s()]+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}

function UserPill({ user }: { user: ShellUser }) {
  return (
    <div className="hidden h-11 items-center gap-2.5 rounded-full bg-card pr-4 pl-1.5 ring-1 ring-line xl:flex">
      <span className="grid size-8 place-items-center rounded-full bg-volt text-xs font-bold tracking-wide text-ink">
        {initials(user.name)}
      </span>
      <span className="flex max-w-44 flex-col leading-tight">
        <span className="truncate text-sm font-semibold text-fg">{user.name}</span>
        <span className="truncate text-xs text-fg-3">{user.caption}</span>
      </span>
    </div>
  );
}
