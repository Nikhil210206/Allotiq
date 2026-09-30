// Buildings, departments, 36 rooms, 15 users (DRAFT SRM KTR names — team to verify in Phase 5). Owner: Nikhil · N3
// Plain constants with stable ids, shared by the DB seed (scripts/seed) and the mock backend (src/lib/mock).
import type { AccessRule, Feature, RequesterKind, RoomType, UserRole } from "@/contracts/domain";
import { stableId } from "./random";

export const EMAIL_DOMAIN = "allotiq.test"; // reserved TLD — never a real mailbox

export interface SeedBuilding {
  code: string;
  name: string;
  lat: number;
  lng: number;
}
export interface SeedDepartment {
  code: string;
  name: string;
  building: string;
}
export interface SeedUser {
  key: string;
  fullName: string;
  role: UserRole;
  kind: RequesterKind | null;
  dept: string | null;
  orgName: string | null;
}
export interface SeedRoom {
  code: string;
  name: string;
  building: string;
  type: RoomType;
  capacity: number;
  systems: number;
  features: Feature[];
  dept: string | null;
  access: AccessRule;
  approver: string; // SeedUser.key
  open: string;
  close: string;
  days: number[];
  floor: number;
  /** Seed-only: how popular the room is in the generated history (drives "underused" insights). */
  popularity: number;
}

// Approximate coordinates on the KTR campus — only used for the proximity score.
export const BUILDINGS: SeedBuilding[] = [
  { code: "TP", name: "Tech Park", lat: 12.8249, lng: 80.0453 },
  { code: "UB", name: "University Building", lat: 12.823, lng: 80.0425 },
  { code: "HT", name: "Hi-Tech Block", lat: 12.8209, lng: 80.0389 },
  { code: "BEL", name: "Basic Engineering Lab", lat: 12.8219, lng: 80.0404 },
  { code: "BT", name: "Biotech Block", lat: 12.8196, lng: 80.0445 },
  { code: "TPGA", name: "Dr. T.P. Ganesan Auditorium", lat: 12.824, lng: 80.0435 },
];

export const DEPARTMENTS: SeedDepartment[] = [
  { code: "CTECH", name: "Computing Technologies", building: "TP" },
  { code: "NWC", name: "Networking and Communications", building: "TP" },
  { code: "DSBS", name: "Data Science and Business Systems", building: "TP" },
  { code: "CINTEL", name: "Computational Intelligence", building: "TP" },
  { code: "ECE", name: "Electronics and Communication Engineering", building: "HT" },
  { code: "EEE", name: "Electrical and Electronics Engineering", building: "HT" },
  { code: "MECH", name: "Mechanical Engineering", building: "BEL" },
  { code: "BIOTECH", name: "Biotechnology", building: "BT" },
];

export const USERS: SeedUser[] = [
  { key: "facilities", fullName: "Facilities Office", role: "admin", kind: null, dept: null, orgName: "Facilities" },
  // The judge's phone joins as this user (QR join). Approves every Tech Park lab, so scene 1 routes to them.
  { key: "judge", fullName: "Judge (demo approver)", role: "approver", kind: null, dept: null, orgName: null },
  { key: "lakshmi", fullName: "Dr. R. Lakshmi", role: "approver", kind: "faculty", dept: "CTECH", orgName: null },
  { key: "estate", fullName: "K. Suresh (Estate Office)", role: "approver", kind: null, dept: null, orgName: "Estate Office" },
  { key: "priya", fullName: "Dr. Priya Raman", role: "requester", kind: "faculty", dept: "CTECH", orgName: null },
  { key: "arun", fullName: "Dr. Arun Kumar", role: "requester", kind: "faculty", dept: "DSBS", orgName: null },
  { key: "meena", fullName: "Dr. Meena Sundaram", role: "requester", kind: "faculty", dept: "ECE", orgName: null },
  { key: "karthik", fullName: "Dr. Karthik Venkat", role: "requester", kind: "faculty", dept: "MECH", orgName: null },
  { key: "divya", fullName: "Dr. Divya Nair", role: "requester", kind: "faculty", dept: "BIOTECH", orgName: null },
  { key: "coding-club", fullName: "Coding Club", role: "requester", kind: "club", dept: null, orgName: "Coding Club" },
  { key: "ai-club", fullName: "AI Club", role: "requester", kind: "club", dept: null, orgName: "AI Club" },
  { key: "robotics-club", fullName: "Robotics Club", role: "requester", kind: "club", dept: "MECH", orgName: "Robotics Club" },
  { key: "workshop-cell", fullName: "Workshop Cell", role: "requester", kind: "club", dept: null, orgName: "Workshop Cell" },
  { key: "ctech-office", fullName: "C.Tech Department Office", role: "requester", kind: "department", dept: "CTECH", orgName: "C.Tech Department" },
  { key: "rahul", fullName: "Rahul S", role: "requester", kind: "student", dept: "CINTEL", orgName: null },
];

/** Who each /login demo role card signs in as (persona → user key). */
export const PERSONAS = {
  faculty: "priya",
  club: "ai-club",
  approver: "judge",
  admin: "facilities",
  student: "rahul",
} as const;

export const emailOf = (key: string) => `${key}@${EMAIL_DOMAIN}`;

/** The judges' QR token: /join?t=<this> signs in as the demo approver. Seeded into demo_tokens. */
export const JUDGE_JOIN_TOKEN = "jk83-9m2p-105x";

const LAB: Feature[] = ["computers", "projector", "ac", "whiteboard"];
const CLASS: Feature[] = ["projector", "whiteboard"];
const HALL: Feature[] = ["projector", "mic", "ac", "stage"];
const WEEK = [1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];

function room(
  code: string,
  name: string,
  type: RoomType,
  capacity: number,
  opts: Partial<Omit<SeedRoom, "code" | "name" | "type" | "capacity">> = {},
): SeedRoom {
  const building = code.split("-")[0];
  const floor = Number(code.match(/-(\d)/)?.[1] ?? 0);
  return {
    code,
    name,
    building,
    type,
    capacity,
    systems: 0,
    features: CLASS,
    dept: null,
    access: "open",
    approver: type === "lab" || type === "classroom" ? (building === "TP" && type === "lab" ? "judge" : "lakshmi") : "estate",
    open: "08:00",
    close: "20:00",
    days: WEEK,
    floor,
    popularity: 1,
    ...opts,
  };
}

export const ROOMS: SeedRoom[] = [
  // 12 labs
  room("TP-401", "TP 401 Lab", "lab", 66, { systems: 64, features: LAB, dept: "CTECH", popularity: 1.3 }),
  room("TP-402", "TP 402 Lab", "lab", 42, { systems: 40, features: LAB, dept: "CTECH", popularity: 1.1 }),
  room("TP-501", "TP 501 Lab", "lab", 74, { systems: 72, features: LAB, dept: "DSBS" }),
  room("TP-502", "TP 502 Networks Lab", "lab", 32, { systems: 30, features: LAB, dept: "NWC", popularity: 0.8 }),
  room("TP-601", "TP 601 AI Lab", "lab", 50, { systems: 48, features: [...LAB, "smart_board"], dept: "CINTEL", popularity: 1.2 }),
  room("UB-210", "UB 210 Lab", "lab", 68, { systems: 66, features: LAB, popularity: 0.7 }),
  room("UB-211", "UB 211 Lab", "lab", 40, { systems: 36, features: LAB, popularity: 0.5 }),
  room("HT-301", "HT 301 Lab", "lab", 72, { systems: 70, features: LAB, dept: "ECE", popularity: 0.9 }),
  room("HT-302", "HT 302 Power Systems Lab", "lab", 36, { systems: 30, features: LAB, dept: "EEE", popularity: 0.6 }),
  room("BEL-104", "BEL 104 CAD Lab", "lab", 62, { systems: 60, features: LAB, dept: "MECH", popularity: 0.8 }),
  room("BEL-105", "BEL 105 Electronics Lab", "lab", 40, { systems: 24, features: ["computers", "whiteboard"], dept: "ECE", popularity: 0.3 }),
  room("BT-201", "BT 201 Bioinformatics Lab", "lab", 34, { systems: 32, features: LAB, dept: "BIOTECH", access: "dept_only", popularity: 0.6 }),
  // 14 classrooms
  room("TP-101", "TP 101", "classroom", 60, { features: [...CLASS, "ac"], popularity: 1.2 }),
  room("TP-102", "TP 102", "classroom", 60, { features: [...CLASS, "ac"], popularity: 1.2 }),
  room("TP-103", "TP 103", "classroom", 72, { features: [...CLASS, "ac"] }),
  room("TP-104", "TP 104", "classroom", 90, { features: [...CLASS, "ac", "smart_board"], popularity: 1.1 }),
  room("UB-101", "UB 101", "classroom", 60),
  room("UB-102", "UB 102", "classroom", 70),
  room("UB-201", "UB 201 Lecture Hall", "classroom", 120, { features: [...CLASS, "mic", "ac"], popularity: 0.9 }),
  room("UB-202", "UB 202", "classroom", 60, { popularity: 0.8 }),
  room("UB-301", "UB 301", "classroom", 90, { features: [...CLASS, "smart_board"], popularity: 0.7 }),
  room("HT-101", "HT 101", "classroom", 60),
  room("HT-102", "HT 102", "classroom", 60, { popularity: 0.8 }),
  room("BEL-201", "BEL 201", "classroom", 60, { popularity: 0.8 }),
  room("BEL-202", "BEL 202", "classroom", 72, { popularity: 0.5 }),
  room("BT-101", "BT 101", "classroom", 60, { popularity: 0.6 }),
  // 5 seminar halls
  room("UB-SEM", "UB Seminar Hall", "seminar_hall", 150, { features: [...HALL, "recording"], popularity: 1.2 }),
  room("TP-SEM", "TP Mini Hall", "seminar_hall", 180, { features: [...HALL, "video_conf", "recording"], popularity: 1.1 }),
  room("HT-SEM", "HT Seminar Hall", "seminar_hall", 100, { features: HALL }),
  room("BEL-SEM", "BEL Seminar Hall", "seminar_hall", 80, { features: ["projector", "mic", "ac"], popularity: 0.6 }),
  room("BT-SEM", "BT Seminar Hall", "seminar_hall", 120, { features: HALL, popularity: 0.7 }),
  // 4 meeting rooms (office hours only)
  ...(
    [
      ["TP-MR1", "TP Meeting Room", 12, ["video_conf", "smart_board", "ac", "whiteboard"]],
      ["UB-BR", "UB Board Room", 20, ["video_conf", "projector", "ac"]],
      ["HT-MR", "HT Meeting Room", 10, ["whiteboard", "ac"]],
      ["BT-MR", "BT Meeting Room", 12, ["video_conf", "ac"]],
    ] as const
  ).map(([code, name, cap, features]) =>
    room(code, name, "meeting_room", cap, { features: [...features], open: "09:00", close: "18:00", days: WEEKDAYS }),
  ),
  // 1 auditorium
  room("TPGA-MAIN", "Dr. T.P. Ganesan Auditorium", "auditorium", 1200, {
    features: [...HALL, "recording", "video_conf"],
    popularity: 0.5,
  }),
];

export const ids = {
  building: (code: string) => stableId("building", code),
  department: (code: string) => stableId("department", code),
  user: (key: string) => stableId("user", key),
  room: (code: string) => stableId("room", code),
};

export const deptBuilding = (dept: string | null) => DEPARTMENTS.find((d) => d.code === dept)?.building ?? null;
