// Solver registry — swap solvers without touching callers. Owner: Aaditya · A3
import type { Solver, SolverName } from "@/contracts/engine";
import { bnbSolver } from "./bnb";
import { fcfsSolver } from "./fcfs";
import { greedySolver } from "./greedy";
import { ilpSolver } from "./ilp";

const SOLVERS: Record<SolverName, Solver> = {
  fcfs: fcfsSolver,
  greedy: greedySolver,
  bnb: bnbSolver,
  ilp: ilpSolver,
};

export function getSolver(name: SolverName): Solver {
  return SOLVERS[name];
}
