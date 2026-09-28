"use client";
// Live status of one request via Supabase Realtime (fallback: poll every 5s). Owner: Aditi · D7
import type { BookingRequest } from "@/contracts/domain";

export function useRequestLive(_id: string): BookingRequest | null {
  return null; // TODO(D7)
}
