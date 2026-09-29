"use client";
// AppShell's interactive parts: active-route links (desktop) and the menu sheet (mobile).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { UserRole } from "@/contracts/domain";
import { cn } from "@/lib/utils";
import { NAV, activeHref } from "./nav";

export function ShellNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const items = NAV[role];
  const active = activeHref(items, pathname);
  return (
    <nav aria-label="Main" className="hidden items-center gap-2 lg:flex">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.href === active ? "page" : undefined}
          className={cn(
            "relative rounded-full px-3.5 py-2 text-[15px] text-fg-3 transition-colors hover:text-fg",
            "after:absolute after:bottom-0 after:left-1/2 after:h-0.5 after:w-5 after:-translate-x-1/2 after:rounded-full after:bg-fg after:opacity-0 after:transition-opacity",
            "aria-[current=page]:font-medium aria-[current=page]:text-fg aria-[current=page]:after:opacity-100",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function MobileNav({ role, user }: { role: UserRole; user: { name: string; caption: string } }) {
  const pathname = usePathname();
  // Open only on the path it was opened on, so navigating closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const items = NAV[role];
  const active = activeHref(items, pathname);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpenOn(open ? null : pathname)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        className="grid size-10 place-items-center rounded-full bg-fg/[0.07]"
      >
        <span className="relative block h-3 w-4" aria-hidden>
          <span
            className={cn(
              "absolute left-0 h-[1.5px] w-4 bg-current transition-transform",
              open ? "top-1.5 rotate-45" : "top-0",
            )}
          />
          <span
            className={cn(
              "absolute left-0 h-[1.5px] w-4 bg-current transition-transform",
              open ? "top-1.5 -rotate-45" : "top-3",
            )}
          />
        </span>
      </button>
      {open && (
        <div
          id="mobile-nav"
          className="absolute inset-x-3 top-[calc(100%+0.5rem)] z-50 rounded-3xl bg-card p-3 text-fg shadow-2xl ring-1 ring-line"
        >
          <p className="px-4 pt-2 pb-3 text-sm">
            <span className="font-semibold">{user.name}</span>
            <span className="text-fg-3"> · {user.caption}</span>
          </p>
          <nav aria-label="Main" className="flex flex-col">
            {items.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={href === active ? "page" : undefined}
                className="block rounded-2xl px-4 py-3 text-lg text-fg-2 aria-[current=page]:bg-volt aria-[current=page]:text-ink"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
