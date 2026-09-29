"use client";
// Live status of one request. Realtime subscription + 4s polling fallback.
// Owner: Aditi · D7
import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api/client";
import { browserDb } from "@/lib/db/browser";
import type { RequestDetail } from "@/contracts/api";

export function useRequestLive(id: string) {
  const [data, setData] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.requests.get(id);
      setData(res as RequestDetail);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load request");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void refresh();

    const supabase = browserDb();
    const channel = supabase
      .channel(`request-live-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "requests", filter: `id=eq.${id}` },
        () => void refresh(),
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          if (!pollerRef.current) {
            pollerRef.current = setInterval(() => void refresh(), 4000);
          }
        }
      });

    pollerRef.current = setInterval(() => void refresh(), 4000);

    return () => {
      void supabase.removeChannel(channel);
      if (pollerRef.current) clearInterval(pollerRef.current);
    };
  }, [id, refresh]);

  return { data, loading, error, refresh };
}
