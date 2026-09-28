"use client";
// Live notifications via Supabase Realtime (fallback: poll every 5s). Owner: Aditi · D7
import type { AppNotification } from "@/contracts/domain";

export function useNotifications(): { items: AppNotification[]; unread: number } {
  return { items: [], unread: 0 }; // TODO(D7)
}
