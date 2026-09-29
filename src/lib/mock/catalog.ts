// The seeded catalog in contract shape (same stable ids as the real DB). Owner: Nikhil
import type { Building, Department, Profile, Room, UserRole } from "@/contracts/domain";
import { BUILDINGS, DEPARTMENTS, PERSONAS, ROOMS, USERS, ids } from "@/lib/seed/catalog";
import { stableId } from "@/lib/seed/random";

export const BUILDING_LIST: Building[] = BUILDINGS.map((b) => ({
  id: ids.building(b.code),
  code: b.code,
  name: b.name,
  lat: b.lat,
  lng: b.lng,
}));

export const DEPARTMENT_LIST: Department[] = DEPARTMENTS.map((d) => ({
  id: ids.department(d.code),
  code: d.code,
  name: d.name,
  buildingId: ids.building(d.building),
}));

export const PROFILES: Profile[] = USERS.map((u) => ({
  id: ids.user(u.key),
  fullName: u.fullName,
  role: u.role,
  kind: u.kind,
  departmentId: u.dept && ids.department(u.dept),
  orgName: u.orgName,
}));

export function seedRooms(): Room[] {
  return ROOMS.map((r) => ({
    id: ids.room(r.code),
    code: r.code,
    name: r.name,
    buildingId: ids.building(r.building),
    type: r.type,
    capacity: r.capacity,
    systemsCount: r.systems,
    features: [...r.features],
    departmentId: r.dept && ids.department(r.dept),
    access: r.access,
    approverId: ids.user(r.approver),
    openTime: r.open,
    closeTime: r.close,
    openDays: [...r.days],
    attributes: { floor: r.floor },
    isActive: true,
  }));
}

/** QR secret printed on each room's check-in code (mock: derived from the id). */
export const qrSecretOf = (roomId: string) => stableId("qr", roomId).replace(/-/g, "").slice(0, 16);

export const userId = (key: string) => ids.user(key);
export const roomId = (code: string) => ids.room(code);
export const profileById = (id: string) => PROFILES.find((p) => p.id === id);
export const buildingById = (id: string) => BUILDING_LIST.find((b) => b.id === id);
export const departmentById = (id: string | null) => DEPARTMENT_LIST.find((d) => d.id === id);

export type Persona = keyof typeof PERSONAS;
export const PERSONA_COOKIE = "allotiq_persona";
export const personaProfile = (persona: Persona) => profileById(ids.user(PERSONAS[persona]))!;

/** Short department names for reasons ("Same building as C.Tech"). */
const SHORT: Record<string, string> = {
  CTECH: "C.Tech",
  NWC: "NWC",
  DSBS: "DSBS",
  CINTEL: "CINTEL",
  ECE: "ECE",
  EEE: "EEE",
  MECH: "Mech",
  BIOTECH: "Biotech",
};
export const deptShort = (id: string | null) => {
  const d = departmentById(id);
  return d ? (SHORT[d.code] ?? d.code) : null;
};

export const ROLE_OF_PERSONA: Record<Persona, UserRole> = {
  faculty: "requester",
  club: "requester",
  student: "requester",
  approver: "approver",
  admin: "admin",
};
