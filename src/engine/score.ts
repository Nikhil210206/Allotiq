// Soft score: capacity fit, features, proximity, scarcity, preference, energy. Owner: Aaditya · A2
//
// Contract sources for each component:
//   capacityFit  — EngineRoom.capacity vs EngineRequest.headcount
//   featureMatch — EngineRequest.niceToHave (scored, not required per engine.ts L38)
//   proximity    — EngineContext.buildings (lat/lng), EngineContext.deptBuilding,
//                  EngineRequest.preferredBuildingId. Seed catalog L46: "only used for the proximity score"
//   scarcity     — EngineRoom.booked (how busy the room is in the slot). UI hint: "Leaves rare rooms
//                  free for bigger needs" → prefer rooms with fewer overlapping bookings.
//   preference   — EngineRequest.history (roomId → past completed bookings)
//   energy       — UI hint (components/kit/score.ts L10): "Building already in use — fewer buildings lit"
//                  → prefer rooms in buildings that already have active bookings during this slot.
//
// Where the contracts do NOT specify an exact formula, the implementation uses a simple, deterministic
// function documented inline. Each component is clamped to [0, 1].

import { ACTIVE_STATUSES } from "@/contracts/domain";
import type { EngineContext, EngineRequest, EngineRoom, ScoreBreakdown, Weights } from "@/contracts/engine";
import { overlaps } from "./time";

// ── Component helpers (each returns a value in [0, 1]) ───────────

/**
 * Capacity fit: penalises both too-large and too-small rooms.
 * Perfect when room.capacity === headcount → 1.0.
 * Score = headcount / capacity (ratio of utilised seats).
 *
 * Source: EngineRoom.capacity, EngineRequest.headcount.
 * No formula is specified in the contracts; this ratio is the simplest deterministic measure.
 */
function capacityFitScore(room: EngineRoom, req: EngineRequest): { score: number; wasted: number } {
  if (room.capacity < req.headcount) return { score: 0, wasted: 0 };
  const wasted = room.capacity - req.headcount;
  const score = req.headcount / room.capacity;
  return { score: clamp(score), wasted };
}

/**
 * Feature match: fraction of *nice-to-have* features that the room has.
 *
 * Source: EngineRequest.niceToHave (engine.ts L38: "Features that are nice to have (scored, not required)").
 * Required features are enforced as hard constraints in feasibility.ts (FEATURE violation) —
 * they do NOT appear here to avoid double-counting.
 *
 * If the request has no nice-to-have features, the score is 1 (no penalty).
 */
function featureMatchScore(room: EngineRoom, req: EngineRequest): number {
  const desired = req.niceToHave ?? [];
  if (desired.length === 0) return 1;
  const matched = desired.filter((f) => room.features.includes(f)).length;
  return matched / desired.length;
}

/**
 * Proximity: how close the room's building is to the requester's relevant building.
 *
 * Source: EngineContext.buildings (lat/lng, per seed catalog L46: "only used for the proximity score"),
 *         EngineContext.deptBuilding (engine.ts L72: "departmentId → buildingId, for the proximity score"),
 *         EngineRequest.preferredBuildingId.
 *
 * Algorithm:
 *   1. Determine the requester's "home" building: preferredBuildingId ?? deptBuilding[deptId].
 *   2. If the room is in that building → 1.0.
 *   3. If both buildings have lat/lng, use 1 - min(distanceMeters, 1500) / 1500.
 *   4. If no home building or no coordinates, return 0.5 (neutral).
 */
function proximityScore(room: EngineRoom, req: EngineRequest, ctx: EngineContext): number {
  const homeBuildingId = req.preferredBuildingId ?? (req.deptId ? ctx.deptBuilding[req.deptId] : undefined);
  if (!homeBuildingId) return 0.5; // no proximity data — neutral

  if (room.buildingId === homeBuildingId) return 1;

  // Try distance-based scoring using building coordinates
  const roomBuilding = ctx.buildings.find((b) => b.id === room.buildingId);
  const homeBuilding = ctx.buildings.find((b) => b.id === homeBuildingId);

  if (roomBuilding?.lat != null && roomBuilding?.lng != null &&
      homeBuilding?.lat != null && homeBuilding?.lng != null) {
    const distMeters = haversineKm(
      homeBuilding.lat, homeBuilding.lng,
      roomBuilding.lat, roomBuilding.lng,
    ) * 1000;
    return clamp(1 - Math.min(distMeters, 1500) / 1500);
  }

  // Different building, no coordinates available → lower than same-building
  return 0.5;
}

/**
 * Scarcity preserves rare large rooms for requests that need their capacity.
 * rarity = 1 / number of rooms with capacity >= this room's capacity.
 * oversize = wasted capacity / room capacity; scarcity = clamp(1 - rarity * oversize).
 */
function scarcityScore(room: EngineRoom, req: EngineRequest, ctx: EngineContext): number {
  const roomCount = ctx.rooms.filter((candidate) => candidate.capacity >= room.capacity).length;
  const rarity = 1 / Math.max(1, roomCount);
  const oversize = (room.capacity - req.headcount) / room.capacity;
  return clamp(1 - rarity * oversize);
}

/**
 * Preference (history): has the requester used this room before?
 *
 * Source: EngineRequest.history (engine.ts L46: "roomId → number of past completed bookings by this requester").
 *
 * Formula: this room's completed booking count divided by the maximum count in history.
 * Empty history scores 0; the most-used room scores 1.
 */
function preferenceScore(room: EngineRoom, req: EngineRequest): number {
  const maxHistory = Math.max(0, ...Object.values(req.history));
  if (maxHistory === 0) return 0;
  return (req.history[room.id] ?? 0) / maxHistory;
}

/**
 * Energy: prefer rooms in buildings that are already in use during this time slot,
 * to consolidate activity and keep fewer buildings "lit".
 *
 * Source: EngineContext.rooms (all rooms and their bookings), components/kit/score.ts L10:
 *         "Building already in use — fewer buildings lit".
 *
 * Algorithm:
 *   1. Count how many OTHER rooms in the same building have overlapping active bookings.
 *   2. If the building already has activity → 1.0 (consolidation — good).
 *   3. If no other room in the building is booked → 0.0 (would light up a new building).
 *
 * NOTE: The contracts do not specify an exact formula. This uses:
 *   score = activeSiblings > 0 ? 1 : 0
 * which is the simplest deterministic representation of the concept.
 */
function energyScore(room: EngineRoom, req: EngineRequest, ctx: EngineContext): number {
  const activeSet = new Set<string>(ACTIVE_STATUSES);
  const siblings = ctx.rooms.filter((r) => r.id !== room.id && r.buildingId === room.buildingId);
  const hasActivity = siblings.some((r) =>
    r.booked.some((bk) => activeSet.has(bk.status) && overlaps(req.interval, bk.interval)),
  );
  return hasActivity ? 1 : 0;
}

// ── Utilities ────────────────────────────────────────────────────

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Haversine distance in km between two lat/lng points. */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth radius km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Main scorer ──────────────────────────────────────────────────

export function scoreRoom(room: EngineRoom, req: EngineRequest, ctx: EngineContext): ScoreBreakdown {
  const w: Weights = ctx.weights;

  const cf = capacityFitScore(room, req);
  const fm = featureMatchScore(room, req);
  const px = proximityScore(room, req, ctx);
  const sc = scarcityScore(room, req, ctx);
  const pf = preferenceScore(room, req);
  const en = energyScore(room, req, ctx);

  const components = {
    capacityFit: cf.score,
    featureMatch: fm,
    proximity: px,
    scarcity: sc,
    preference: pf,
    energy: en,
  };

  const total =
    100 *
    (w.capacityFit * components.capacityFit +
      w.featureMatch * components.featureMatch +
      w.proximity * components.proximity +
      w.scarcity * components.scarcity +
      w.preference * components.preference +
      w.energy * components.energy);

  // ── Human-readable notes (best aspects first) ──
  const notes: string[] = [];

  if (cf.wasted === 0 && room.capacity >= req.headcount) {
    notes.push(`Exact capacity fit (${room.capacity} seats)`);
  } else if (cf.wasted <= 10 && room.capacity >= req.headcount) {
    notes.push(`Tight fit: ${room.capacity} seats, only ${cf.wasted} wasted`);
  } else if (room.capacity >= req.headcount) {
    notes.push(`${cf.wasted} seats wasted (${room.capacity} capacity for ${req.headcount})`);
  }

  const homeBuildingId = req.preferredBuildingId ?? (req.deptId ? ctx.deptBuilding[req.deptId] : undefined);
  if (homeBuildingId && room.buildingId === homeBuildingId) {
    notes.push(req.deptId ? "Same building as your department" : "In preferred building");
  }

  const niceToHave = req.niceToHave ?? [];
  const matched = niceToHave.filter((f) => room.features.includes(f));
  if (matched.length > 0) {
    notes.push(`Has ${matched.join(", ")}`);
  }

  if (room.systems > 0 && req.minSystems > 0) {
    notes.push(`${room.systems} systems ≥ ${req.minSystems}`);
  }

  const pastBookings = req.history[room.id] ?? 0;
  if (pastBookings > 0) {
    notes.push(`${pastBookings} past booking${pastBookings > 1 ? "s" : ""} here`);
  }

  if (en === 1) {
    notes.push("Building already in use");
  }

  return {
    ...components,
    weights: w,
    total: Math.round(total * 100) / 100, // two decimal places
    wastedSeats: cf.wasted,
    notes,
  };
}
