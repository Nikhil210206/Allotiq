"use client";
// Magic links (demo role cards, judge QR) land with the session in the URL hash: #access_token=…&refresh_token=….
// The server can't see a hash, so hand it to the Supabase browser client, which stores it as the auth
// cookie that getSessionUser() reads. Then strip the tokens from the URL and re-render with the session.
// Owner: Aditi · D2
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { browserDb } from "@/lib/db/browser";

/** sessionStorage key: the page to open after a role-card sign-in started from /login?next=<page>. */
export const SIGN_IN_NEXT_KEY = "allotiq:sign-in-next";

/** A same-origin path, or null — `next` must never send someone to another site. */
export const safeNextPath = (next: string | null | undefined) =>
  next && next.startsWith("/") && !next.startsWith("//") ? next : null;

// Read and clear separately: Strict Mode runs the effect twice in dev, and both runs must see the value.
function storedNext(): string | null {
  try {
    return sessionStorage.getItem(SIGN_IN_NEXT_KEY);
  } catch {
    return null;
  }
}
function clearStoredNext() {
  try {
    sessionStorage.removeItem(SIGN_IN_NEXT_KEY);
  } catch {
    // nothing stored
  }
}

export function LinkSession() {
  const router = useRouter();

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const linkError = hash.get("error_code");
    if (!accessToken && !linkError) return;

    if (linkError || !refreshToken) {
      router.replace(`/login?error=${encodeURIComponent(linkError ?? "missing_refresh_token")}`);
      return;
    }

    // Finish the trip to the page that needed sign-in. The role cards store it (the person's real
    // destination, e.g. a check-in QR); otherwise use the proxy's ?next=, which for a magic link is just
    // the persona's home page the link was sent to.
    const next = safeNextPath(storedNext()) ?? safeNextPath(new URLSearchParams(window.location.search).get("next"));

    // A full reload (not router.replace): the client router would reuse layouts rendered for the previous
    // user, e.g. the admin nav after switching to a faculty card.
    void browserDb()
      .auth.setSession({ access_token: accessToken!, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          router.replace("/login?error=session");
          return;
        }
        clearStoredNext();
        window.location.replace(next ?? window.location.pathname + window.location.search);
      });
  }, [router]);

  return null;
}
