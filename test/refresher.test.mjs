import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRefresher } from "../content/lib/refresher.mjs";

const tick = () => new Promise((r) => setTimeout(r, 0));

test("a forced refresh during a scan runs one more scan after it", async () => {
  const starts = [];
  let release;
  const run = async () => {
    starts.push(starts.length);
    if (starts.length === 1) await new Promise((r) => { release = r; });
  };
  const refresh = makeRefresher(run, { minInterval: 30000, now: () => 0 });
  const first = refresh({ force: true });
  await tick();
  const second = refresh({ force: true });
  release();
  await Promise.all([first, second]);
  assert.equal(starts.length, 2);
});

test("an unforced refresh within the interval does nothing; one during a scan shares it", async () => {
  let t = 0;
  let runs = 0;
  const refresh = makeRefresher(async () => { runs += 1; }, { minInterval: 30000, now: () => t });
  await refresh({ force: true });
  t = 1000;
  await refresh();
  assert.equal(runs, 1);
  t = 40000;
  await refresh();
  assert.equal(runs, 2);
});

test("two forced refreshes during one scan add only one more scan", async () => {
  let runs = 0;
  let release;
  const run = async () => {
    runs += 1;
    if (runs === 1) await new Promise((r) => { release = r; });
  };
  const refresh = makeRefresher(run, { minInterval: 0, now: () => 0 });
  const a = refresh({ force: true });
  await tick();
  const b = refresh({ force: true });
  const c = refresh({ force: true });
  release();
  await Promise.all([a, b, c]);
  assert.equal(runs, 2);
});
