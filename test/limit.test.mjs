import { test } from "node:test";
import assert from "node:assert/strict";
import { makeLimit } from "../content/lib/limit.mjs";

const tick = () => new Promise((r) => setTimeout(r, 1));

test("no more than max tasks run at the same time, and all of them run", async () => {
  const limit = makeLimit(3);
  let active = 0;
  let peak = 0;
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => limit(async () => {
    active++;
    peak = Math.max(peak, active);
    await tick();
    active--;
    return i;
  })));
  assert.equal(peak, 3);
  assert.deepEqual(results, Array.from({ length: 20 }, (_, i) => i));
});

test("an error goes to its caller and frees the place", async () => {
  const limit = makeLimit(1);
  await assert.rejects(limit(async () => { throw new Error("x"); }), /x/);
  // A function that throws at once gives a rejected promise, not an error from limit().
  await assert.rejects(limit(() => { throw new Error("sync"); }), /sync/);
  assert.equal(await limit(() => 7), 7);
});

test("max must be a positive integer", () => {
  for (const bad of [0, -1, 1.5, NaN, "4"]) assert.throws(() => makeLimit(bad));
});
