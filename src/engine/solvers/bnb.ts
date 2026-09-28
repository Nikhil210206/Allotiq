// Branch & bound (engine default): lexicographic priority-weighted objective, timeout → greedy incumbent. Owner: Aaditya · A3
import type { Solver } from "@/contracts/engine";

export const bnbSolver: Solver = {
  name: "bnb",
  solve() {
    throw new Error("Not implemented yet (A3)");
  },
};
