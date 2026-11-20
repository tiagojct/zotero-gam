import { test } from "node:test";
import assert from "node:assert/strict";
import { planKeys, keyReport, keyChanges, reportLines, AUTO_KEY_MAX } from "../content/lib/keys.mjs";

const json = (lastName, date = "2020") => ({ creators: [{ creatorType: "author", lastName }], date });

test("planKeys gives new keys that do not collide with taken keys or with each other", () => {
  const rows = planKeys([
    { id: 1, title: "A", json: json("Smith"), existingKey: null, skip: null },
    { id: 2, title: "B", json: json("Smith"), existingKey: null, skip: null },
    { id: 3, title: "C", json: json("Lee"), existingKey: "lee2020", skip: null },
    { id: 4, title: "", json: json("Kim"), existingKey: null, skip: "cannot be changed" },
  ], new Set(["smith2020"]));
  assert.deepEqual(rows.map((r) => [r.id, r.status, r.citekey, r.reason]), [
    [1, "assign", "smith2020a", ""],
    [2, "assign", "smith2020b", ""],
    [3, "skip", "lee2020", "already have a citekey"],
    [4, "skip", "", "cannot be changed"],
  ]);
  assert.equal(rows[3].title, "(no title)");
});

test("planKeys does not change the taken set", () => {
  const taken = new Set(["a2020"]);
  planKeys([{ id: 1, title: "A", json: json("A"), existingKey: null, skip: null }], taken);
  assert.deepEqual([...taken], ["a2020"]);
});

test("keyReport: missing keys, shared keys (case ignored) and two keys on one item", () => {
  const r = keyReport([
    { id: 1, title: "One", native: "smith2020", extra: "" },
    { id: 2, title: "Two", native: "", extra: "Citation Key: Smith2020" },
    { id: 3, title: "Three", native: "", extra: "PMID: 1" },
    { id: 4, title: "Four", native: "lee2020", extra: "Citation Key: lee2020b" },
    { id: 5, title: "Five", native: "kim2021", extra: "Citation Key: kim2021" },
  ]);
  assert.deepEqual(r.missing, [{ id: 3, title: "Three" }]);
  assert.deepEqual(r.shared, [{ key: "smith2020", items: [{ id: 1, title: "One", key: "smith2020" }, { id: 2, title: "Two", key: "Smith2020" }] }]);
  assert.deepEqual(r.twoKeys, [{ id: 4, title: "Four", native: "lee2020", extra: "lee2020b" }]);
});

test("reportLines says each problem in one line, and nothing when there is none", () => {
  assert.deepEqual(reportLines(keyReport([{ id: 1, title: "A", native: "a", extra: "" }])), []);
  const lines = reportLines(keyReport([
    { id: 1, title: "One", native: "smith2020", extra: "" },
    { id: 2, title: "Two", native: "smith2020", extra: "" },
    { id: 4, title: "Four", native: "lee2020", extra: "Citation Key: lee2020b" },
  ]));
  assert.deepEqual(lines, [
    "smith2020 is the key of 2 items: One; Two",
    "Four has two keys: lee2020 (field) and lee2020b (Extra)",
  ]);
});

test("keyChanges reports a changed or removed key, not a new one", () => {
  const before = new Map([[1, "a2020"], [2, ""], [3, "c2020"], [4, "d2020"]]);
  const after = new Map([[1, "a2020b"], [2, "b2020"], [3, ""], [4, "d2020"]]);
  assert.deepEqual(keyChanges(before, after, [1, 2, 3, 4, 5]), [
    { id: 1, from: "a2020", to: "a2020b" },
    { id: 3, from: "c2020", to: "" },
  ]);
});

test("the automatic key has a limit", () => {
  assert.equal(AUTO_KEY_MAX, 20);
});
