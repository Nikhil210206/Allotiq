// Next.js 16 "proxy" (formerly middleware): refreshes the Supabase session cookie on each request so
// server code always sees a live session. Owner: Aditi · D2
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next(); // no Supabase configured: the UI runs on its in-browser mock

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() revalidates the token and rotates it when expired; setAll above writes the new cookie.
  const { data: { user } } = await supabase.auth.getUser();

  // Signed-out visitors go to /login?next=<page>. Magic links land here before LinkSession has stored the
  // session (it's in the URL hash, which the browser carries across this redirect), so LinkSession sends
  // them on to `next` once the cookie is set.
  const path = request.nextUrl.pathname;
  const isPublic = path === "/" || ["/api", "/login", "/join"].some((p) => path === p || path.startsWith(`${p}/`));
  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/jobs/tick|api/health|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
