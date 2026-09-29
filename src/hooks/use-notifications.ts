"use client";
// Live notifications: Supabase Realtime subscription with 5s polling fallback.
// Owner: Aditi · D7
import { useEffect, useRef, useState } from "react";
import type { AppNotification } from "@/contracts/domain";
import { api } from "@/lib/api/client";
import { browserDb } from "@/lib/db/browser";

export function useNotifications(): {
  items: AppNotification[];
  unread: number;
  markRead: (ids: string[]) => Promise<void>;
} {
  const [data, setData] = useState<{ items: AppNotification[]; unread: number }>({
    items: [],
    unread: 0,
  });
  const pollerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refresh() {
    try {
      const res = await api.notifications.list();
      setData(res);
    } catch {
      // swallow — polling will retry
    }
  }

  useEffect(() => {
    void refresh();

    // Realtime subscription on the notifications table
    const supabase = browserDb();
    const channel = supabase
      .channel("notifications-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => {
        void refresh();
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // Realtime unavailable — fall back to polling
          if (!pollerRef.current) {
            pollerRef.current = setInterval(() => void refresh(), 5000);
          }
        }
      });

    // Always maintain a 5s polling fallback in case Realtime is silent
    pollerRef.current = setInterval(() => void refresh(), 5000);

    return () => {
      void supabase.removeChannel(channel);
      if (pollerRef.current) clearInterval(pollerRef.current);
    };
  }, []);

  return {
    items: data.items,
    unread: data.unread,
    markRead: async (ids) => {
      if (!ids.length) return;
      await api.notifications.read(ids);
      setData((prev) => ({
        ...prev,
        items: prev.items.map((n) =>
          ids.includes(n.id) ? { ...n, readAt: new Date().toISOString() } : n,
        ),
        unread: Math.max(0, prev.unread - ids.length),
      }));
    },
  };
}
