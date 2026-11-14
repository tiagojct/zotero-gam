import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndex, isCached } from "../content/lib/index.mjs";

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

test("files in excluded folders count as existing paths but not as references", () => {
  const i = buildIndex([
    { path: "archive/old.md", text: "", excluded: true },
    { path: "archive/cites.md", text: "[[cai2026]]", excluded: true },
    { path: "sub-sub/literature/cai2026.md", text: "" },
  ], { literatureFolder: "sub-sub/literature" });
  assert.ok(i.hasPath("archive/old.md"));
  assert.deepEqual(i.citedIn({ citekey: "cai2026" }), []);
});

test("cache: a file with the same stamp is not read again and gives the same index", () => {
  const cache = new Map();
  const lf = { literatureFolder: "sub-sub/literature", cache };
  const stamped = files.map((f, i) => ({ ...f, stamp: `s${i}` }));
  const ix1 = buildIndex(stamped, lf);
  assert.ok(stamped.every((f) => isCached(cache, f.path, f.stamp, "sub-sub/literature")));
  const ix2 = buildIndex(stamped.map((f) => ({ ...f, text: null })), lf);
  assert.equal(ix2.noteFor({ citekey: "cai2026" }), ix1.noteFor({ citekey: "cai2026" }));
  assert.deepEqual(ix2.citedIn({ citekey: "cai2026", doi: "10.5555/abc" }), ix1.citedIn({ citekey: "cai2026", doi: "10.5555/abc" }));
  assert.deepEqual([...ix2.citekeys()].sort(), [...ix1.citekeys()].sort());
});

test("cache: a new stamp, another literature folder or a removed file is not cached", () => {
  const cache = new Map();
  const one = [{ path: "sub-sub/literature/cai2026.md", text: lit, stamp: "a" }, { path: "x/y.md", text: "[[cai2026]]", stamp: "b" }];
  buildIndex(one, { literatureFolder: "sub-sub/literature", cache });
  assert.equal(isCached(cache, "sub-sub/literature/cai2026.md", "a2", "sub-sub/literature"), false);
  assert.equal(isCached(cache, "sub-sub/literature/cai2026.md", "a", "lit"), false);
  const changed = lit.replace("status: read", "status: to-read");
  const ix = buildIndex([{ path: "sub-sub/literature/cai2026.md", text: changed, stamp: "a2" }], { literatureFolder: "sub-sub/literature", cache });
  assert.equal(ix.noteFor({ citekey: "cai2026" }).status, "to-read");
  assert.equal(ix.citedIn({ citekey: "cai2026" }).length, 0);
  assert.deepEqual([...cache.keys()], ["sub-sub/literature/cai2026.md"]);
});

test("cache: a file with no text and no cache entry adds no made-up data", () => {
  const ix = buildIndex([{ path: "sub-sub/literature/x2020.md", stamp: "a", text: null }], { literatureFolder: "sub-sub/literature", cache: new Map() });
  assert.equal(ix.noteFor({ citekey: "x2020" }), null);
  assert.ok(ix.hasPath("sub-sub/literature/x2020.md"));
});
