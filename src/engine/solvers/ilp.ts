// ILP via HiGHS wasm (stretch) — same interface, must return the same plan as bnb. Owner: Aaditya · A17
import type { Solver } from "@/contracts/engine";

export const ilpSolver: Solver = {
  name: "ilp",
  solve() {
    throw new Error("Not implemented yet (A17)");
  },
};
