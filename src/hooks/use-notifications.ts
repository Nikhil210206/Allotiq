"use client";
// Live notifications. Polls every 5s today; Aditi can swap the refresh for a Supabase Realtime
// subscription inside this hook without touching any screen. Owner: Nikhil (UI) · Aditi (Realtime)
import type { AppNotification } from "@/contracts/domain";
import { api } from "@/lib/api/client";
import { useApi } from "./use-api";

export function useNotifications(): { items: AppNotification[]; unread: number; markRead: (ids: string[]) => Promise<void> } {
  const { data } = useApi("notifications", api.notifications.list, { refreshMs: 5000 });
  return {
    items: data?.items ?? [],
    unread: data?.unread ?? 0,
    markRead: async (ids) => {
      if (ids.length) await api.notifications.read(ids);
    },
  };
}
