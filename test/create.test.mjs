import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { installFakeIO, tempVault } from "./helpers/fake-io.mjs";
import { buildIndex } from "../content/lib/index.mjs";

installFakeIO();
const { createNote, createNotes, linkNote, linkNotes, createNotesForCollection, collectionItems } = await import("../content/create.mjs");

function setup({ citationKey = "", editable = true, noteSaveFails = false, links = [] } = {}) {
  const vault = tempVault();
  const saved = [];
  let refreshes = 0;
  class FakeNote {
    constructor() { this.tags = []; }
    setNote(h) { this.html = h; }
    getNote() { return this.html; }
    addTag(t) { this.tags.push(t); }
    async saveTx() {
      if (noteSaveFails) throw new Error("note save failed");
      // A save takes a moment, as in Zotero.
      await new Promise((r) => setTimeout(r, 5));
      this.id = 100 + saved.length;
      saved.push(this);
    }
  }
  const Zotero = {
    DB: { columnQueryAsync: async () => [] },
    ItemFields: { getID: () => 9, isValidForType: () => true },
    Item: FakeNote,
    Items: { get: (ids) => ids.map((id) => saved.find((n) => n.id === id)) },
    ProgressWindow: class { changeHeadline() {} addDescription() {} show() {} startCloseTimer() {} },
    launchURL() {},
  };
  const makeItem = (id, key, fields) => ({
    id, key, libraryID: 1, itemTypeID: 1, fields,
    library: { editable }, isEditable: () => editable, isRegularItem: () => true,
    toJSON: () => ({ title: "T", itemType: "journalArticle", date: "2026", creators: [{ creatorType: "author", lastName: "Gamtest" }] }),
    setField(f, v) { this.fields[f] = v; }, getField(f) { return this.fields[f] || ""; }, async saveTx() {},
    getNotes() { return saved.filter((n) => n.parentID === id).map((n) => n.id); },
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

const LINKED = "---\ncitekey: cai2026\nzotero: zotero://select/library/items/ABCDEFGH\n---\n";
function withNote(s, links = []) {
  s.Gam.state.index = buildIndex([{ path: "lit/cai2026.md", text: LINKED }], { literatureFolder: "lit" });
  s.Gam.state.links = new Map([[1, links]]);
  return s;
}

test("Create note waits for a key job that runs now, so two items do not get the same key", async () => {
  const s = setup();
  const { exclusive } = await import("../content/queue.mjs");
  let keys = [];
  s.Gam.Zotero.DB.columnQueryAsync = async (sql, params) => (params[0] === "citationKey" ? keys : []);
  let open;
  const gate = new Promise((r) => { open = r; });
  // An automatic key job that has chosen gamtest2026 for another item and saves it a moment later.
  const job = exclusive(async () => { await gate; keys = ["gamtest2026"]; });
  const note = createNote(s.Gam, s.item);
  await new Promise((r) => setTimeout(r, 20));
  open();
  await job;
  const r = await note;
  assert.notEqual(r.citekey, "gamtest2026");
  assert.match(r.citekey, /^gamtest2026[a-z]+$/);
});

test("Add Zotero link waits for a key job that runs now, and does not set a key that the job gave", async () => {
  const s = withNote(setup());
  const { exclusive } = await import("../content/queue.mjs");
  let keys = [];
  s.Gam.Zotero.DB.columnQueryAsync = async (sql, params) => (params[0] === "citationKey" ? keys : []);
  let open;
  const gate = new Promise((r) => { open = r; });
  const job = exclusive(async () => { await gate; keys = ["cai2026"]; });
  const link = linkNote(s.Gam, s.item);
  await new Promise((r) => setTimeout(r, 20));
  open();
  await job;
  const r = await link;
  assert.equal(r.citekey, null);
  assert.equal(s.item.fields.citationKey, "");
  assert.match(r.warning, /used by another item/);
});

test("Add Zotero link does not write the key of the note over a key that a job gave while it waited", async () => {
  const s = withNote(setup());
  const { exclusive } = await import("../content/queue.mjs");
  let open;
  const gate = new Promise((r) => { open = r; });
  const job = exclusive(async () => { await gate; s.item.fields.citationKey = "gamtest2026"; });
  const link = linkNote(s.Gam, s.item);
  await new Promise((r) => setTimeout(r, 20));
  open();
  await job;
  await link;
  assert.equal(s.item.fields.citationKey, "gamtest2026");
});

test("linkNote adds the child note in the Create note format and writes nothing in the vault", async () => {
  const s = withNote(setup({ citationKey: "cai2026" }));
  s.Gam.prefs.marker = () => "gam";
  const r = await linkNote(s.Gam, s.item);
  assert.deepEqual(r, { childNote: true, citekey: null, warning: null });
  assert.equal(s.saved.length, 1);
  assert.equal(s.saved[0].html,
    '<div><p>Literature note in the vault.</p><p><a href="obsidian://open?vault=v&amp;file=lit%2Fcai2026">Obsidian: cai2026</a></p></div>');
  assert.deepEqual(s.saved[0].tags, ["gam"]);
  assert.equal(s.saved[0].parentID, 1);
  assert.deepEqual(fs.readdirSync(s.vault), []);
  assert.equal(s.refreshes(), 1);
});

test("linkNote also sets the citekey of the note when the item has none", async () => {
  const s = withNote(setup());
  const r = await linkNote(s.Gam, s.item);
  assert.deepEqual(r, { childNote: true, citekey: "cai2026", warning: null });
  assert.equal(s.item.fields.citationKey, "cai2026");
  assert.equal(s.saved.length, 1);
});

test("linkNote: two calls at the same time add one child note", async () => {
  const s = withNote(setup({ citationKey: "cai2026" }));
  await Promise.all([linkNote(s.Gam, s.item), linkNote(s.Gam, s.item)]);
  assert.equal(s.saved.length, 1);
});

test("linkNote: a link note that the index does not know yet is not added again", async () => {
  const s = withNote(setup({ citationKey: "cai2026" }));
  await linkNote(s.Gam, s.item);
  // Gam.state.links is not refreshed (the fake refresh does nothing).
  const r = await linkNote(s.Gam, s.item);
  assert.equal(r.childNote, false);
  assert.equal(s.saved.length, 1);
});

test("linkNote: when the child note fails after the citekey was set, the message says so", async () => {
  const s = withNote(setup({ noteSaveFails: true }));
  await assert.rejects(linkNote(s.Gam, s.item), (e) =>
    /The link to lit\/cai2026\.md was not added/.test(e.message) && /citekey "cai2026" was set/.test(e.message));
});

test("linkNote does not set a citekey that another item has, and says so", async () => {
  const s = withNote(setup());
  s.Gam.Zotero.DB.columnQueryAsync = async (sql, params) => (params[0] === "citationKey" ? ["cai2026"] : []);
  const r = await linkNote(s.Gam, s.item);
  assert.equal(r.citekey, null);
  assert.equal(r.childNote, true);
  assert.match(r.warning, /The citekey "cai2026" is used by another item/);
  assert.equal(s.item.fields.citationKey, "");
  assert.equal(s.saved.length, 1);
});

test("linkNote changes nothing when the link and the citekey are there", async () => {
  const s = withNote(setup({ citationKey: "cai2026" }), [{ vault: "v", file: "lit/cai2026.md" }]);
  const r = await linkNote(s.Gam, s.item);
  assert.deepEqual(r, { childNote: false, citekey: null, warning: null });
  assert.equal(s.saved.length, 0);
  assert.equal(s.refreshes(), 0);
});

test("linkNote refuses items in the trash and read-only items", async () => {
  const t = withNote(setup({ citationKey: "cai2026" }));
  t.item.isInTrash = () => true;
  await assert.rejects(linkNote(t.Gam, t.item), /in the trash/);
  const r = withNote(setup({ citationKey: "cai2026", editable: false }));
  await assert.rejects(linkNote(r.Gam, r.item), /cannot be changed/);
  assert.equal(t.saved.length + r.saved.length, 0);
});

test("linkNotes reports one summary for several items", async () => {
  const s = withNote(setup({ citationKey: "cai2026" }));
  const messages = [];
  s.Gam.Zotero.ProgressWindow = class { changeHeadline() {} addDescription(m) { messages.push(m); } show() {} startCloseTimer() {} };
  const other = s.makeItem(2, "BBBBBBBB", { citationKey: "none2020" });
  const r = await linkNotes(s.Gam, [s.item, other]);
  assert.equal(r.linked, 1);
  assert.equal(s.refreshes(), 1);
  assert.equal(messages.join("\n"), "1 item(s) linked to their notes.");
});

// Batch for a collection: preview first, then the writes of the preview.

function batchSetup(count = 3) {
  const s = setup();
  s.Gam.state.literatureFolder = "lit";
  const items = [s.item, ...Array.from({ length: count - 1 }, (_, i) => s.makeItem(i + 2, `KEY0000${i + 2}`, {}))];
  const notes = () => (fs.existsSync(path.join(s.vault, "lit")) ? fs.readdirSync(path.join(s.vault, "lit")).sort() : []);
  return { ...s, items, notes };
}

test("a batch shows the preview and writes nothing when the user cancels", async () => {
  const s = batchSetup();
  let preview = null;
  const r = await createNotesForCollection(s.Gam, s.items, { name: "C", confirm: async (p) => { preview = p; return null; } });
  assert.equal(r.cancelled, true);
  assert.equal(r.made, 0);
  assert.deepEqual(preview.rows.map((x) => x.relPath), ["lit/gamtest2026.md", "lit/gamtest2026a.md", "lit/gamtest2026b.md"]);
  assert.equal(preview.folder, "lit");
  assert.deepEqual(s.notes(), []);
  assert.equal(s.saved.length, 0);
  assert.equal(s.refreshes(), 0);
});

test("a batch writes the notes of the preview with its citekeys, and refreshes once", async () => {
  const s = batchSetup();
  const r = await createNotesForCollection(s.Gam, s.items, { confirm: async (p) => p.rows.map((x) => x.id) });
  assert.equal(r.made, 3);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(s.notes(), ["gamtest2026.md", "gamtest2026a.md", "gamtest2026b.md"]);
  assert.deepEqual(s.items.map((i) => i.fields.citationKey), ["gamtest2026", "gamtest2026a", "gamtest2026b"]);
  assert.equal(s.saved.length, 3);
  assert.equal(s.refreshes(), 1);
});

test("a row that the user clears is not written, and the others keep the citekeys of the preview", async () => {
  const s = batchSetup();
  const r = await createNotesForCollection(s.Gam, s.items, { confirm: async () => [2, 3] });
  assert.equal(r.made, 2);
  assert.deepEqual(s.notes(), ["gamtest2026a.md", "gamtest2026b.md"]);
  assert.ok(!s.items[0].fields.citationKey);
});

test("a citekey that is taken after the preview fails that row only", async () => {
  const s = batchSetup(2);
  const r = await createNotesForCollection(s.Gam, s.items, {
    confirm: async (p) => {
      s.Gam.Zotero.DB.columnQueryAsync = async (sql, params) => (params?.[0] === "citationKey" ? ["gamtest2026a"] : []);
      return p.rows.map((x) => x.id);
    },
  });
  assert.equal(r.made, 1);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /gamtest2026a.*used now/);
  assert.deepEqual(s.notes(), ["gamtest2026.md"]);
});

test("items that have a note are left out of the preview; with nothing to create there is no preview", async () => {
  const s = batchSetup(2);
  s.Gam.state.index = buildIndex([{ path: "lit/a2020.md", text: "---\ncitekey: a2020\n---\n" }], { literatureFolder: "lit" });
  s.items[0].fields.citationKey = "a2020";
  let calls = 0;
  const confirm = async (p) => { calls += 1; return p.rows.map((x) => x.id); };
  const r1 = await createNotesForCollection(s.Gam, s.items, { confirm });
  assert.equal(r1.made, 1);
  assert.deepEqual(s.notes(), ["gamtest2026.md"]);
  // Now both have notes in the index.
  s.Gam.state.index = buildIndex([
    { path: "lit/a2020.md", text: "---\ncitekey: a2020\n---\n" },
    { path: "lit/gamtest2026.md", text: "---\ncitekey: gamtest2026\n---\n" },
  ], { literatureFolder: "lit" });
  const r2 = await createNotesForCollection(s.Gam, s.items, { confirm });
  assert.equal(calls, 1);
  assert.equal(r2.made, 0);
});

test("a read-only item is left out of the preview and named in the summary", async () => {
  const s = batchSetup(2);
  s.items[1].isEditable = () => false;
  let preview = null;
  await createNotesForCollection(s.Gam, s.items, { confirm: async (p) => { preview = p; return null; } });
  assert.deepEqual(preview.rows.map((x) => x.id), [1]);
  assert.deepEqual(preview.skipped, ["1 cannot be changed"]);
});

test("a batch without a vault index writes nothing and does not open the preview", async () => {
  const s = batchSetup(2);
  s.Gam.state.index = null;
  s.Gam.state.error = "The vault folder does not exist.";
  let calls = 0;
  const r = await createNotesForCollection(s.Gam, s.items, { confirm: async () => { calls += 1; return []; } });
  assert.equal(calls, 0);
  assert.equal(r.made, 0);
  assert.match(r.errors[0], /vault folder does not exist/);
});

test("a second batch while the first is open does not start", async () => {
  const s = batchSetup(2);
  let release;
  const first = createNotesForCollection(s.Gam, s.items, {
    confirm: () => new Promise((resolve) => { release = () => resolve(null); }),
  });
  await new Promise((r) => setTimeout(r, 20));
  const second = await createNotesForCollection(s.Gam, s.items, { confirm: async () => assert.fail("opened") });
  assert.match(second.errors[0], /still running/);
  release();
  await first;
});

test("collectionItems searches the collection, with subcollections only when Zotero shows them", async () => {
  const conditions = [];
  class FakeSearch {
    addCondition(...c) { conditions.push(c); }
    async search() { return [1, 2, 3]; }
  }
  const regular = (id) => ({ id, isRegularItem: () => true });
  const make = (recursive) => ({
    Search: FakeSearch,
    Prefs: { get: (k) => (k === "recursiveCollections" ? recursive : undefined) },
    Items: { getAsync: async (ids) => [...ids.map(regular), { id: 9, isRegularItem: () => false }] },
  });
  const items = await collectionItems(make(false), { id: 7, libraryID: 1 });
  assert.deepEqual(items.map((i) => i.id), [1, 2, 3]);
  assert.deepEqual(conditions, [["noChildren", "true"], ["collectionID", "is", 7]]);
  conditions.length = 0;
  await collectionItems(make(true), { id: 7, libraryID: 1 });
  assert.deepEqual(conditions.at(-1), ["recursive", "true"]);
});
