// Next.js 16 "proxy" (formerly middleware): refreshes the Supabase session cookie and
// redirects signed-out users to /login. Owner: Aditi · D2
import { NextResponse, type NextRequest } from "next/server";

export function proxy(_request: NextRequest) {
  return NextResponse.next(); // TODO(D2): @supabase/ssr session refresh + auth redirect
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/jobs/tick|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
