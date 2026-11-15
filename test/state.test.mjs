import { test } from "node:test";
import assert from "node:assert/strict";
import { noteState, columnText, missingLinks, linksTo } from "../content/lib/state.mjs";
import { buildIndex } from "../content/lib/index.mjs";

const index = buildIndex([
  { path: "sub-sub/literature/cai2026.md", text: "---\ncitekey: cai2026\nstatus: read\n---\n" },
  { path: "sub-sub/literature/bare.md", text: "" },
], { literatureFolder: "sub-sub/literature" });

test("a literature note gives kind note", () => {
  const s = noteState({ index, links: [], vaultName: "powerslave", citekey: "cai2026", itemKey: "X" });
  assert.equal(s.kind, "note");
  assert.equal(s.note.status, "read");
});

test("a link to a file that does not exist gives kind missing; vault names compare without case", () => {
  const links = [{ vault: "Powerslave", file: "sub-sub/literature/gone2020.md" }];
  assert.deepEqual(noteState({ index, links, vaultName: "powerslave", citekey: "gone2020", itemKey: "X" }),
    { kind: "missing", missingPath: "sub-sub/literature/gone2020.md" });
});

test("a link to another vault is ignored", () => {
  const links = [{ vault: "Other", file: "x.md" }];
  assert.equal(noteState({ index, links, vaultName: "powerslave", citekey: null, itemKey: "X" }).kind, "none");
});

test("no index (vault not found) gives kind none", () => {
  const links = [{ vault: "powerslave", file: "a.md" }];
  assert.equal(noteState({ index: null, links, vaultName: "powerslave", citekey: "cai2026", itemKey: "X" }).kind, "none");
});

test("columnText", () => {
  assert.equal(columnText({ kind: "note", note: { status: "to-read" } }), "to-read");
  assert.equal(columnText({ kind: "note", note: { status: "" } }), "no status");
  assert.equal(columnText({ kind: "missing", missingPath: "a.md" }), "missing");
  assert.equal(columnText({ kind: "none" }), "");
});

import { columnSignature, isNoteEvent } from "../content/lib/state.mjs";

test("columnSignature changes when a status or a linked file changes, not for other files", () => {
  const files = [{ path: "sub-sub/literature/a.md", text: "---\nstatus: to-read\n---\n" }];
  const lit = { literatureFolder: "sub-sub/literature" };
  const links = new Map([[7, [{ vault: "v", file: "sub-sub/literature/gone.md" }]]]);
  const s1 = columnSignature(buildIndex(files, lit), links);
  assert.equal(columnSignature(buildIndex([...files, { path: "other.md", text: "[[a]]" }], lit), links), s1);
  assert.notEqual(columnSignature(buildIndex([{ path: "sub-sub/literature/a.md", text: "---\nstatus: read\n---\n" }], lit), links), s1);
  assert.notEqual(columnSignature(buildIndex([...files, { path: "sub-sub/literature/gone.md", text: "" }], lit), links), s1);
  assert.notEqual(columnSignature(buildIndex(files, lit), new Map()), s1);
  assert.equal(columnSignature(null, new Map()), "");
});

test("isNoteEvent: only events on notes count", () => {
  const items = { 1: { isNote: () => true }, 2: { isNote: () => false } };
  const getItem = (id) => items[id] || false;
  const known = new Set([5]);
  assert.equal(isNoteEvent("modify", [2], getItem, known), false);
  assert.equal(isNoteEvent("modify", [2, 1], getItem, known), true);
  assert.equal(isNoteEvent("add", [1], getItem, known), true);
  assert.equal(isNoteEvent("delete", [9], getItem, known), false);
  assert.equal(isNoteEvent("delete", [5], getItem, known), true);
  assert.equal(isNoteEvent("refresh", [2], getItem, known), false);
});

const keyed = buildIndex([
  { path: "lit/cai2026.md", text: "---\ncitekey: cai2026\nzotero: zotero://select/library/items/ABCDEFGH\n---\n" },
], { literatureFolder: "lit" });

test("missingLinks: null when there is no note, or when the link and the citekey are there", () => {
  assert.equal(missingLinks({ index: null, links: [], vaultName: "v", citekey: null, itemKey: "ABCDEFGH" }), null);
  assert.equal(missingLinks({ index: keyed, links: [], vaultName: "v", citekey: null, itemKey: "ZZZZZZZZ" }), null);
  const links = [{ vault: "V", file: "lit/cai2026.md" }];
  assert.equal(missingLinks({ index: keyed, links, vaultName: "v", citekey: "cai2026", itemKey: "ABCDEFGH" }), null);
});

test("missingLinks: the child note when no link of this vault goes to the note", () => {
  const links = [{ vault: "other", file: "lit/cai2026.md" }, { vault: "v", file: "lit/x.md" }];
  const m = missingLinks({ index: keyed, links, vaultName: "v", citekey: "cai2026", itemKey: "ABCDEFGH" });
  assert.equal(m.note.path, "lit/cai2026.md");
  assert.equal(m.childNote, true);
  assert.equal(m.citekey, null);
});

test("missingLinks: with the child note, also the citekey of the note when the item has none", () => {
  const m = missingLinks({ index: keyed, links: [], vaultName: "v", citekey: null, itemKey: "ABCDEFGH" });
  assert.equal(m.childNote, true);
  assert.equal(m.citekey, "cai2026");
});

test("missingLinks: null when only the citekey is missing (gam may not be able to set it)", () => {
  const links = [{ vault: "v", file: "lit/cai2026.md" }];
  assert.equal(missingLinks({ index: keyed, links, vaultName: "v", citekey: null, itemKey: "ABCDEFGH" }), null);
});

test("missingLinks: null when the note names another Zotero item", () => {
  assert.equal(missingLinks({ index: keyed, links: [], vaultName: "v", citekey: "cai2026", itemKey: "OTHERKEY" }), null);
});

test("linksTo: the same file in another case, or a link with the file name only", () => {
  const note = "lit/Cai2026.md";
  assert.ok(linksTo([{ vault: "V", file: "Lit/cai2026.md" }], "v", note));
  assert.ok(linksTo([{ vault: "v", file: "cai2026.md" }], "v", note));
  assert.ok(!linksTo([{ vault: "v", file: "other/cai2026.md" }], "v", note));
  assert.ok(!linksTo([{ vault: "w", file: "lit/Cai2026.md" }], "v", note));
});

test("missingLinks: the link compares the vault name without case and the path in NFC", () => {
  const ix = buildIndex([{ path: "lit/ciência2020.md", text: "" }], { literatureFolder: "lit" });
  const links = [{ vault: "V", file: "lit/ciência2020.md" }];
  assert.equal(missingLinks({ index: ix, links, vaultName: "v", citekey: "ciência2020", itemKey: "X" }), null);
});
