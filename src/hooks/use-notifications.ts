"use client";
// Live notifications. Polls every 5s and re-fetches on any Realtime insert (RLS limits it to the user's own rows).
// Owner: Nikhil (UI) · Aditi (Realtime)
import { useEffect } from "react";
import type { AppNotification } from "@/contracts/domain";
import { api } from "@/lib/api/client";
import { browserDb } from "@/lib/db/browser";
import { useApi } from "./use-api";

export function useNotifications(): { items: AppNotification[]; unread: number; markRead: (ids: string[]) => Promise<void> } {
  const { data, reload } = useApi("notifications", api.notifications.list, { refreshMs: 5000 });

  useEffect(() => {
    // No Supabase env (e.g. UI-only local dev): skip Realtime, the poll above still keeps it fresh.
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
    const supabase = browserDb();
    const channel = supabase
      .channel("notifications-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => void reload())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [reload]);

  return {
    items: data?.items ?? [],
    unread: data?.unread ?? 0,
    markRead: async (ids) => {
      if (ids.length) await api.notifications.read(ids);
    },
  };
}
