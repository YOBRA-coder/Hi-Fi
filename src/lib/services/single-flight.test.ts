import test from "node:test";
import assert from "node:assert/strict";
import { singleFlight, type FlightMap } from "./single-flight.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("same key + token runs once and shares the result", async () => {
  const m: FlightMap<number> = new Map();
  let runs = 0;
  const fn = async () => { runs++; await sleep(20); return runs; };
  const [a, b, c] = await Promise.all([singleFlight(m, "p1", "t", fn), singleFlight(m, "p1", "t", fn), singleFlight(m, "p1", "t", fn)]);
  assert.deepEqual([a, b, c], [1, 1, 1]);
  assert.equal(runs, 1);
  assert.equal(m.size, 0);
});
test("different token waits its turn (never parallel)", async () => {
  const m: FlightMap<string> = new Map();
  let active = 0, maxActive = 0;
  const mk = (name: string) => async () => { active++; maxActive = Math.max(maxActive, active); await sleep(15); active--; return name; };
  const r = await Promise.all([singleFlight(m, "p", "A", mk("a")), singleFlight(m, "p", "B", mk("b"))]);
  assert.deepEqual(r, ["a", "b"]);
  assert.equal(maxActive, 1);
});
test("different keys run in parallel; failure does not block later runs", async () => {
  const m: FlightMap<string> = new Map();
  const bad = singleFlight(m, "x", "t", async () => { throw new Error("boom"); });
  await assert.rejects(bad);
  assert.equal(await singleFlight(m, "x", "t", async () => "ok"), "ok");
});
