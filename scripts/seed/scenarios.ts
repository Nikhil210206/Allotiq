// Demo scenarios: clash-8 + dbms (Aaditya · A9), disruption + no-show (Aditi · D10).
// Runs after the catalog and history; use ids from ./catalog and times relative to `anchor` (Wed 13:50 IST).
import type { SupabaseClient } from "@supabase/supabase-js";
import { ids } from "@/lib/seed/catalog";
import { stableId } from "@/lib/seed/random";
import { addDaysIso, istDate, toIso } from "@/lib/time";
import { PURPOSE_PRIORITY } from "@/contracts/domain";

type RequestStatus = "waitlisted" | "pending" | "approved" | "checked_in" | "completed" | "auto_released" | "cancelled" | "expired" | "bumped";

function holdExpiry(startIso: string, at: Date) {
  const t = at.getTime();
  return new Date(Math.max(t + 10 * 60_000, Math.min(t + 120 * 60_000, Date.parse(startIso) - 30 * 60_000))).toISOString();
}

export async function seedScenarios(db: SupabaseClient, anchor: string): Promise<void> {
  const day0 = istDate(anchor);
  const at = (day: number, hhmm: string) => toIso(addDaysIso(day0, day), hhmm);
  const created = new Date(Date.parse(anchor) - 3 * 3600_000).toISOString();

  const fixtures = [
    { key: "noshow", who: "coding-club", title: "Weekly coding contest", purpose: "club_event", headcount: 36, minSystems: 36, type: "lab", day: 0, from: "14:00", to: "15:30", room: "TP-402", status: "approved" },
    { key: "waitlist", who: "robotics-club", title: "Bot build session", purpose: "club_event", headcount: 30, minSystems: 30, type: "lab", day: 0, from: "14:30", to: "15:30", room: null, status: "waitlisted" },
    { key: "d1", who: "priya", title: "Guest lecture: Cloud at scale", purpose: "department_event", headcount: 120, features: ["projector", "mic"], type: "seminar_hall", day: 1, from: "09:00", to: "11:00", room: "UB-SEM", status: "approved" },
    { key: "d2", who: "ctech-office", title: "Alumni talk", purpose: "department_event", headcount: 90, features: ["mic"], type: "seminar_hall", day: 1, from: "11:30", to: "13:00", room: "UB-SEM", status: "approved" },
    { key: "d3", who: "workshop-cell", title: "Resume clinic", purpose: "club_event", headcount: 70, type: "seminar_hall", day: 1, from: "14:00", to: "16:00", room: "UB-SEM", status: "approved" },
    { key: "d4", who: "ai-club", title: "GenAI workshop", purpose: "club_event", headcount: 140, features: ["stage", "mic"], type: "seminar_hall", day: 1, from: "16:00", to: "18:00", room: "UB-SEM", status: "approved" },
    { key: "tpsem", who: "arun", title: "Department seminar", purpose: "department_event", headcount: 150, features: ["stage"], type: "seminar_hall", day: 1, from: "16:00", to: "18:00", room: "TP-SEM", status: "approved" },
    { key: "ub210", who: "meena", title: "Web Technologies Lab — II Year A", purpose: "academic", headcount: 60, minSystems: 60, type: "lab", day: 1, from: "14:00", to: "16:00", room: "UB-210", status: "approved" },
    { key: "bel104", who: "karthik", title: "CAD/CAM Lab — III Year C", purpose: "academic", headcount: 58, minSystems: 58, type: "lab", day: 1, from: "14:00", to: "16:00", room: "BEL-104", status: "approved" },
    { key: "q1", who: "arun", title: "Data Analytics Lab — III Year A", purpose: "academic", headcount: 64, minSystems: 64, type: "lab", day: 1, from: "10:00", to: "12:00", room: "TP-501", status: "pending" },
    { key: "q2", who: "ai-club", title: "ML study group", purpose: "club_event", headcount: 40, minSystems: 40, type: "lab", day: 1, from: "17:00", to: "19:00", room: "TP-601", status: "pending" },
    { key: "q3", who: "rahul", title: "Project team meet", purpose: "student_activity", headcount: 24, minSystems: 20, type: "lab", day: 2, from: "15:00", to: "16:00", room: "TP-402", status: "pending" },
    { key: "p1", who: "priya", title: "Compiler Design Lab — III Year A", purpose: "academic", headcount: 38, minSystems: 38, type: "lab", day: 1, from: "11:00", to: "13:00", room: "TP-402", status: "pending" },
    { key: "p2", who: "priya", title: "Operating Systems — II Year B", purpose: "academic", headcount: 55, features: ["projector"], type: "classroom", day: 2, from: "10:00", to: "11:00", room: "TP-101", status: "approved" },
  ];

  const rows = fixtures.map((f) => {
    const startIso = at(f.day, f.from);
    return {
      id: stableId("mock-request", f.key),
      requester_id: ids.user(f.who),
      title: f.title,
      purpose: f.purpose,
      priority: PURPOSE_PRIORITY[f.purpose as keyof typeof PURPOSE_PRIORITY],
      headcount: f.headcount,
      min_systems: f.minSystems ?? 0,
      required_features: f.features ?? [],
      room_type: f.type,
      during: `[${startIso},${at(f.day, f.to)})`,
      room_id: f.room ? ids.room(f.room) : null,
      status: f.status,
      hold_expires_at: f.status === "pending" ? holdExpiry(startIso, new Date(Date.parse(anchor) - 20 * 60_000)) : null,
      source: "seed",
      created_at: created,
      last_action_at: created,
      last_actor_id: ids.user(f.who),
      last_action: "created",
    };
  });

  const { error } = await db.from("requests").upsert(rows);
  if (error) throw new Error(`scenarios: ${error.message}`);
}
