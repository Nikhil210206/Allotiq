// POST /api/demo/login — Demo role cards sign in as seeded users via Supabase magic links.
// Owner: Aditi · Task D2
import { db } from "@/lib/db/server";
import { apiError } from "@/lib/http";
import { DemoLoginSchema } from "@/contracts/api";
import { PERSONAS, emailOf } from "@/lib/seed/catalog";

// Where each persona lands after sign-in.
const PERSONA_REDIRECT: Record<string, string> = {
  faculty:  "/r/new",
  club:     "/r/new",
  student:  "/r/new",
  approver: "/approvals",
  admin:    "/admin/dashboard",
};

export async function POST(req: Request) {
  // Anyone who can call this becomes any persona, admin included — so it is off in production unless DEMO_MODE=1.
  if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "1")
    return apiError(403, "DEMO_DISABLED", "Demo sign-in is disabled. Set DEMO_MODE=1 to enable it.");

  const body = await req.json().catch(() => ({}));
  const parsed = DemoLoginSchema.safeParse(body);
  if (!parsed.success)
    return apiError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid body");

  const { persona } = parsed.data;
  // The seeded account for this persona. A magic link for an unknown email would create a new auth user
  // with no profile, so the email must come from the seed catalog.
  const email = emailOf(PERSONAS[persona]);

  const supabase = db();

  // Generate a one-time magic link using the service role (admin API).
  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const redirectTo = `${origin}${PERSONA_REDIRECT[persona] ?? "/"}`;

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });

  if (error || !data?.properties?.action_link) {
    console.error("[demo/login] generateLink error:", error);
    return apiError(
      502,
      "AUTH_ERROR",
      "Could not create sign-in link — make sure the demo DB is seeded and the email exists in Supabase Auth.",
    );
  }

  return Response.json({ redirect: data.properties.action_link });
}
