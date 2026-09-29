// Session helpers for server code. Owner: Aditi · D2
import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/types.gen";
import type { Profile, UserRole } from "@/contracts/domain";
import { apiError } from "@/lib/http";

async function ssrClient() {
  // cookies() is async in Next.js 15+ / 16
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Ignore: called from a Server Component where cookies are read-only.
          }
        },
      },
    },
  );
}

export async function getSessionUser(): Promise<Profile | null> {
  const supabase = await ssrClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role, kind, department_id, org_name")
    .eq("id", user.id)
    .single();
  if (!data) return null;

  return {
    id: data.id,
    fullName: data.full_name,
    role: data.role as UserRole,
    kind: data.kind as Profile["kind"],
    departmentId: data.department_id,
    orgName: data.org_name,
  };
}

/** Throws a 401/403 Response if the user is missing or lacks one of the required roles. */
export async function requireRole(...roles: UserRole[]): Promise<Profile> {
  const user = await getSessionUser();
  if (!user) throw apiError(401, "UNAUTHORIZED", "You must be signed in.");
  if (roles.length > 0 && !roles.includes(user.role))
    throw apiError(403, "FORBIDDEN", `Requires role: ${roles.join(" | ")}`);
  return user;
}
