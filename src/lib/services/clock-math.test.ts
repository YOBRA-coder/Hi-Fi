import test from "node:test";
import assert from "node:assert/strict";
import { computeClockStep } from "./clock-math.ts";

test("normal passage of time is not a step", () => {
  assert.equal(computeClockStep({ wallMs: 1000, steadyMs: 500 }, { wallMs: 61_000, steadyMs: 60_500 }), 0);
});
test("clock corrected forward by 70 minutes", () => {
  assert.equal(computeClockStep({ wallMs: 1_000, steadyMs: 0 }, { wallMs: 4_261_000, steadyMs: 60_000 }), 4_200_000);
});
test("clock corrected backward", () => {
  assert.equal(computeClockStep({ wallMs: 10_000_000, steadyMs: 0 }, { wallMs: 9_460_000, steadyMs: 60_000 }), -600_000);
});
