// Who the AppShell shows. Real session first (Aditi · D2); until auth lands, the demo persona picked
// on /login (a cookie), else the section's default persona. Owner: Nikhil
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { UserRole } from "@/contracts/domain";
import { getSessionUser } from "@/lib/auth/session";
import { PERSONA_COOKIE, ROLE_OF_PERSONA, deptShort, personaProfile, type Persona } from "@/lib/mock/catalog";
import type { ShellUser } from "./app-shell";
import { ROLE_HOME, ROLE_LABEL } from "./nav";

const DEFAULT_PERSONA: Record<UserRole, Persona> = { requester: "faculty", approver: "approver", admin: "admin" };

function captionFor(persona: Persona) {
  const p = personaProfile(persona);
  if (p.kind === "faculty") return `Faculty · ${deptShort(p.departmentId) ?? ""}`;
  if (persona === "approver") return "Approves Tech Park labs";
  if (p.kind === "student") return `Student · ${deptShort(p.departmentId) ?? ""}`;
  return p.orgName ?? ROLE_LABEL[p.role];
}

/**
 * getShellUser for a section only some roles may use: anyone else is sent to their own home instead of
 * a page whose every panel would answer 403 (the APIs enforce roles; this keeps the UI from looking broken).
 */
export async function getShellUserFor(sectionRole: UserRole, allowed: UserRole[]): Promise<ShellUser> {
  const user = await getShellUser(sectionRole);
  if (!allowed.includes(user.role)) redirect(ROLE_HOME[user.role]);
  return user;
}

export async function getShellUser(sectionRole: UserRole): Promise<ShellUser> {
  try {
    const user = await getSessionUser();
    if (user) return { name: user.fullName, role: user.role, caption: user.orgName ?? ROLE_LABEL[user.role] };
  } catch (e) {
    // Only the "not built yet" stub is expected here; real auth errors must surface.
    if (!(e instanceof Error && e.message.startsWith("Not implemented"))) throw e;
  }
  const picked = (await cookies()).get(PERSONA_COOKIE)?.value as Persona | undefined;
  const persona = picked && picked in ROLE_OF_PERSONA ? picked : DEFAULT_PERSONA[sectionRole];
  const p = personaProfile(persona);
  return { name: p.fullName, role: ROLE_OF_PERSONA[persona], caption: captionFor(persona) };
}
