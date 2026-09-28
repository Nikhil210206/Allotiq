// Never a bare "rejected": same room other slot + similar room same slot. Owner: Aaditya · A5
import type { Alternatives, EngineContext, EngineRequest } from "@/contracts/engine";

export function alternatives(_req: EngineRequest, _ctx: EngineContext, _preferredRoomId?: string): Alternatives {
  throw new Error("Not implemented yet (A5)");
}
