import { test } from "node:test";
import assert from "node:assert/strict";
import { currentKey, baseKey, uniqueKey, slug } from "../content/lib/citekey.mjs";

test("currentKey: native field first, then Extra", () => {
  assert.equal(currentKey({ citationKey: "a2020", extra: "Citation Key: b2020" }), "a2020");
  assert.equal(currentKey({ extra: "PMID: 1\ncitation key: b2020" }), "b2020");
  assert.equal(currentKey({ extra: "" }), null);
  assert.equal(currentKey({}), null);
});

test("baseKey: author surname without accents plus year", () => {
  assert.equal(baseKey({ creators: [{ creatorType: "author", lastName: "Jácinto" }], date: "2026-03-01" }), "jacinto2026");
});

test("baseKey: editor when no author; institution names", () => {
  assert.equal(baseKey({ creators: [{ creatorType: "editor", lastName: "Silva" }], date: "2019" }), "silva2019");
  assert.equal(baseKey({ creators: [{ creatorType: "author", name: "World Health Organization" }], date: "2021" }), "worldhealthorganization2021");
  assert.equal(baseKey({ creators: [{ creatorType: "author", name: "European Commission, Directorate-General for Research" }], date: "2020" }), "europeancommission2020");
});

test("baseKey: no creator, no date", () => {
  assert.equal(baseKey({ title: "The Economist" }), "economistnd");
  assert.equal(baseKey({}), "anonnd");
});

test("baseKey matches the Python rule on uppercase special letters", () => {
  // Python: base_key(...) == "goncalvesster1999" (the uppercase Ø is dropped).
  assert.equal(baseKey({ creators: [{ creatorType: "author", lastName: "Gonçalves-Øster" }], date: "c. 1999" }), "goncalvesster1999");
});

test("slug keeps only a-z and 0-9", () => {
  assert.equal(slug("Straße 1"), "strasse1");
});

test("uniqueKey adds a, b, ... on collision", () => {
  assert.equal(uniqueKey("x2020", new Set()), "x2020");
  assert.equal(uniqueKey("x2020", new Set(["x2020", "x2020a"])), "x2020b");
});

test("uniqueKey goes on to two letters after z", () => {
  const taken = new Set(["k2020", ..."abcdefghijklmnopqrstuvwxyz".split("").map((c) => "k2020" + c)]);
  assert.equal(uniqueKey("k2020", taken), "k2020aa");
});
