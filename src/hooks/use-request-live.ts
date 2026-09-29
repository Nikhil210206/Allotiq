"use client";
// Live status of one request (status page, approvals). Polls every 4s today; Aditi can add a Supabase
// Realtime subscription here without touching the screens. Owner: Nikhil (UI) · Aditi (Realtime)
import { api } from "@/lib/api/client";
import { useApi } from "./use-api";

export function useRequestLive(id: string) {
  return useApi(`request:${id}`, () => api.requests.get(id), { refreshMs: 4000 });
}
