import { test } from "node:test";
import assert from "node:assert/strict";
import { noteState, columnText } from "../content/lib/state.mjs";
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
