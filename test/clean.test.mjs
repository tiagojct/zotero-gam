import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { installFakeIO, tempVault } from "./helpers/fake-io.mjs";

installFakeIO();
const { autoTitles, writeTitle, libraryEvidence, planLibrary, cleanItems } = await import("../content/clean.mjs");
const { ignoreKey } = await import("../content/lib/plan-clean.mjs");

function setup({ cleanNew = true, termsFile = "", abstracts = [] } = {}) {
  const dir = tempVault();
  const notices = [];
  const errors = [];
  const calls = [];
  const items = new Map();
  const queries = [];
  const Zotero = {
    DataDirectory: { dir },
    DB: {
      columnQueryAsync: async (sql, params) => {
        queries.push(params);
        return abstracts;
      },
    },
    Items: { get: (ids) => ids.map((id) => items.get(id)) },
    ItemTypes: { getName: (id) => ({ 1: "journalArticle", 2: "statute", 3: "film" })[id] },
    ProgressWindow: class {
      constructor() { this.n = notices.push("") - 1; }
      changeHeadline() {}
      addDescription(t) { notices[this.n] += (notices[this.n] ? "\n" : "") + t; }
      show() {}
      startCloseTimer() {}
    },
    logError: (e) => errors.push(e.message || String(e)),
  };
  const makeItem = (id, { title = `Item ${id}`, shortTitle = "", language = "en", abstractNote = "", editable = true, regular = true,
    feed = false, trash = false, type = 1, unsaved = false } = {}) => {
    const fields = { title, shortTitle, language, abstractNote };
    const item = {
      // fields: the values in the item object; stored: the values in the database (after saveTx).
      id, key: `KEY${id}`, libraryID: 1, itemTypeID: type, fields, stored: { ...fields }, saves: 0,
      library: { editable, libraryType: feed ? "feed" : "user" },
      isEditable: () => editable, isRegularItem: () => regular, isInTrash: () => trash, hasChanged: () => unsaved,
      getField(f) { return this.fields[f] || ""; },
      setField(f, v) { this.fields[f] = v; },
      async saveTx() {
        this.saves += 1;
        calls.push(["save", id]);
        this.stored = { ...this.fields };
      },
    };
    items.set(id, item);
    return item;
  };
  const Gam = {
    Zotero, homeDir: "/home/x",
    prefs: { cleanNew: () => cleanNew, termsFile: () => termsFile },
  };
  const log = () => {
    const p = path.join(dir, "gam-clean.jsonl");
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8").trimEnd().split("\n").map((l) => JSON.parse(l)) : [];
  };
  return { Gam, Zotero, dir, makeItem, notices, errors, calls, items, log, queries };
}

test("autoTitles does nothing when the setting is off", async () => {
  const s = setup({ cleanNew: false });
  const item = s.makeItem(1, { title: "A title." });
  assert.deepEqual(await autoTitles(s.Gam, [1]), { fixed: 0, toCheck: 0 });
  assert.equal(item.saves, 0);
  assert.deepEqual(s.queries, []);
});

test("autoTitles saves a safe fix one time, with a log line and no notice", async () => {
  const s = setup();
  const item = s.makeItem(1, { title: "A  title.", shortTitle: "a title" });
  assert.deepEqual(await autoTitles(s.Gam, [1]), { fixed: 1, toCheck: 0 });
  assert.equal(item.stored.title, "A title");
  assert.equal(item.stored.shortTitle, "a title", "no case change without the window");
  assert.equal(item.saves, 1);
  assert.deepEqual(s.log().map(({ date, ...e }) => e), [
    { libraryID: 1, key: "KEY1", field: "title", old: "A  title.", new: "A title" },
  ]);
  assert.match(s.log()[0].date, /^\d{4}-\d\d-\d\dT/);
  assert.deepEqual(s.notices, []);
});

test("autoTitles writes nothing for more than 20 new items, and says so", async () => {
  const s = setup();
  const ids = Array.from({ length: 21 }, (_, i) => s.makeItem(i + 1, { title: "A title." }).id);
  await autoTitles(s.Gam, ids);
  assert.ok([...s.items.values()].every((i) => i.saves === 0));
  assert.equal(s.notices.length, 1);
  assert.match(s.notices[0], /21 new items.*Tools > Clean library…/s);
  const t = setup();
  const twenty = Array.from({ length: 20 }, (_, i) => t.makeItem(i + 1, { title: "A title." }).id);
  assert.equal((await autoTitles(t.Gam, twenty)).fixed, 20);
});

test("autoTitles does not change the case of a title: it gives a notice", async () => {
  const s = setup();
  const item = s.makeItem(1, { title: "Asthma in africa." });
  assert.deepEqual(await autoTitles(s.Gam, [1]), { fixed: 1, toCheck: 1 });
  assert.equal(item.stored.title, "Asthma in africa");
  assert.deepEqual(s.notices, ["1 new title to check: Tools > Clean library…"]);
  s.makeItem(2, { title: "The Role of Artificial Intelligence in Severe Asthma" });
  s.makeItem(3, { title: "Asthma in europe" });
  await autoTitles(s.Gam, [2, 3]);
  assert.equal(s.notices[1], "2 new titles to check: Tools > Clean library…");
});

test("a suggestion or an ignored title gives no notice", async () => {
  const s = setup();
  s.makeItem(1, { title: "A delphi study", abstractNote: "the Delphi method" });
  const b = s.makeItem(2, { title: "Asthma in africa" });
  fs.writeFileSync(path.join(s.dir, "gam-ignored.json"),
    JSON.stringify({ version: 1, keys: [ignoreKey({ libraryID: 1, key: "KEY2", kind: "title", value: b.fields.title })] }));
  assert.deepEqual(await autoTitles(s.Gam, [1, 2]), { fixed: 0, toCheck: 0 });
  assert.deepEqual(s.notices, []);
});

test("autoTitles leaves out items without a title, read-only, feed and trash items, and what is not a regular item", async () => {
  const s = setup();
  for (const [id, o] of [[1, { title: "" }], [2, { editable: false }], [3, { feed: true }], [4, { trash: true }], [5, { regular: false }]]) {
    s.makeItem(id, { title: "A title.", ...o });
  }
  assert.deepEqual(await autoTitles(s.Gam, [1, 2, 3, 4, 5, 99]), { fixed: 0, toCheck: 0 });
  assert.ok([...s.items.values()].every((i) => i.saves === 0));
});

test("autoTitles does not write over a title that changed while it read its files", async () => {
  const s = setup({ termsFile: "/terms.txt" });
  const item = s.makeItem(1, { title: "A title." });
  const stat = IOUtils.stat;
  IOUtils.stat = async () => {
    item.fields.title = "The title of the user.";
    throw new Error("no file");
  };
  try {
    assert.deepEqual(await autoTitles(s.Gam, [1]), { fixed: 0, toCheck: 0 });
  } finally {
    IOUtils.stat = stat;
  }
  assert.equal(item.fields.title, "The title of the user.");
  assert.equal(item.saves, 0);
});

test("autoTitles leaves an item with changes that are not saved", async () => {
  const s = setup();
  const item = s.makeItem(1, { title: "A title.", unsaved: true });
  assert.deepEqual(await autoTitles(s.Gam, [1]), { fixed: 0, toCheck: 0 });
  assert.equal(item.saves, 0);
});

test("a log that cannot be written does not stop the write", async () => {
  const s = setup();
  s.Zotero.DataDirectory.dir = path.join(s.dir, "missing");
  const item = s.makeItem(1, { title: "A title." });
  assert.equal((await autoTitles(s.Gam, [1])).fixed, 1);
  assert.equal(item.stored.title, "A title");
  assert.equal(s.errors.length, 1);
});

test("one item that cannot be saved does not stop the others, and keeps its title", async () => {
  const s = setup();
  const bad = s.makeItem(1, { title: "A title.", shortTitle: "a title" });
  bad.saveTx = async () => { throw new Error("locked"); };
  const good = s.makeItem(2, { title: "B title." });
  assert.equal((await autoTitles(s.Gam, [1, 2])).fixed, 1);
  assert.equal(bad.fields.title, "A title.");
  assert.equal(bad.fields.shortTitle, "a title");
  assert.equal(good.stored.title, "B title");
  assert.deepEqual(s.errors, ["locked"]);
  assert.equal(s.log().length, 1);
});

test("two batches at the same time run one after the other", async () => {
  const s = setup();
  const item = s.makeItem(1, { title: "A title." });
  const r = await Promise.all([autoTitles(s.Gam, [1]), autoTitles(s.Gam, [1])]);
  assert.deepEqual(r.map((x) => x.fixed), [1, 0]);
  assert.equal(item.saves, 1);
});

test("writeTitle writes only over the title that it expects", async () => {
  const s = setup();
  const item = s.makeItem(1, { title: "Now" });
  assert.equal(await writeTitle(s.Gam, item, "Before", "After"), "changed");
  assert.equal(item.saves, 0);
  assert.equal(await writeTitle(s.Gam, item, "Now", "After"), "written");
  assert.equal(item.stored.title, "After");
});

test("libraryEvidence reads the abstracts of one library", async () => {
  const s = setup({ abstracts: ["a delphi panel", "x"] });
  const ev = await libraryEvidence(s.Gam, 7);
  assert.ok(ev.lower.has("delphi"));
  assert.deepEqual(s.queries, [["abstractNote", 7]]);
});

// --- The window

// A library with files: addFile gives an item its best attachment, addOrphan a file without a parent.
function library(options) {
  const s = setup(options);
  const { Zotero, Gam, items, calls } = s;
  const selected = [];
  const baseName = (item) => `Doe - ${item.getField("title").replace(/[?:/]/g, "")}`;
  Zotero.Items.loadDataTypes = async () => {};
  Zotero.File = { getValidFileName: (n) => n.replace(/\s+/g, " ").trim() };
  Zotero.Attachments = {
    shouldAutoRenameAttachment: (a) => a.allowed,
    getFileBaseNameFromItem: (item, { attachmentTitle }) => `${baseName(item)}${attachmentTitle === "S" ? " S" : ""}`,
    getCorrectFileExtension: () => "pdf",
  };
  Zotero.RecognizeDocument = {
    canRecognize: (a) => !a.parentID && !!a.pdf,
    recognizeItems: async (list) => {
      calls.push(["lookup", list.map((a) => a.id)]);
      for (const a of list) if (a.found) a.parentID = 77;
    },
  };
  Zotero.ProgressQueues = { get: () => ({ getDialog: () => ({ open: () => calls.push(["dialog"]) }) }) };
  Zotero.getMainWindow = () => ({ Zotero_Tabs: { selectedID: s.tab || "zotero-pane" }, ZoteroPane: Zotero.getActiveZoteroPane() });
  const pane = {
    getSelectedItems: () => [{ id: selected.at(-1)?.[0] }],
    selectItem: async (id) => selected.push([id]),
    selectItems: async (ids) => selected.push(ids),
    createParentItemsFromSelected: async () => calls.push(["createParent"]),
  };
  Zotero.getActiveZoteroPane = () => pane;
  Gam.renameFileFromParent = async (a) => {
    calls.push(["rename", a.id]);
    if (!a.stuck) a.attachmentFilename = `${baseName(items.get(a.parentID))}.pdf`;
  };
  const makeItem = (id, o = {}) => {
    const item = s.makeItem(id, o);
    Object.assign(item, {
      numAttachments: () => (item.best ? 1 : 0),
      getBestAttachment: async () => item.best || false,
      clone: () => ({ values: { ...item.fields }, getField(f) { return this.values[f] || ""; }, setField(f, v) { this.values[f] = v; } }),
    });
    return item;
  };
  const addFile = (parent, filename, o = {}) => {
    const file = { id: 100 + parent.id, key: `FILE${parent.id}`, libraryID: 1, parentID: parent.id, attachmentFilename: filename,
      allowed: true, title: "PDF", pdf: true, linked: false, path: "/f", library: { editable: true },
      isRegularItem: () => false, isLinkedFileAttachment() { return this.linked; }, isInTrash: () => false,
      getFilePathAsync: async function () { return this.path; }, getField(f) { return f === "title" ? this.title : ""; }, ...o };
    parent.best = file;
    items.set(file.id, file);
    return file;
  };
  const addOrphan = (id, o = {}) => {
    const file = { id, key: `ORPH${id}`, libraryID: 1, parentID: null, attachmentFilename: `scan-${id}.pdf`, pdf: true,
      library: { editable: true, libraryType: "user" }, isRegularItem: () => false, isInTrash: () => false, getField: () => `scan-${id}.pdf`, ...o };
    items.set(id, file);
    return file;
  };
  return { ...s, makeItem, addFile, addOrphan, selected, pane };
}
// The files that the user chose, with the names that the window showed.
const names = { 101: "Doe - Asthma in Africa.pdf", 102: "Doe - Right.pdf", 103: "Doe - Right.pdf", 105: "Doe - Right.pdf" };
const chosen = (...ids) => ids.map((id) => ({ id, to: names[id] }));
const accept = (o = {}) => ({ titles: [], files: [], lookups: [], ignored: [], createParent: null, ...o });

test("planLibrary gives the rows of titles, suggestions, files and files without a parent", async () => {
  const s = library();
  const a = s.makeItem(1, { title: "Asthma in africa." });
  const b = s.makeItem(2, { title: "A delphi study", abstractNote: "the Delphi method" });
  const c = s.makeItem(3, { title: "Right" });
  s.addFile(c, "other.pdf");
  s.addFile(a, "Doe - Asthma in africa..pdf");
  const orphan = s.addOrphan(50);
  const p = await planLibrary(s.Gam, [a, b, c], { orphans: [orphan] });
  assert.deepEqual(p.titles.map(({ shortFor, ...r }) => r), [{ id: 1, kind: "title", from: "Asthma in africa.", to: "Asthma in Africa", reasons: ["safe", "terms"] }]);
  assert.deepEqual(p.suggestions.map((r) => [r.id, r.to]), [[2, "A Delphi study"]]);
  assert.deepEqual(p.files.map(({ templateFor, ...r }) => r), [{ id: 103, parentID: 3, from: "other.pdf", to: "Doe - Right.pdf", title: "Right" }]);
  assert.deepEqual(p.orphans, [{ id: 50, name: "scan-50.pdf" }]);
  assert.deepEqual(p.errors, []);
});

test("planLibrary sorts the rows and reads the abstracts one time for each library", async () => {
  const s = library();
  const list = [s.makeItem(1, { title: "Zoo in africa" }), s.makeItem(2, { title: "asthma in africa" }), s.makeItem(3, { title: "Maps of europe" })];
  const p = await planLibrary(s.Gam, list, { orphans: [] });
  assert.deepEqual(p.titles.map((r) => r.id), [2, 3, 1]);
  assert.equal(s.queries.length, 1);
});

test("planLibrary leaves out items that gam cannot change", async () => {
  const s = library();
  const list = [["a", { editable: false }], ["b", { feed: true }], ["c", { trash: true }], ["d", { regular: false }]]
    .map(([, o], i) => s.makeItem(i + 1, { title: "Asthma in africa.", ...o }));
  const readOnly = s.addOrphan(50, { library: { editable: false } });
  const feed = s.addOrphan(51, { library: { editable: true, libraryType: "feed" } });
  const image = s.addOrphan(52, { pdf: false });
  const p = await planLibrary(s.Gam, list, { orphans: [readOnly, feed, image] });
  assert.deepEqual([p.titles, p.files, p.orphans], [[], [], []]);
});

test("planLibrary: no row for a file that Zotero does not rename, a linked file, or a file that is not on disk", async () => {
  const s = library();
  const list = [{ allowed: false }, { linked: true }, { path: false }, {}].map((o, i) => {
    const item = s.makeItem(i + 1, { title: "Right" });
    s.addFile(item, "other.pdf", o);
    return item;
  });
  const none = s.makeItem(9, { title: "Right" });
  const p = await planLibrary(s.Gam, [...list, none], { orphans: [] });
  assert.deepEqual(p.files.map((r) => r.id), [104]);
});

test("one file that fails does not stop the plan", async () => {
  const s = library();
  const a = s.makeItem(1, { title: "Right" });
  a.numAttachments = () => { throw new Error("broken"); };
  const b = s.makeItem(2, { title: "Asthma in africa" });
  const p = await planLibrary(s.Gam, [a, b], { orphans: [] });
  assert.equal(p.titles.length, 1);
  assert.deepEqual(s.errors, ["broken"]);
});

test("templateFor gives the name for an edited title, and does not change the item", async () => {
  const s = library();
  const a = s.makeItem(1, { title: "Asthma in africa" });
  s.addFile(a, "other.pdf", { title: "S" });
  const { files: [row] } = await planLibrary(s.Gam, [a], { orphans: [] });
  assert.equal(row.to, "Doe - Asthma in africa S.pdf");
  assert.equal(row.templateFor("Asthma in Africa"), "Doe - Asthma in Africa S.pdf");
  assert.equal(a.fields.title, "Asthma in africa");
  assert.equal(a.saves, 0);
});

test("planLibrary tells about a terms file and an ignore file that it cannot read", async () => {
  const s = library({ termsFile: "/no/such/terms.txt" });
  fs.writeFileSync(path.join(s.dir, "gam-ignored.json"), "{");
  const p = await planLibrary(s.Gam, [s.makeItem(1, { title: "Asthma in africa" })], { orphans: [] });
  assert.equal(p.titles.length, 1);
  assert.equal(p.errors.length, 2);
  assert.match(p.errors.join("\n"), /terms\.txt[\s\S]*gam-ignored\.json/);
});

test("cleanItems writes titles, then filenames, then starts the lookups", async () => {
  const s = library();
  const a = s.makeItem(1, { title: "Asthma in africa", shortTitle: "Asthma in africa" });
  const b = s.makeItem(2, { title: "A delphi study", abstractNote: "the Delphi method" });
  const f = s.addFile(a, "other.pdf");
  s.addOrphan(50, { found: true });
  s.addOrphan(51, { found: true });
  const r = await cleanItems(s.Gam, [a, b], { name: "L", orphans: [s.items.get(50), s.items.get(51)],
    confirm: async () => accept({ titles: [{ id: 1, to: "Asthma in Africa" }, { id: 2, to: "  A Delphi study of mine " }], files: chosen(101), lookups: [50, 51] }) });
  await r.lookupsDone;
  assert.deepEqual(s.calls, [["save", 1], ["save", 2], ["rename", 101], ["lookup", [50, 51]], ["dialog"]]);
  assert.equal(a.stored.title, "Asthma in Africa");
  assert.equal(a.stored.shortTitle, "Asthma in Africa");
  assert.equal(b.stored.title, "A Delphi study of mine");
  assert.equal(f.attachmentFilename, "Doe - Asthma in Africa.pdf");
  assert.deepEqual([r.titles, r.files, r.lookups, r.errors, r.cancelled], [2, 1, 2, [], false]);
  assert.deepEqual(s.log().map((e) => [e.key, e.field, e.old, e.new]).at(-1), ["FILE1", "filename", "other.pdf", "Doe - Asthma in Africa.pdf"]);
  assert.match(s.notices.at(-1), /2 titles and 1 filename changed\./);
});

test("cleanItems tells that many changes take time, before it writes", async () => {
  const s = library();
  const items = Array.from({ length: 11 }, (_, i) => s.makeItem(i + 1, { title: `Asthma in africa ${i}` }));
  const titles = items.map((x, i) => ({ id: x.id, to: `Asthma in Africa ${i}` }));
  const r = await cleanItems(s.Gam, items, { name: "L", orphans: [], confirm: async () => accept({ titles }) });
  assert.equal(r.titles, 11);
  assert.deepEqual(s.notices, ["gam makes 11 changes. This can take a minute.", "11 titles changed."]);
});

test("cleanItems gives no such notice for 10 changes", async () => {
  const s = library();
  const items = Array.from({ length: 10 }, (_, i) => s.makeItem(i + 1, { title: `Asthma in africa ${i}` }));
  const titles = items.map((x, i) => ({ id: x.id, to: `Asthma in Africa ${i}` }));
  await cleanItems(s.Gam, items, { name: "L", orphans: [], confirm: async () => accept({ titles }) });
  assert.deepEqual(s.notices, ["10 titles changed."]);
});

test("a title or a filename that changed after the list was made is left", async () => {
  const s = library();
  const a = s.makeItem(1, { title: "Asthma in africa" });
  const b = s.makeItem(2, { title: "Right" });
  const f = s.addFile(b, "other.pdf");
  const r = await cleanItems(s.Gam, [a, b], { name: "L", orphans: [], confirm: async () => {
    a.fields.title = "New";
    f.attachmentFilename = "mine.pdf";
    return accept({ titles: [{ id: 1, to: "Asthma in Africa" }], files: chosen(102) });
  } });
  assert.deepEqual(s.calls, []);
  assert.deepEqual(r.errors, [
    "\"Asthma in africa\" changed after the list was made. gam did not change it.",
    "\"other.pdf\" changed after the list was made. gam did not change it.",
  ]);
  assert.match(s.notices.at(-1), /Nothing changed\.[\s\S]*other\.pdf/);
});

test("an item or file that went to the trash after the list was made is left", async () => {
  const s = library();
  const a = s.makeItem(1, { title: "Asthma in africa" });
  const b = s.makeItem(2, { title: "Right" });
  const f = s.addFile(b, "other.pdf");
  const r = await cleanItems(s.Gam, [a, b], { name: "L", orphans: [], confirm: async () => {
    a.isInTrash = () => true;
    f.isInTrash = () => true;
    return accept({ titles: [{ id: 1, to: "Asthma in Africa" }], files: chosen(102) });
  } });
  assert.deepEqual(s.calls, []);
  assert.equal(r.errors.length, 2);
});

test("an empty or unchanged title writes nothing", async () => {
  const s = library();
  const a = s.makeItem(1, { title: "Asthma in africa" });
  await cleanItems(s.Gam, [a], { name: "L", orphans: [], confirm: async () => accept({ titles: [{ id: 1, to: "  " }, { id: 1, to: "Asthma in africa" }, { id: 99, to: "x" }] }) });
  assert.equal(a.saves, 0);
});

test("one failed write does not stop the others; a file that keeps its name is an error", async () => {
  const s = library();
  const a = s.makeItem(1, { title: "Asthma in africa" });
  a.saveTx = async () => { throw new Error("locked"); };
  const b = s.makeItem(2, { title: "Maps of europe" });
  s.addFile(a, "one.pdf", { stuck: true });
  s.addFile(b, "two.pdf");
  const c = s.makeItem(3, { title: "Right" });
  const gone = s.addFile(c, "three.pdf");
  const r = await cleanItems(s.Gam, [a, b, c], { name: "L", orphans: [], confirm: async () => {
    gone.path = false;
    return accept({ titles: [{ id: 1, to: "Asthma in Africa" }, { id: 2, to: "Maps of Europe" }], files: [{ id: 101, to: "Doe - Asthma in africa.pdf" }, { id: 102, to: "Doe - Maps of Europe.pdf" }, ...chosen(103)] });
  } });
  assert.deepEqual([r.titles, r.files], [1, 1]);
  assert.equal(r.errors.length, 3);
  assert.match(r.errors.join("\n"), /Asthma in africa.*locked[\s\S]*one\.pdf.*not renamed[\s\S]*three\.pdf.*not on this computer/);
  assert.deepEqual(s.log().map((e) => e.field), ["title", "filename"]);
});

test("Cancel changes nothing in the library, and keeps the ignored rows", async () => {
  const s = library();
  const a = s.makeItem(1, { title: "Asthma in africa" });
  const key = ignoreKey({ libraryID: 1, key: "KEY1", kind: "title", value: "Asthma in africa" });
  let shown = 0;
  const r = await cleanItems(s.Gam, [a], { name: "L", orphans: [], confirm: async (p) => {
    shown = p.titles.length;
    return { cancelled: true, ignored: [{ kind: "title", id: 1 }] };
  } });
  assert.equal(shown, 1);
  assert.equal(r.cancelled, true);
  assert.equal(a.saves, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(s.dir, "gam-ignored.json"), "utf8")).keys, [key]);
  assert.equal((await cleanItems(s.Gam, [a], { name: "L", orphans: [], confirm: async () => null })).cancelled, true);
  assert.equal(s.notices.at(-1), "Nothing to clean in L.");
});

test("an ignored filename does not come back; null cancels", async () => {
  const s = library();
  const a = s.makeItem(1, { title: "Right" });
  s.addFile(a, "other.pdf");
  await cleanItems(s.Gam, [a], { name: "L", orphans: [], confirm: async () => accept({ ignored: [{ kind: "file", id: 101 }] }) });
  assert.deepEqual((await planLibrary(s.Gam, [a], { orphans: [] })).files, []);
  const b = s.makeItem(2, { title: "Asthma in africa" });
  assert.equal((await cleanItems(s.Gam, [b], { name: "L", orphans: [], confirm: async () => null })).cancelled, true);
});

test("a damaged ignore file gives an error, and the titles are written", async () => {
  const s = library();
  fs.writeFileSync(path.join(s.dir, "gam-ignored.json"), "{");
  const a = s.makeItem(1, { title: "Asthma in africa" });
  const r = await cleanItems(s.Gam, [a], { name: "L", orphans: [], confirm: async () =>
    accept({ titles: [{ id: 1, to: "Asthma in Africa" }], ignored: [{ kind: "title", id: 1 }] }) });
  assert.equal(r.titles, 1);
  assert.match(r.errors[0], /gam-ignored\.json/);
  assert.equal(fs.readFileSync(path.join(s.dir, "gam-ignored.json"), "utf8"), "{");
});

test("a second window while one is open stops with a notice", async () => {
  const s = library();
  const a = s.makeItem(1, { title: "Asthma in africa" });
  let close;
  const first = cleanItems(s.Gam, [a], { name: "L", orphans: [], confirm: () => new Promise((r) => { close = r; }) });
  await new Promise((r) => setTimeout(r, 20));
  const second = await cleanItems(s.Gam, [a], { name: "L", orphans: [], confirm: async () => { throw new Error("opened"); } });
  assert.equal(second.cancelled, true);
  assert.match(s.notices[0], /already open/);
  close(null);
  await first;
  // And it opens again after an error.
  await assert.rejects(cleanItems(s.Gam, [a], { name: "L", orphans: [], confirm: async () => { throw new Error("x"); } }), /x/);
  assert.equal((await cleanItems(s.Gam, [a], { name: "L", orphans: [], confirm: async () => null })).cancelled, true);
});

test("new items get their fixes while the window is open", async () => {
  const s = library();
  const a = s.makeItem(1, { title: "Asthma in africa" });
  const b = s.makeItem(2, { title: "A title." });
  let close;
  const open = cleanItems(s.Gam, [a], { name: "L", orphans: [], confirm: () => new Promise((r) => { close = r; }) });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal((await autoTitles(s.Gam, [2])).fixed, 1);
  assert.equal(b.stored.title, "A title");
  close(null);
  await open;
});

test("Create parent applies nothing else", async () => {
  const s = library();
  const a = s.makeItem(1, { title: "Asthma in africa" });
  const o = s.addOrphan(50);
  const r = await cleanItems(s.Gam, [a], { name: "L", orphans: [o], confirm: async () =>
    accept({ titles: [{ id: 1, to: "Asthma in Africa" }], lookups: [50], createParent: 50 }) });
  assert.equal(a.saves, 0);
  assert.deepEqual(s.selected, [[50]]);
  assert.deepEqual(s.calls, [["createParent"]]);
  assert.equal(r.cancelled, false);
});

test("files that the lookup does not identify are selected, with a notice", async () => {
  const s = library();
  const list = [s.addOrphan(50, { found: true }), s.addOrphan(51), s.addOrphan(52)];
  const go = () => cleanItems(s.Gam, [], { name: "L", orphans: list, confirm: async () => accept({ lookups: [50, 51, 52] }) });
  await (await go()).lookupsDone;
  assert.deepEqual(s.selected, [[51, 52]]);
  assert.match(s.notices.at(-1), /2 files still have no parent item/);
  // In a reader tab, gam does not take the user away.
  s.Zotero.getMainWindow = () => ({ Zotero_Tabs: { selectedID: "tab-x" }, ZoteroPane: s.pane });
  list.shift();
  await (await go()).lookupsDone;
  assert.equal(s.selected.length, 1);
});

test("a lookup that does not end (no network) does not block the window", async () => {
  const s = library();
  const o = s.addOrphan(50);
  s.Zotero.RecognizeDocument.recognizeItems = () => new Promise(() => {});
  const r = await cleanItems(s.Gam, [], { name: "L", orphans: [o], confirm: async () => accept({ lookups: [50] }) });
  assert.equal(r.lookups, 1);
  assert.equal((await cleanItems(s.Gam, [], { name: "L", orphans: [o], confirm: async () => null })).cancelled, true);
});

test("a library with nothing to clean gives a notice, with the errors", async () => {
  const s = library({ termsFile: "/no/such/terms.txt" });
  const r = await cleanItems(s.Gam, [s.makeItem(1, { title: "Right" })], { name: "My Library", orphans: [], confirm: async () => { throw new Error("opened"); } });
  assert.equal(r.cancelled, true);
  assert.match(s.notices[0], /^Nothing to clean in My Library\.\n.*terms\.txt/);
});

test("the notice shows five problems at most; all are in the result", async () => {
  const s = library();
  const list = Array.from({ length: 8 }, (_, i) => s.makeItem(i + 1, { title: `Asthma ${i} in africa` }));
  const r = await cleanItems(s.Gam, list, { name: "L", orphans: [], confirm: async () => {
    for (const i of list) i.fields.title = "New";
    return accept({ titles: list.map((i) => ({ id: i.id, to: "X" })) });
  } });
  assert.equal(r.errors.length, 8);
  assert.equal(s.notices.at(-1).split("\n").length, 7);
  assert.match(s.notices.at(-1), /3 more problems\.$/);
});

test("planLibrary gives the short title that goes with a new title, or an empty text", async () => {
  const s = library();
  const a = s.makeItem(1, { title: "Asthma in africa: a study", shortTitle: "Asthma in africa" });
  const { titles: [row] } = await planLibrary(s.Gam, [a], { orphans: [] });
  assert.equal(row.shortFor(row.to), "Asthma in Africa");
  assert.equal(row.shortFor("Other words"), "");
});

test("an item without a title has no file row", async () => {
  const s = library();
  const a = s.makeItem(1, { title: "" });
  s.addFile(a, "good-name.pdf");
  assert.deepEqual((await planLibrary(s.Gam, [a], { orphans: [] })).files, []);
});

test("a file is not renamed to a name that was not shown", async () => {
  const s = library();
  const a = s.makeItem(1, { title: "Asthma in africa" });
  const f = s.addFile(a, "other.pdf");
  const r = await cleanItems(s.Gam, [a], { name: "L", orphans: [], confirm: async () => {
    a.fields.title = "New metadata";
    return accept({ titles: [{ id: 1, to: "Asthma in Africa" }], files: chosen(101) });
  } });
  assert.deepEqual(s.calls, []);
  assert.equal(f.attachmentFilename, "other.pdf");
  assert.match(r.errors[1], /"other\.pdf".*not the one that was shown/);
});

test("a failed save loads the item again", async () => {
  const s = setup();
  const item = s.makeItem(1, { title: "A title." });
  item.saveTx = async () => { throw new Error("locked"); };
  const reloads = [];
  item.reload = async (types, all) => { reloads.push([types, all]); throw new Error("reload"); };
  await assert.rejects(writeTitle(s.Gam, item, "A title.", "A title"), /locked/);
  assert.deepEqual(reloads, [[["itemData"], true]]);
  item.setField = () => { throw new Error("erased"); };
  await assert.rejects(writeTitle(s.Gam, item, "A title.", "B"), /erased/);
});

test("items that cannot be checked are counted in the window", async () => {
  const s = library();
  const a = s.makeItem(1, { title: "Right" });
  a.numAttachments = () => { throw new Error("broken"); };
  const p = await planLibrary(s.Gam, [a], { orphans: [] });
  assert.deepEqual(p.errors, ["gam could not check 1 item (see the Zotero error log)."]);
});

test("Create parent stops when the file is not the only selected one", async () => {
  const s = library();
  const o = s.addOrphan(50);
  s.pane.getSelectedItems = () => [o, { id: 51 }];
  await cleanItems(s.Gam, [], { name: "L", orphans: [o], confirm: async () => accept({ createParent: 50 }) });
  assert.deepEqual(s.calls, []);
  assert.match(s.notices.at(-1), /Create Parent Item/);
});
