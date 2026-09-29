"use client";
// Live status of one request. Polls every 4s and re-fetches on any Realtime change to that row.
// Owner: Nikhil (UI) · Aditi (Realtime)
import { useEffect } from "react";
import { api } from "@/lib/api/client";
import { browserDb } from "@/lib/db/browser";
import { useApi } from "./use-api";

export function useRequestLive(id: string) {
  const result = useApi(`request:${id}`, () => api.requests.get(id), { refreshMs: 4000 });
  const { reload } = result;

  useEffect(() => {
    // No Supabase env (e.g. UI-only local dev): skip Realtime, the poll above still keeps it fresh.
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
    const supabase = browserDb();
    const channel = supabase
      .channel(`request-live-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "requests", filter: `id=eq.${id}` },
        () => void reload(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, reload]);

  return result;
}
