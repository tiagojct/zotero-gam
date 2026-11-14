import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { installFakeIO, tempVault } from "./helpers/fake-io.mjs";
import { buildIndex } from "../content/lib/index.mjs";

installFakeIO();
const { createNote, createNotes } = await import("../content/create.mjs");

function setup({ citationKey = "", editable = true, noteSaveFails = false, links = [] } = {}) {
  const vault = tempVault();
  const saved = [];
  let refreshes = 0;
  class FakeNote {
    constructor() { this.tags = []; }
    setNote(h) { this.html = h; }
    addTag(t) { this.tags.push(t); }
    async saveTx() { if (noteSaveFails) throw new Error("note save failed"); saved.push(this); }
  }
  const Zotero = {
    DB: { columnQueryAsync: async () => [] },
    ItemFields: { getID: () => 9, isValidForType: () => true },
    Item: FakeNote,
    ProgressWindow: class { changeHeadline() {} addDescription() {} show() {} startCloseTimer() {} },
    launchURL() {},
  };
  const makeItem = (id, key, fields) => ({
    id, key, libraryID: 1, itemTypeID: 1, fields,
    library: { editable }, isEditable: () => editable, isRegularItem: () => true,
    toJSON: () => ({ title: "T", itemType: "journalArticle", date: "2026", creators: [{ creatorType: "author", lastName: "Gamtest" }] }),
    setField(f, v) { this.fields[f] = v; }, getField(f) { return this.fields[f] || ""; }, async saveTx() {},
  });
  const item = makeItem(1, "ABCDEFGH", { citationKey });
  const Gam = {
    Zotero,
    state: { index: buildIndex([], { literatureFolder: "lit" }), links: new Map([[1, links]]), error: null },
    prefs: { vault: () => vault, vaultName: () => "v", literatureFolder: () => "lit", marker: () => "", openAfterCreate: () => false },
    itemInfo: (i) => ({ citekey: i.fields.citationKey || null, itemKey: i.key, doi: "" }),
    refresh: async () => { refreshes += 1; },
  };
  return { vault, item, Gam, saved, makeItem, refreshes: () => refreshes };
}

test("a read-only item is refused before any file is written", async () => {
  const s = setup({ editable: false });
  await assert.rejects(createNote(s.Gam, s.item), /cannot be changed/);
  assert.equal(fs.existsSync(path.join(s.vault, "lit")), false);
});

test("an unsafe citekey is refused before any file is written", async () => {
  for (const key of ["a/b", "../x", ".hidden", "a\\b"]) {
    const s = setup({ citationKey: key });
    await assert.rejects(createNote(s.Gam, s.item), /cannot be used as a file name/);
    assert.equal(fs.readdirSync(s.vault).length, 0);
  }
});

test("a failure after the file write says what was written and refreshes", async () => {
  const s = setup({ citationKey: "gamtest2026", noteSaveFails: true });
  await assert.rejects(createNote(s.Gam, s.item), (e) =>
    e.message.includes(`The note file was written to lit/gamtest2026.md`) && e.message.includes("note save failed"));
  assert.ok(fs.existsSync(path.join(s.vault, "lit/gamtest2026.md")));
  assert.equal(s.refreshes(), 1);
});

test("no second child note when the item already links to the same file", async () => {
  const s = setup({ citationKey: "gamtest2026", links: [{ vault: "V", file: "lit/gamtest2026.md" }] });
  await createNote(s.Gam, s.item);
  assert.ok(fs.existsSync(path.join(s.vault, "lit/gamtest2026.md")));
  assert.equal(s.saved.length, 0);
});

test("a normal create writes the file and one child note", async () => {
  const s = setup({ citationKey: "gamtest2026" });
  const r = await createNote(s.Gam, s.item);
  assert.equal(r.path, "lit/gamtest2026.md");
  assert.equal(s.saved.length, 1);
  assert.match(s.saved[0].html, /file=lit%2Fgamtest2026/);
});

test("createNotes refreshes once for several items", async () => {
  const s = setup({ citationKey: "a2026" });
  const second = s.makeItem(2, "BBBBBBBB", { citationKey: "b2026" });
  const r = await createNotes(s.Gam, [s.item, second]);
  assert.equal(r.made, 2);
  assert.equal(s.refreshes(), 1);
});

test("an item in a group library gets the groups form of the Zotero link", async () => {
  const s = setup({ citationKey: "grp2026" });
  s.item.library = { editable: true, libraryType: "group", groupID: 4321 };
  await createNote(s.Gam, s.item);
  const text = fs.readFileSync(path.join(s.vault, "lit/grp2026.md"), "utf8");
  assert.match(text, /^zotero: zotero:\/\/select\/groups\/4321\/items\/ABCDEFGH$/m);
});
