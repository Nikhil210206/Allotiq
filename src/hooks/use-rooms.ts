"use client";
// Rooms (live from /api/rooms) plus lookups screens need everywhere. Owner: Nikhil
import { useMemo } from "react";
import type { Room } from "@/contracts/domain";
import { api } from "@/lib/api/client";
import { BUILDINGS } from "@/lib/campus";
import { useApi } from "./use-api";

export function useRooms() {
  const { data, loading, error, reload } = useApi("rooms", api.rooms.list);
  const byId = useMemo(() => new Map((data ?? []).map((r) => [r.id, r])), [data]);
  return {
    rooms: data ?? [],
    loading,
    error,
    reload,
    room: (id: string | null | undefined): Room | undefined => (id ? byId.get(id) : undefined),
    buildingName: (id: string | null | undefined) => BUILDINGS.find((b) => b.id === id)?.name ?? "",
    buildingCode: (id: string | null | undefined) => BUILDINGS.find((b) => b.id === id)?.code ?? "",
  };
}
