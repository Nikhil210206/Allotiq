"use client";
// Bell + unread count + popover list, fed by useNotifications (Aditi · D7).
import { Popover } from "@base-ui/react/popover";
import { Bell } from "lucide-react";
import { TZ } from "@/contracts/domain";
import { useNotifications } from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";

const time = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });

export function NotificationBell() {
  const { items, unread, markRead } = useNotifications();
  return (
    <Popover.Root
      onOpenChange={(open) => {
        // Opening the list counts as reading it (after a beat, so the unread dots are seen first).
        if (open && unread) setTimeout(() => void markRead(items.filter((n) => !n.readAt).map((n) => n.id)), 1500);
      }}
    >
      <Popover.Trigger
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative grid size-10 place-items-center rounded-full bg-fg/[0.07] text-fg transition-colors outline-none hover:bg-fg/[0.12] focus-visible:ring-3 focus-visible:ring-ring/40 data-[popup-open]:bg-fg/[0.12]"
      >
        <Bell className="size-[18px]" strokeWidth={2} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-volt px-1 font-mono text-[10px] font-semibold text-ink">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={12} align="end" className="z-50">
          <Popover.Popup className="light w-[min(24rem,calc(100vw-1.5rem))] origin-(--transform-origin) rounded-3xl bg-white p-2 text-ink shadow-2xl ring-1 ring-line transition-[transform,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <Popover.Title className="eyebrow px-3 pt-2.5 pb-2 text-fg-3">Notifications</Popover.Title>
            {items.length === 0 ? (
              <p className="px-3 pt-1 pb-4 text-[15px] text-fg-2">Nothing yet. You&apos;re all caught up.</p>
            ) : (
              <ul className="flex max-h-96 flex-col overflow-y-auto">
                {items.map((n) => (
                  <li key={n.id} className={cn("flex gap-3 rounded-2xl px-3 py-3", !n.readAt && "bg-sunken/70")}>
                    <span
                      className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-forest")}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold">{n.title}</p>
                      {n.body && <p className="text-sm text-fg-2">{n.body}</p>}
                    </div>
                    <time className="shrink-0 font-mono text-xs text-fg-3" dateTime={n.createdAt}>
                      {time.format(new Date(n.createdAt))}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
