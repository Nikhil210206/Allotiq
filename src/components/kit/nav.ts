// Role-based navigation for the AppShell.
import {
  Building2,
  CalendarPlus,
  ChartNoAxesColumn,
  FlaskConical,
  Inbox,
  LayoutGrid,
  ListChecks,
  ScrollText,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "@/contracts/domain";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV: Record<UserRole, NavItem[]> = {
  requester: [
    { href: "/r/new", label: "New request", icon: CalendarPlus },
    { href: "/r", label: "My bookings", icon: ListChecks },
    { href: "/availability", label: "Availability", icon: LayoutGrid },
  ],
  approver: [
    { href: "/approvals", label: "Approvals", icon: Inbox },
    { href: "/availability", label: "Availability", icon: LayoutGrid },
  ],
  admin: [
    { href: "/admin/dashboard", label: "Dashboard", icon: ChartNoAxesColumn },
    { href: "/admin/lab", label: "Lab", icon: FlaskConical },
    { href: "/admin/disruptions", label: "Disruptions", icon: TriangleAlert },
    { href: "/admin/resources", label: "Resources", icon: Building2 },
    { href: "/admin/audit", label: "Audit", icon: ScrollText },
    { href: "/availability", label: "Availability", icon: LayoutGrid },
  ],
};

export const ROLE_HOME: Record<UserRole, string> = {
  requester: "/r/new",
  approver: "/approvals",
  admin: "/admin/dashboard",
};

export const ROLE_LABEL: Record<UserRole, string> = {
  requester: "Requester",
  approver: "Approver",
  admin: "Admin",
};

/** The nav item for this path: the longest href that is the path or a parent of it. */
export function activeHref(items: NavItem[], pathname: string): string | null {
  let best: string | null = null;
  for (const { href } of items) {
    const match = pathname === href || pathname.startsWith(`${href}/`);
    if (match && (!best || href.length > best.length)) best = href;
  }
  return best;
}
