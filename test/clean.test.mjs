import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { installFakeIO, tempVault } from "./helpers/fake-io.mjs";

installFakeIO();
const { autoTitles, writeTitle, libraryEvidence } = await import("../content/clean.mjs");
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
  assert.equal(item.stored.shortTitle, "A title");
  assert.equal(item.saves, 1);
  assert.deepEqual(s.log().map(({ date, ...e }) => e), [
    { libraryID: 1, key: "KEY1", field: "title", old: "A  title.", new: "A title" },
    { libraryID: 1, key: "KEY1", field: "shortTitle", old: "a title", new: "A title" },
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
