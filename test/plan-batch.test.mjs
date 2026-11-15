import { test } from "node:test";
import assert from "node:assert/strict";
import { planBatch, skipSummary } from "../content/lib/plan-batch.mjs";

const json = (last, year = "2026") => ({ title: `T ${last}`, itemType: "journalArticle", date: year, creators: [{ creatorType: "author", lastName: last }] });
const entry = (id, last, extra = {}) => ({ id, title: `T ${last}`, json: json(last), itemKey: `KEY0000${id}`, existingKey: null, libraryPath: "library", skip: null, ...extra });
const opts = (over = {}) => ({ taken: new Set(), hasPath: () => false, vaultName: "v", literatureFolder: "lit", today: "2026-11-15", ...over });

test("new citekeys in one batch do not collide with each other", () => {
  const rows = planBatch([entry(1, "Smith"), entry(2, "Smith"), entry(3, "Smith")], opts());
  assert.deepEqual(rows.map((r) => r.citekey), ["smith2026", "smith2026a", "smith2026b"]);
  assert.deepEqual(rows.map((r) => r.relPath), ["lit/smith2026.md", "lit/smith2026a.md", "lit/smith2026b.md"]);
  assert.ok(rows.every((r) => r.status === "create" && r.newKey));
});

test("citekeys of the library and the vault are taken; the taken set is not changed", () => {
  const taken = new Set(["smith2026"]);
  const rows = planBatch([entry(1, "Smith")], opts({ taken }));
  assert.equal(rows[0].citekey, "smith2026a");
  assert.deepEqual([...taken], ["smith2026"]);
});

test("an item with a citekey keeps it and is not a new key", () => {
  const rows = planBatch([entry(1, "Smith", { existingKey: "mine2020" }), entry(2, "Smith")], opts());
  assert.equal(rows[0].citekey, "mine2020");
  assert.equal(rows[0].newKey, false);
  assert.equal(rows[1].citekey, "smith2026");
});

test("a skip reason from the caller gives a skip row, in order, and uses no citekey", () => {
  const rows = planBatch([entry(1, "Smith", { skip: "already have a note" }), entry(2, "Smith")], opts());
  assert.equal(rows[0].status, "skip");
  assert.equal(rows[0].reason, "already have a note");
  assert.equal(rows[1].citekey, "smith2026");
  assert.deepEqual(rows.map((r) => r.id), [1, 2]);
});

test("a citekey that cannot be a file name, a path in the vault and a repeated path are skipped", () => {
  const rows = planBatch([
    entry(1, "A", { existingKey: "a/b" }),
    entry(2, "B", { existingKey: "b2020" }),
    entry(3, "C", { existingKey: "B2020" }),
    entry(4, "D", { existingKey: "d2020" }),
  ], opts({ hasPath: (p) => p === "lit/d2020.md" }));
  assert.deepEqual(rows.map((r) => r.status), ["skip", "create", "skip", "skip"]);
  assert.match(rows[0].reason, /citekey that cannot be a file name/);
  assert.match(rows[2].reason, /share a citekey/);
  assert.match(rows[3].reason, /file name that is in the vault/);
});

test("a skipped row does not take a new citekey", () => {
  const rows = planBatch([entry(1, "Smith", { existingKey: "smith2026", skip: "already have a note" }), entry(2, "Smith")], opts());
  assert.equal(rows[1].citekey, "smith2026");
});

test("skipSummary counts the reasons", () => {
  const rows = planBatch([
    entry(1, "A", { skip: "already have a note" }),
    entry(2, "B", { skip: "already have a note" }),
    entry(3, "C", { skip: "cannot be changed" }),
    entry(4, "D"),
  ], opts());
  assert.deepEqual(skipSummary(rows), ["2 already have a note", "1 cannot be changed"]);
});
