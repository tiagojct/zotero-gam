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

function failingOpen(s) {
  const messages = [];
  s.Gam.Zotero.launchURL = () => { throw new Error("Handler not found"); };
  s.Gam.Zotero.ProgressWindow = class { changeHeadline() {} addDescription(m) { messages.push(m); } show() {} startCloseTimer() {} };
  return messages;
}

test("a note that was made is not a failure when Obsidian does not open", async () => {
  const s = setup({ citationKey: "gamtest2026" });
  const messages = failingOpen(s);
  const r = await createNote(s.Gam, s.item, { open: true });
  assert.equal(r.path, "lit/gamtest2026.md");
  assert.match(r.openError, /Obsidian did not open the note: Handler not found/);
  assert.equal(s.saved.length, 1);
  assert.match(messages.join("\n"), /Note created: lit\/gamtest2026\.md\nObsidian did not open the note/);
});

test("createNotes counts the note when Obsidian does not open", async () => {
  const s = setup({ citationKey: "gamtest2026" });
  const messages = failingOpen(s);
  s.Gam.prefs.openAfterCreate = () => true;
  const r = await createNotes(s.Gam, [s.item]);
  assert.equal(r.made, 1);
  assert.deepEqual(r.errors, []);
  assert.match(messages.join("\n"), /^1 note\(s\) created\.\nObsidian did not open the note: Handler not found$/);
});

test("an item in the trash is refused before any file is written", async () => {
  const s = setup({ citationKey: "gamtest2026" });
  s.item.isInTrash = () => true;
  await assert.rejects(createNote(s.Gam, s.item), /in the trash/);
  assert.equal(fs.readdirSync(s.vault).length, 0);
  assert.equal(s.saved.length, 0);
});

test("the note goes into the literature folder of the index, with the case on disk", async () => {
  const s = setup({ citationKey: "gamtest2026" });
  fs.mkdirSync(path.join(s.vault, "Lit"));
  s.Gam.state.literatureFolder = "Lit";
  const r = await createNote(s.Gam, s.item);
  assert.equal(r.path, "Lit/gamtest2026.md");
  assert.match(s.saved[0].html, /file=Lit%2Fgamtest2026/);
});

test("an item with no citekey gets a new one in the native field", async () => {
  const s = setup();
  const r = await createNote(s.Gam, s.item);
  assert.equal(r.citekey, "gamtest2026");
  assert.equal(s.item.fields.citationKey, "gamtest2026");
  assert.ok(fs.existsSync(path.join(s.vault, "lit/gamtest2026.md")));
  assert.equal(s.saved.length, 1);
});

test("a new citekey avoids the keys of the library (native field and Extra) and of the vault", async () => {
  const s = setup();
  s.Gam.Zotero.DB.columnQueryAsync = async (sql, params) =>
    params[0] === "citationKey" ? ["gamtest2026"] : ["Note\nCitation Key: gamtest2026a"];
  s.Gam.state.index = buildIndex([{ path: "lit/gamtest2026b.md", text: "" }], { literatureFolder: "lit" });
  const r = await createNote(s.Gam, s.item);
  assert.ok(!["gamtest2026", "gamtest2026a", "gamtest2026b"].includes(r.citekey), r.citekey);
  assert.match(r.citekey, /^gamtest2026[a-z]+$/);
  assert.equal(s.item.fields.citationKey, r.citekey);
});

test("when the item type has no citationKey field, the key is the first line of Extra", async () => {
  const s = setup();
  s.Gam.Zotero.ItemFields.isValidForType = () => false;
  s.item.fields.extra = "Citation Key: old\nPMID: 1";
  const r = await createNote(s.Gam, s.item);
  assert.equal(s.item.fields.extra, `Citation Key: ${r.citekey}\nPMID: 1`);
  assert.equal(s.item.fields.citationKey, "");
});

test("when the new file exists, no citekey is saved and no child note is added", async () => {
  const s = setup();
  fs.mkdirSync(path.join(s.vault, "lit"));
  fs.writeFileSync(path.join(s.vault, "lit/gamtest2026.md"), "mine");
  await assert.rejects(createNote(s.Gam, s.item), (e) => e.name === "exists");
  assert.equal(s.item.fields.citationKey, "");
  assert.equal(s.saved.length, 0);
  assert.equal(fs.readFileSync(path.join(s.vault, "lit/gamtest2026.md"), "utf8"), "mine");
});
