// Demo scenarios: clash-8 + dbms (Aaditya · A9), disruption + no-show (Aditi · D10).
// Runs after the catalog and history; use ids from ./catalog and times relative to `anchor` (Wed 13:50 IST).
import type { SupabaseClient } from "@supabase/supabase-js";
import { PURPOSE_PRIORITY } from "@/contracts/domain";
import type { EngineRequest } from "@/contracts/engine";
import { addDays, istDayOf, istIso, stableId } from "@/lib/seed/random";
import { ids } from "./catalog";
import { addDaysIso, istDate, toIso } from "@/lib/time";

export async function seedLabScenarios(db: SupabaseClient, anchor: string): Promise<void> {
  const wednesday = istDayOf(new Date(anchor));
  const thursday = addDays(wednesday, 1);
  const makeRequest = (scenario: string, key: string, fields: {
    requester: string;
    department?: string;
    label: string;
    headcount: number;
    minSystems?: number;
    features?: EngineRequest["features"];
    roomType?: EngineRequest["roomType"];
    purpose: keyof typeof PURPOSE_PRIORITY;
    minute: number;
  }): EngineRequest => ({
    id: stableId(`lab-${scenario}`, key),
    requesterId: ids.user(fields.requester),
    deptId: fields.department ? ids.department(fields.department) : null,
    headcount: fields.headcount,
    minSystems: fields.minSystems ?? 0,
    features: fields.features ?? [],
    ...(fields.roomType ? { roomType: fields.roomType } : {}),
    interval: {
      start: istIso(thursday, 16 * 60),
      end: istIso(thursday, 18 * 60),
    },
    priority: PURPOSE_PRIORITY[fields.purpose],
    createdAt: istIso(addDays(wednesday, -2), fields.minute),
    history: {},
    label: fields.label,
  });

  // Checked against the real solvers: in this room pool FCFS places 6/8 and strands both priority requests
  // (the exam and the academic lab — the clubs took the labs first); the engine places 8/8.
  const clashRooms = ["TP-402", "UB-211", "HT-302", "TP-101", "HT-101", "UB-202", "BEL-SEM", "UB-BR"].map((code) => ids.room(code));
  const clashRequests = [
    makeRequest("clash-8", "coding", { requester: "coding-club", label: "Coding Club", headcount: 38, purpose: "club_event", minute: 600 }),
    makeRequest("clash-8", "workshop", { requester: "workshop-cell", label: "Workshop Cell", headcount: 34, purpose: "club_event", minute: 605 }),
    makeRequest("clash-8", "ai", { requester: "ai-club", label: "AI Club", headcount: 40, features: ["projector"], purpose: "club_event", minute: 610 }),
    makeRequest("clash-8", "lecture", { requester: "rahul", department: "CINTEL", label: "Student workshop", headcount: 45, features: ["projector"], purpose: "student_activity", minute: 615 }),
    makeRequest("clash-8", "networking", { requester: "priya", department: "CTECH", label: "Networking lab", headcount: 36, minSystems: 36, features: ["computers"], roomType: "lab", purpose: "academic", minute: 620 }),
    makeRequest("clash-8", "dbms-exam", { requester: "arun", department: "DSBS", label: "DBMS exam", headcount: 30, minSystems: 30, features: ["computers"], roomType: "lab", purpose: "exam", minute: 625 }),
    makeRequest("clash-8", "seminar", { requester: "karthik", department: "MECH", label: "Department seminar", headcount: 70, features: ["projector", "mic"], purpose: "department_event", minute: 630 }),
    makeRequest("clash-8", "review", { requester: "meena", department: "ECE", label: "Project review", headcount: 18, features: ["projector"], roomType: "meeting_room", purpose: "meeting", minute: 635 }),
  ];
  const dbmsRequests = [
    {
      ...makeRequest("dbms", "dbms-lab", { requester: "priya", department: "CTECH", label: "DBMS Lab", headcount: 60, minSystems: 60, features: ["computers"], roomType: "lab", purpose: "academic", minute: 600 }),
      interval: { start: istIso(thursday, 14 * 60), end: istIso(thursday, 16 * 60) },
    },
  ];

  const { error } = await db.from("lab_scenarios").upsert([
    {
      id: "clash-8",
      name: "Thursday clash-8",
      description: "Eight requests compete for campus rooms on Thursday afternoon.",
      // The lab_scenarios.requests column also carries an optional room pool: { roomIds, requests }.
      requests: { roomIds: clashRooms, requests: clashRequests },
    },
    {
      id: "dbms",
      name: "DBMS lab",
      description: "A 60-system DBMS lab request for Thursday afternoon.",
      requests: dbmsRequests,
    },
  ]);
  if (error) throw new Error(`Lab scenarios: ${error.message}`);
}

function holdExpiry(startIso: string, at: Date) {
  const t = at.getTime();
  return new Date(Math.max(t + 10 * 60_000, Math.min(t + 120 * 60_000, Date.parse(startIso) - 30 * 60_000))).toISOString();
}

async function seedRequestScenarios(db: SupabaseClient, anchor: string): Promise<void> {
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

  await Promise.all(
    rows
      .filter((row) => row.room_id)
      .map(async (row) => {
        const { error } = await db.from("requests").delete().eq("room_id", row.room_id).overlaps("during", row.during);
        if (error) throw new Error(`scenarios: clear ${row.room_id}: ${error.message}`);
      }),
  );

  const { error } = await db.from("requests").upsert(rows);
  if (error) throw new Error(`scenarios: ${error.message}`);
}

export async function seedScenarios(db: SupabaseClient, anchor: string): Promise<void> {
  await seedLabScenarios(db, anchor); // clash-8 + dbms (Aaditya · A9)
  await seedRequestScenarios(db, anchor); // disruption + no-show (Aditi · D10)
}
