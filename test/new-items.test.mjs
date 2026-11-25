import { test } from "node:test";
import assert from "node:assert/strict";
import { makeNewItems } from "../content/new-items.mjs";

function setup({ enabled = () => true, jobs } = {}) {
  const timers = new Map();
  const calls = [];
  const errors = [];
  let n = 0;
  const q = makeNewItems({
    delay: 2000,
    enabled,
    jobs: jobs || [async (ids) => { calls.push(["titles", ids]); }, async (ids) => { calls.push(["keys", ids]); }],
    onError: (e) => errors.push(e.message),
    setTimeout: (fn, ms) => { timers.set(++n, { fn, ms }); return n; },
    clearTimeout: (id) => timers.delete(id),
  });
  const fire = async () => {
    const [[id, t]] = timers;
    timers.delete(id);
    await t.fn();
  };
  return { q, timers, calls, errors, fire };
}

test("new items wait for the last add event, then each job gets the batch one time, in order", async () => {
  const s = setup();
  s.q.add([1]);
  s.q.add([2, 1]);
  assert.equal(s.timers.size, 1);
  assert.equal([...s.timers.values()][0].ms, 2000);
  await s.fire();
  assert.deepEqual(s.calls, [["titles", [1, 2]], ["keys", [1, 2]]]);
  s.q.add([3]);
  await s.fire();
  assert.deepEqual(s.calls.slice(2), [["titles", [3]], ["keys", [3]]]);
});

test("the keys wait for the end of the titles, and also come after an error", async () => {
  const order = [];
  const s = setup({ jobs: [
    async () => { await new Promise((r) => setImmediate(r)); order.push("titles"); throw new Error("no"); },
    async () => { order.push("keys"); },
  ] });
  s.q.add([1]);
  await s.fire();
  assert.deepEqual(order, ["titles", "keys"]);
  assert.deepEqual(s.errors, ["no"]);
});

test("no timer when all settings are off", () => {
  const s = setup({ enabled: () => false });
  s.q.add([1]);
  assert.equal(s.timers.size, 0);
});

test("cancel stops the timer, and the jobs that did not start", async () => {
  const s = setup();
  s.q.add([1]);
  s.q.cancel();
  assert.equal(s.timers.size, 0);
  const t = setup({ jobs: [async () => t.q.cancel(), async () => t.calls.push("keys")] });
  t.q.add([1]);
  await t.fire();
  assert.deepEqual(t.calls, []);
});
