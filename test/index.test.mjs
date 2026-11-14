import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndex } from "../content/lib/index.mjs";

const lit = "---\ntitle: Cai paper\ncitekey: cai2026\nzotero: zotero://select/library/items/ABCDEFGH\nstatus: read\ntags:\n  - topic/ai\n---\n## Summary\n\nS1.\n";
const files = [
  { path: "sub-sub/literature/cai2026.md", text: lit },
  { path: "sub-sub/research/r.md", text: "Uses [[cai2026]]." },
  { path: "essays/e.md", text: "doi 10.5555/ABC" },
  { path: "sub-sub/literature/nofm.md", text: "# no frontmatter" },
];
const ix = buildIndex(files, { literatureFolder: "sub-sub/literature" });

test("note by citekey or item key", () => {
  const n = ix.noteFor({ citekey: "cai2026" });
  assert.equal(n.status, "read");
  assert.equal(n.title, "Cai paper");
  assert.deepEqual(n.tags, ["topic/ai"]);
  assert.equal(n.itemKey, "ABCDEFGH");
  assert.equal(ix.noteFor({ itemKey: "ABCDEFGH" }).path, "sub-sub/literature/cai2026.md");
  assert.equal(n.summary, "S1.");
  assert.equal(ix.noteFor({ citekey: "zzz" }), null);
  assert.equal(ix.noteFor({}), null);
});

test("a literature file without frontmatter is found by its file name", () => {
  const n = ix.noteFor({ citekey: "nofm" });
  assert.equal(n.status, "");
  assert.equal(n.title, "nofm");
});

test("citedIn joins citekey, item key and DOI matches, without the note itself", () => {
  assert.deepEqual(ix.citedIn({ citekey: "cai2026", itemKey: "ABCDEFGH", doi: "10.5555/abc" }), ["essays/e.md", "sub-sub/research/r.md"]);
  assert.deepEqual(ix.citedIn({}), []);
});

test("hasPath and citekeys", () => {
  assert.ok(ix.hasPath("sub-sub/literature/cai2026.md"));
  assert.ok(!ix.hasPath("sub-sub/literature/gone.md"));
  assert.deepEqual([...ix.citekeys()].sort(), ["cai2026", "nofm"]);
});

test("files outside the literature folder are not literature notes", () => {
  assert.equal(ix.noteFor({ citekey: "r" }), null);
  const i3 = buildIndex([{ path: "sub-sub/literature-old/x2020.md", text: "" }], { literatureFolder: "sub-sub/literature" });
  assert.equal(i3.noteFor({ citekey: "x2020" }), null);
});

test("NFD file name matches an NFC citekey", () => {
  const i2 = buildIndex([{ path: "sub-sub/literature/gonçalves2020.md", text: "" }], { literatureFolder: "sub-sub/literature" });
  assert.ok(i2.noteFor({ citekey: "gonçalves2020" }));
  assert.ok(i2.hasPath("sub-sub/literature/gonçalves2020.md"));
});
