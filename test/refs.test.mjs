import { test } from "node:test";
import assert from "node:assert/strict";
import { extractRefs } from "../content/lib/refs.mjs";

test("extractRefs finds wikilinks, pandoc keys, zotero URIs and DOIs", () => {
  const r = extractRefs("See [[abdulnour2025]] and [[cai2026|Cai]] and @baek2026; zotero://select/library/items/SCC3C8XC; doi 10.1056/NEJMra2503232.");
  assert.deepEqual([...r.citekeys].sort(), ["abdulnour2025", "baek2026", "cai2026"]);
  assert.deepEqual([...r.itemKeys], ["SCC3C8XC"]);
  assert.deepEqual([...r.dois], ["10.1056/nejmra2503232"]);
});

test("extractRefs ignores e-mail addresses and trailing punctuation of DOIs", () => {
  const r = extractRefs("mail me@example.org (10.1000/xyz123).");
  assert.deepEqual([...r.citekeys], []);
  assert.deepEqual([...r.dois], ["10.1000/xyz123"]);
});

test("extractRefs ignores wikilinks to ordinary notes and keeps path wikilinks to literature notes", () => {
  const r = extractRefs("[[Agenda status]] [[sub-sub/literature/cai2026]] [[cai2026#Key points]] [@doe2020, p. 3]");
  assert.deepEqual([...r.citekeys].sort(), ["cai2026", "doe2020"]);
});

test("extractRefs reads DOIs in URLs", () => {
  assert.deepEqual([...extractRefs("https://doi.org/10.1016/j.x.2020.01.002)").dois], ["10.1016/j.x.2020.01.002"]);
});
