// Demo scenarios: clash-8 + dbms (Aaditya · A9), disruption + no-show (Aditi · D10).
// Runs after the catalog and history; use ids from ./catalog and times relative to `anchor` (Wed 13:50 IST).
import type { SupabaseClient } from "@supabase/supabase-js";
import { PURPOSE_PRIORITY } from "@/contracts/domain";
import type { EngineRequest } from "@/contracts/engine";
import { addDays, istDayOf, istIso, stableId } from "@/lib/seed/random";
import { ids } from "./catalog";

export async function seedScenarios(db: SupabaseClient, anchor: string): Promise<void> {
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

  const clashRequests = [
    makeRequest("clash-8", "coding", { requester: "coding-club", label: "Coding Club", headcount: 50, purpose: "club_event", minute: 600 }),
    makeRequest("clash-8", "workshop", { requester: "workshop-cell", label: "Workshop Cell", headcount: 55, features: ["projector"], purpose: "club_event", minute: 605 }),
    makeRequest("clash-8", "ai", { requester: "ai-club", label: "AI Club", headcount: 100, features: ["projector"], purpose: "club_event", minute: 610 }),
    makeRequest("clash-8", "networking", { requester: "priya", department: "CTECH", label: "Networking lab", headcount: 36, minSystems: 36, features: ["computers"], roomType: "lab", purpose: "academic", minute: 615 }),
    makeRequest("clash-8", "robotics", { requester: "robotics-club", department: "MECH", label: "Robotics build", headcount: 30, minSystems: 30, features: ["computers"], roomType: "lab", purpose: "club_event", minute: 620 }),
    makeRequest("clash-8", "seminar", { requester: "arun", department: "DSBS", label: "Department seminar", headcount: 70, features: ["projector", "mic"], roomType: "seminar_hall", purpose: "department_event", minute: 625 }),
    makeRequest("clash-8", "review", { requester: "meena", department: "ECE", label: "Project review", headcount: 24, features: ["projector"], roomType: "meeting_room", purpose: "meeting", minute: 630 }),
    makeRequest("clash-8", "lecture", { requester: "rahul", department: "CINTEL", label: "Student workshop", headcount: 45, features: ["projector"], purpose: "student_activity", minute: 635 }),
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
      requests: clashRequests,
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
