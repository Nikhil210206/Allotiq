import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ role: vi.fn(), from: vi.fn(), single: vi.fn(), run: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireRole: m.role }));
vi.mock("@/lib/db/server", () => ({ db: () => ({ from: m.from }) }));
vi.mock("@/engine/lab", () => ({ runLabScenario: m.run }));
import { POST } from "./route";

const context = { rooms: [], buildings: [], deptBuilding: {}, weights: { capacityFit: .3, featureMatch: .1, proximity: .2, scarcity: .2, preference: .1, energy: .1 }, now: "2026-09-29T10:00:00+05:30", tz: "Asia/Kolkata" };
const requestInput = { id: "11111111-1111-4111-8111-111111111111", requesterId: "22222222-2222-4222-8222-222222222222", deptId: null, headcount: 10, minSystems: 0, features: [], interval: { start: "2026-10-01T14:00:00+05:30", end: "2026-10-01T15:00:00+05:30" }, priority: 20, createdAt: "2026-09-29T10:00:00+05:30", history: {} };
const assignments = [{ requestId: requestInput.id, roomId: null }];
const result = { solver: "fcfs", assignments, metrics: { placed: 0, total: 1, priorityPlaced: 0, priorityTotal: 1, seatsWasted: 0, buildingsActive: 0, objective: 0, ms: 1, nodes: 1 }, timedOut: false, trace: [] };
const req = (body: unknown) => new Request("http://localhost/api/lab/replay", { method: "POST", body: JSON.stringify(body) });
describe("POST /api/lab/replay", () => {
 beforeEach(() => {
  vi.clearAllMocks(); m.role.mockResolvedValue({ role: "admin" });
  m.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: m.single }) }) });
  m.single.mockResolvedValue({ data: { id: "33333333-3333-4333-8333-333333333333", kind: "lab", input: { scenarioId: "s", solvers: ["fcfs"], requests: [requestInput], requestStates: [], context }, output: { results: [result] } }, error: null });
  m.run.mockReturnValue({ results: [result], explanation: "replayed" });
 });
 it("replays stored snapshot deterministically without writes", async () => {
  const body = { runId: "33333333-3333-4333-8333-333333333333", solvers: ["fcfs"] };
  const first = await POST(req(body)); const second = await POST(req(body));
  expect(await first.json()).toEqual(await second.json()); expect(first.status).toBe(200);
  expect(m.from).toHaveBeenCalledWith("engine_runs"); expect(m.run).toHaveBeenCalledTimes(2);
  expect(m.run).toHaveBeenCalledWith([requestInput], context, ["fcfs"]);
 });
 it("compares a changed solver against the recorded baseline and preserves timeout", async () => {
  const timed = { ...result, timedOut: true };
  const room1 = "55555555-5555-4555-8555-555555555555"; const room2 = "66666666-6666-4666-8666-666666666666";
  const room = (id: string, code: string) => ({ id, code, buildingId: room1, type: "classroom", capacity: 20, systems: 0, features: [], deptId: null, access: "open", hours: { open: "08:00", close: "20:00", days: [1,2,3,4,5,6,7] }, blackouts: [], booked: [] });
  const ctx = { ...context, rooms: [room(room1, "R1"), room(room2, "R2")] };
  m.single.mockResolvedValueOnce({ data: { id: "33333333-3333-4333-8333-333333333333", kind: "lab", input: { scenarioId: "s", solvers: ["fcfs"], requests: [requestInput], requestStates: [], context: ctx }, output: { results: [{ ...result, assignments: [{ requestId: requestInput.id, roomId: room1 }], metrics: { ...result.metrics, placed: 1 } }] } }, error: null });
  m.run.mockReturnValue({ results: [{ ...timed, solver: "greedy", assignments: [{ requestId: requestInput.id, roomId: room2 }] }], explanation: "counterfactual" });
  const response = await POST(req({ runId: "33333333-3333-4333-8333-333333333333", solvers: ["greedy"] }));
  const body = await response.json();
  expect(body.baseline.solver).toBe("fcfs"); expect(body.results[0].timedOut).toBe(true);
  expect(body.changes).toEqual([{ requestId: requestInput.id, beforeRoomId: room1, afterRoomId: room2 }]);
 });
 it("compares the same solver when it is not first in the requested solver list", async () => {
  const room1 = "55555555-5555-4555-8555-555555555555";
  const room = { id: room1, code: "R1", buildingId: room1, type: "classroom", capacity: 20, systems: 0, features: [], deptId: null, access: "open", hours: { open: "08:00", close: "20:00", days: [1,2,3,4,5,6,7] }, blackouts: [], booked: [] };
  m.single.mockResolvedValueOnce({ data: { id: "33333333-3333-4333-8333-333333333333", kind: "lab", input: { scenarioId: "s", solvers: ["fcfs"], requests: [requestInput], requestStates: [], context: { ...context, rooms: [room] } }, output: { results: [{ ...result, assignments: [{ requestId: requestInput.id, roomId: room1 }], metrics: { ...result.metrics, placed: 1 } }] } }, error: null });
  m.run.mockReturnValue({ results: [{ ...result, solver: "greedy", assignments: [{ requestId: requestInput.id, roomId: null }] }, { ...result, solver: "fcfs", assignments: [{ requestId: requestInput.id, roomId: room1 }] }], explanation: "same baseline" });
  const response = await POST(req({ runId: "33333333-3333-4333-8333-333333333333", solvers: ["greedy", "fcfs"] }));
  const body = await response.json();
  expect(body.baseline.solver).toBe("fcfs");
  expect(body.comparison).toEqual({ baselineSolver: "fcfs", replaySolver: "greedy", changes: [{ requestId: requestInput.id, beforeRoomId: room1, afterRoomId: null }] });
 });
 it("requires replay context and authorization", async () => {
  m.single.mockResolvedValueOnce({ data: { id: "33333333-3333-4333-8333-333333333333", kind: "lab", input: { scenarioId: "s", solvers: ["fcfs"], requests: [requestInput], requestStates: [] }, output: {} }, error: null });
  expect((await POST(req({ runId: "33333333-3333-4333-8333-333333333333", solvers: ["fcfs"] }))).status).toBe(409);
  const denied = new Response(null, { status: 403 }); m.role.mockRejectedValueOnce(denied);
  const readsBeforeDenied = m.from.mock.calls.length;
  expect(await POST(req({ runId: "33333333-3333-4333-8333-333333333333", solvers: ["fcfs"] }))).toBe(denied);
  expect(m.from).toHaveBeenCalledTimes(readsBeforeDenied);
  expect(m.run).not.toHaveBeenCalled();
 });
 it("rejects a saved snapshot without a valid baseline before replay", async () => {
  m.single.mockResolvedValueOnce({ data: { id: "33333333-3333-4333-8333-333333333333", kind: "lab", input: { scenarioId: "s", solvers: ["fcfs"], requests: [requestInput], requestStates: [], context }, output: { results: [] } }, error: null });
  const response = await POST(req({ runId: "33333333-3333-4333-8333-333333333333", solvers: ["fcfs"] }));
  expect(response.status).toBe(409); expect(m.run).not.toHaveBeenCalled();
 });
 it("rejects unsupported counterfactual fields before reading the run", async () => {
  const response = await POST(req({ runId: "33333333-3333-4333-8333-333333333333", solvers: ["fcfs"], priority: 100 }));
  expect(response.status).toBe(400); expect(m.from).not.toHaveBeenCalled(); expect(m.run).not.toHaveBeenCalled();
 });
});
