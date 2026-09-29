"use client";
// Magic links (demo role cards, judge QR) land with the session in the URL hash: #access_token=…&refresh_token=….
// The server can't see a hash, so hand it to the Supabase browser client, which stores it as the auth
// cookie that getSessionUser() reads. Then strip the tokens from the URL and re-render with the session.
// Owner: Aditi · D2
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { browserDb } from "@/lib/db/browser";

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

    // A full reload (not router.replace): the client router would reuse layouts rendered for the previous
    // user, e.g. the admin nav after switching to a faculty card.
    void browserDb()
      .auth.setSession({ access_token: accessToken!, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) router.replace("/login?error=session");
        else window.location.replace(window.location.pathname + window.location.search);
      });
  }, [router]);

  return null;
}
