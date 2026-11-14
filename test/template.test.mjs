import { test } from "node:test";
import assert from "node:assert/strict";
import { noteFromItem, yamlString } from "../content/lib/template.mjs";
import { parseFrontmatter } from "../content/lib/frontmatter.mjs";

const item = { title: 'Risk: "AI" #1', itemType: "journalArticle", date: "2025-06-01", DOI: "10.1/x",
  publicationTitle: "N Engl J Med", creators: [{ creatorType: "author", lastName: "Abdulnour", firstName: "Raja-Elie E." }] };

test("round trip through parseFrontmatter", () => {
  const { data, body } = parseFrontmatter(noteFromItem(item, { citekey: "abdulnour2025", itemKey: "SCC3C8XC", today: "2026-11-14" }));
  assert.deepEqual(data, { title: 'Risk: "AI" #1', authors: ["Abdulnour, Raja-Elie E."], year: "2025", citekey: "abdulnour2025",
    "item-type": "journalArticle", venue: "N Engl J Med", doi: "10.1/x", zotero: "zotero://select/library/items/SCC3C8XC",
    status: "to-read", tags: [], created: "2026-11-14" });
  assert.equal(body.trim(), "## Summary\n\n## Key points");
});

test("field order follows the Sub-Sub notes", () => {
  const keys = noteFromItem(item, { citekey: "a", itemKey: "AAAAAAAA", today: "2026-11-14" })
    .split("\n").map((l) => l.match(/^([a-z-]+):/)?.[1]).filter(Boolean);
  assert.deepEqual(keys, ["title", "authors", "year", "citekey", "item-type", "venue", "doi", "zotero", "status", "tags", "created"]);
});

test("venue falls back to bookTitle, then publisher; no DOI means no doi line", () => {
  const n = noteFromItem({ title: "T", itemType: "bookSection", bookTitle: "B", creators: [] }, { citekey: "tnd", itemKey: "AAAAAAAA", today: "2026-11-14" });
  assert.equal(parseFrontmatter(n).data.venue, "B");
  assert.doesNotMatch(n, /^doi:/m);
  const p = noteFromItem({ title: "T", itemType: "book", publisher: "P", creators: [] }, { citekey: "tnd", itemKey: "AAAAAAAA", today: "2026-11-14" });
  assert.equal(parseFrontmatter(p).data.venue, "P");
});

test("no creators, no date, no venue: authors is an empty list, no year and no venue lines", () => {
  const n = noteFromItem({ title: "T", creators: [] }, { citekey: "tnd", itemKey: "AAAAAAAA", today: "2026-11-14" });
  const { data } = parseFrontmatter(n);
  assert.deepEqual(data.authors, []);
  assert.doesNotMatch(n, /^(year|venue):/m);
});

test("institution author uses the name field; editors are left out", () => {
  const n = noteFromItem({ title: "T", creators: [{ creatorType: "author", name: "WHO" }, { creatorType: "editor", lastName: "E", firstName: "F" }] },
    { citekey: "who", itemKey: "AAAAAAAA", today: "2026-11-14" });
  assert.deepEqual(parseFrontmatter(n).data.authors, ["WHO"]);
});

test("a newline in the title stays inside the string", () => {
  assert.equal(parseFrontmatter(noteFromItem({ title: "a\nb", creators: [] }, { citekey: "x", itemKey: "AAAAAAAA", today: "2026-11-14" })).data.title, "a b");
});

test("yamlString quotes and escapes", () => {
  assert.equal(yamlString('a "b"\nc'), '"a \\"b\\" c"');
});

test("a citekey that is not plain is quoted", () => {
  const n = noteFromItem({ title: "T", creators: [] }, { citekey: "2020", itemKey: "AAAAAAAA", today: "2026-11-14" });
  assert.match(n, /^citekey: "2020"$/m);
  assert.match(noteFromItem({ title: "T", creators: [] }, { citekey: "smith_2020-a", itemKey: "AAAAAAAA", today: "2026-11-14" }), /^citekey: smith_2020-a$/m);
});
