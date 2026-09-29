"use client";
// The virtual clock (demo time machine). Fetches the offset, then ticks locally.
// Owner: Nikhil
import { useEffect, useState } from "react";
import { api, DATA_EVENT } from "@/lib/api/client";

let offset: number | null = null;
const listeners = new Set<() => void>();

async function sync() {
  try {
    const c = await api.clock.get();
    offset = Date.parse(c.now) - Date.now();
  } catch {
    offset = 0;
  }
  listeners.forEach((l) => l());
}

/** Virtual "now" (null until the first sync), updated every `everyMs`. */
export function useNow(everyMs = 1000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(offset === null ? null : new Date(Date.now() + offset));
    listeners.add(update);
    if (offset === null) void sync();
    else update();
    const onData = () => void sync();
    window.addEventListener(DATA_EVENT, onData);
    const t = setInterval(update, everyMs);
    return () => {
      listeners.delete(update);
      window.removeEventListener(DATA_EVENT, onData);
      clearInterval(t);
    };
  }, [everyMs]);
  return now;
}
