"use client";
// Tiny data hook: load, keep the last good value while reloading (no skeleton flash), refresh when any
// mutation fires the data event, and optionally poll. Owner: Nikhil
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, DATA_EVENT } from "@/lib/api/client";

export function useApi<T>(key: string | null, load: () => Promise<T>, opts: { refreshMs?: number } = {}) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(key !== null);
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });

  const reload = useCallback(async () => {
    if (key === null) return;
    setLoading(true);
    try {
      setData(await loader.current());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, { message: String(e) }));
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    if (key === null) return;
    // Load on mount / key change; refresh on data events and on an interval.
    const id = setTimeout(reload, 0);
    const onData = () => void reload();
    window.addEventListener(DATA_EVENT, onData);
    const poll = opts.refreshMs ? setInterval(reload, opts.refreshMs) : undefined;
    return () => {
      clearTimeout(id);
      window.removeEventListener(DATA_EVENT, onData);
      if (poll) clearInterval(poll);
    };
  }, [key, reload, opts.refreshMs]);

  return { data, error, loading, reload, setData };
}
