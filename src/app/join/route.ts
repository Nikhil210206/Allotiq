// GET /join?t=<token> — Judge QR join: validates demo token, issues a magic-link, redirects to /approvals.
// GOTCHA: Add the prod URL to Supabase Auth → Redirect URLs (Settings → Auth → Redirect URLs).
// Owner: Aditi · Task D14
import { db } from "@/lib/db/server";
import { getNow } from "@/lib/clock";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");
  if (!token) {
    redirect("/login?error=missing_token");
  }

  const supabase = db();
  const now = await getNow();

  // Look up the demo token
  const { data: tokenRow, error } = await supabase
    .from("demo_tokens")
    .select("token, user_id, expires_at, used_count")
    .eq("token", token!)
    .single();

  if (error || !tokenRow) {
    redirect("/login?error=invalid_token");
  }

  const t = tokenRow as Record<string, unknown>;

  // Check expiry
  if (t.expires_at && Date.parse(t.expires_at as string) < Date.parse(now)) {
    redirect("/login?error=token_expired");
  }

  // Look up the user's email
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", t.user_id as string)
    .single();

  if (!profile) redirect("/login?error=user_not_found");

  // Get user email from Auth
  const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById(t.user_id as string);
  if (authErr || !authUser?.user?.email) redirect("/login?error=auth_error");

  const email = authUser.user.email!;
  const origin = req.nextUrl.origin;
  const redirectTo = `${origin}/approvals`;

  // Generate magic link
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });

  if (linkErr || !linkData?.properties?.action_link) {
    redirect("/login?error=link_error");
  }

  // Increment used_count
  await supabase
    .from("demo_tokens")
    .update({ used_count: ((t.used_count as number) ?? 0) + 1 })
    .eq("token", token!);

  // Redirect to the magic link — Supabase handles the session exchange, then bounces to /approvals
  redirect(linkData!.properties!.action_link!);
}
