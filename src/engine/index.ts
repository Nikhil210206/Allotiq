// Public surface of the engine. Pure TS: no Next.js, no DB imports anywhere under src/engine.
export * from "./time";
export * from "./feasibility";
export * from "./score";
export * from "./candidates";
export * from "./alternatives";
export * from "./recommend";
export * from "./bump";
export * from "./rehome";
export * from "./waitlist";
export * from "./explain";
export * from "./metrics";
export { getSolver } from "./solvers";
