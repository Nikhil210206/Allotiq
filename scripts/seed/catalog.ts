// Writes the catalog (src/lib/seed/catalog.ts) to Supabase with stable ids, so a reseed keeps user ids
// (sessions) and room qr_secrets (printed QR codes) valid. Owner: Nikhil · N3
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUILDINGS, DEPARTMENTS, JUDGE_JOIN_TOKEN, ROOMS, USERS, emailOf, ids } from "@/lib/seed/catalog";

export * from "@/lib/seed/catalog";

async function check<T>(label: string, p: PromiseLike<{ error: { message: string } | null; data?: T }>) {
  const { error } = await p;
  if (error) throw new Error(`${label}: ${error.message}`);
}

export async function seedCatalog(db: SupabaseClient, anchor?: string): Promise<void> {
  await check(
    "buildings",
    db.from("buildings").upsert(BUILDINGS.map((b) => ({ id: ids.building(b.code), ...b }))),
  );
  await check(
    "departments",
    db.from("departments").upsert(
      DEPARTMENTS.map((d) => ({ id: ids.department(d.code), code: d.code, name: d.name, building_id: ids.building(d.building) })),
    ),
  );

  // Auth users first (profiles.id references auth.users). No passwords: demo login uses magic links.
  for (const u of USERS) {
    const id = ids.user(u.key);
    const attrs = { email: emailOf(u.key), email_confirm: true, user_metadata: { full_name: u.fullName } };
    const existing = await db.auth.admin.getUserById(id);
    const { error } = existing.data.user
      ? await db.auth.admin.updateUserById(id, attrs)
      : await db.auth.admin.createUser({ id, ...attrs });
    if (error) throw new Error(`auth user ${u.key}: ${error.message}`);
  }
  await check(
    "profiles",
    db.from("profiles").upsert(
      USERS.map((u) => ({
        id: ids.user(u.key),
        full_name: u.fullName,
        role: u.role,
        kind: u.kind,
        department_id: u.dept && ids.department(u.dept),
        org_name: u.orgName,
      })),
    ),
  );

  // qr_secret is left out so existing rooms keep theirs.
  await check(
    "rooms",
    db.from("rooms").upsert(
      ROOMS.map((r) => ({
        id: ids.room(r.code),
        code: r.code,
        name: r.name,
        building_id: ids.building(r.building),
        type: r.type,
        capacity: r.capacity,
        systems_count: r.systems,
        features: r.features,
        department_id: r.dept && ids.department(r.dept),
        access: r.access,
        approver_id: ids.user(r.approver),
        open_time: r.open,
        close_time: r.close,
        open_days: r.days,
        attributes: { floor: r.floor },
        is_active: true,
      })),
    ),
  );

  // Drop catalog rows that aren't in the seed any more (e.g. created through the admin UI).
  const notIn = (xs: string[]) => `(${xs.join(",")})`;
  await check("stale rooms", db.from("rooms").delete().not("id", "in", notIn(ROOMS.map((r) => ids.room(r.code)))));
  
  // D14: Create demo_token for judge
  await check(
    "demo_token judge",
    db.from("demo_tokens").upsert({
      token: JUDGE_JOIN_TOKEN,
      user_id: ids.user("judge"),
      expires_at: anchor ? new Date(Date.parse(anchor) + 86400000).toISOString() : null,
      used_count: 0
    })
  );
  await check(
    "stale departments",
    db.from("departments").delete().not("id", "in", notIn(DEPARTMENTS.map((d) => ids.department(d.code)))),
  );
  await check(
    "stale buildings",
    db.from("buildings").delete().not("id", "in", notIn(BUILDINGS.map((b) => ids.building(b.code)))),
  );
  // The room upserts wrote one audit row each; a reseed shouldn't flood the live ticker.
  await check("room audit rows", db.from("audit_log").delete().eq("entity", "room"));
}
