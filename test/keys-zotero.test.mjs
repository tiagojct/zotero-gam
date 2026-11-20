import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndex } from "../content/lib/index.mjs";
import { currentKey } from "../content/lib/citekey.mjs";

const { autoKeys, assignKeys, checkKeyChanges, readAllKeys, takenKeys, readyForKey } = await import("../content/keys.mjs");

function setup({ autoKey = true, libraryKeys = [], vaultFiles = [], keys = new Map() } = {}) {
  const notices = [];
  const items = new Map();
  const Zotero = {
    DB: {
      // The keys in the library now: the given ones and those of the fake items.
      columnQueryAsync: async (sql, params) => (params[0] === "citationKey"
        ? [...libraryKeys, ...[...items.values()].map((i) => i.stored.citationKey).filter(Boolean)] : []),
      queryAsync: async () => [],
    },
    ItemFields: { getID: () => 9, isValidForType: () => true },
    Items: { get: (ids) => ids.map((id) => items.get(id)) },
    ProgressWindow: class {
      changeHeadline() {}
      addDescription(t) { notices.push(t); }
      show() {}
      startCloseTimer() {}
    },
    logError() {},
  };
  const makeItem = (id, { lastName = "Smith", date = "2020", citationKey = "", extra = "", editable = true, regular = true, feed = false, title = `Item ${id}` } = {}) => {
    const item = {
      // fields: the values in the item object; stored: the values in the database (after saveTx).
      id, itemTypeID: 1, fields: { citationKey, extra, title }, stored: { citationKey, extra, title }, saves: 0,
      library: { editable, libraryType: feed ? "feed" : "user" },
      isEditable: () => editable, isRegularItem: () => regular, isInTrash: () => false,
      toJSON: () => ({ title, creators: [{ creatorType: "author", lastName }], date }),
      getField(f) { return this.fields[f] || ""; },
      setField(f, v) { this.fields[f] = v; },
      async saveTx() {
        this.saves += 1;
        this.stored = { ...this.fields };
      },
    };
    items.set(id, item);
    return item;
  };
  const Gam = {
    Zotero,
    state: { index: buildIndex(vaultFiles, { literatureFolder: "lit" }), keys },
    prefs: { autoKey: () => autoKey },
    itemInfo: (i) => ({ citekey: currentKey({ citationKey: i.fields.citationKey, extra: i.fields.extra }), itemKey: "K", doi: "" }),
  };
  return { Gam, Zotero, makeItem, notices, items };
}

test("autoKeys does nothing when the setting is off", async () => {
  const s = setup({ autoKey: false });
  const item = s.makeItem(1);
  assert.deepEqual(await autoKeys(s.Gam, [1]), []);
  assert.equal(item.saves, 0);
});

test("autoKeys gives free keys to new items, past library and vault keys", async () => {
  const s = setup({ libraryKeys: ["smith2020"], vaultFiles: [{ path: "lit/smith2020a.md", text: "" }] });
  const a = s.makeItem(1);
  const b = s.makeItem(2);
  assert.deepEqual(await autoKeys(s.Gam, [1, 2]), ["smith2020b", "smith2020c"]);
  assert.equal(a.fields.citationKey, "smith2020b");
  assert.equal(b.fields.citationKey, "smith2020c");
  assert.equal(s.Gam.state.keys.get(1), "smith2020b");
  assert.match(s.notices.at(-1), /smith2020b, smith2020c/);
});

test("autoKeys leaves out items with a key, read-only items, feed items and notes", async () => {
  const s = setup();
  const keyed = s.makeItem(1, { citationKey: "lee2020" });
  const readOnly = s.makeItem(2, { editable: false });
  const feed = s.makeItem(3, { feed: true });
  const note = s.makeItem(4, { regular: false });
  assert.deepEqual(await autoKeys(s.Gam, [1, 2, 3, 4, 99]), []);
  for (const i of [keyed, readOnly, feed, note]) assert.equal(i.saves, 0);
  assert.equal(keyed.fields.citationKey, "lee2020");
});

test("autoKeys writes nothing for more than 20 new items, and says what to do", async () => {
  const s = setup();
  const ids = Array.from({ length: 21 }, (_, i) => s.makeItem(i + 1).id);
  assert.deepEqual(await autoKeys(s.Gam, ids), []);
  assert.ok([...s.items.values()].every((i) => i.saves === 0));
  assert.match(s.notices[0], /21 new items have no citation key.*Tools > Citation keys/s);
});

test("autoKeys does not change a key that an item got while gam was planning", async () => {
  const s = setup();
  const item = s.makeItem(1);
  s.Zotero.DB.columnQueryAsync = async (sql, params) => {
    if (params[0] === "citationKey") item.fields.citationKey = "other2020";
    return [];
  };
  assert.deepEqual(await autoKeys(s.Gam, [1]), []);
  assert.equal(item.fields.citationKey, "other2020");
  assert.equal(item.saves, 0);
});

test("assignKeys shows the plan and the problems, and writes only the rows that stay checked", async () => {
  const s = setup();
  const items = [
    s.makeItem(1, { lastName: "Kim" }),
    s.makeItem(2, { lastName: "Park" }),
    s.makeItem(3, { citationKey: "dup2020", title: "A" }),
    s.makeItem(4, { citationKey: "dup2020", title: "B" }),
  ];
  let preview = null;
  const r = await assignKeys(s.Gam, items, { name: "My Library", confirm: async (p) => { preview = p; return [2]; } });
  assert.deepEqual(preview.rows.map((x) => [x.id, x.citekey]), [[1, "kim2020"], [2, "park2020"]]);
  assert.deepEqual(preview.problems, ["dup2020 is the key of 2 items: A; B"]);
  assert.deepEqual(preview.skipped, ["2 already have a citekey"]);
  assert.equal(r.assigned, 1);
  assert.equal(items[0].saves, 0);
  assert.equal(items[1].fields.citationKey, "park2020");
  assert.equal(items[2].fields.citationKey, "dup2020");
});

test("assignKeys: cancel writes nothing", async () => {
  const s = setup();
  const item = s.makeItem(1);
  const r = await assignKeys(s.Gam, [item], { confirm: async () => null });
  assert.equal(r.cancelled, true);
  assert.equal(item.saves, 0);
});

test("assignKeys: nothing to do and no problem gives a notice and no dialog", async () => {
  const s = setup();
  const item = s.makeItem(1, { citationKey: "a2020" });
  let asked = false;
  await assignKeys(s.Gam, [item], { confirm: async () => { asked = true; return []; } });
  assert.equal(asked, false);
  assert.match(s.notices[0], /The item has a citation key\. No problems found\./);
});

test("assignKeys checks again before each write: a key taken after the preview is not used", async () => {
  const s = setup();
  const item = s.makeItem(1);
  let calls = 0;
  s.Zotero.DB.columnQueryAsync = async (sql, params) => {
    if (params[0] !== "citationKey") return [];
    calls += 1;
    return calls === 1 ? [] : ["smith2020"];
  };
  const r = await assignKeys(s.Gam, [item], { confirm: async () => [1] });
  assert.equal(r.assigned, 0);
  assert.match(r.errors[0], /smith2020 is used now, after the preview/);
  assert.equal(item.saves, 0);
});

test("checkKeyChanges warns when a key that the vault uses changes, and keeps the map current", async () => {
  const vaultFiles = [
    { path: "lit/smith2020.md", text: "---\ncitekey: smith2020\n---\n" },
    { path: "essay.md", text: "As [@smith2020] says." },
  ];
  const s = setup({ vaultFiles, keys: new Map([[1, "smith2020"], [2, "lee2020"]]) });
  s.makeItem(1, { citationKey: "smith2020x", title: "Cited paper" });
  s.makeItem(2, { citationKey: "lee2021" });
  s.makeItem(3, { citationKey: "new2020" });
  const used = checkKeyChanges(s.Gam, [1, 2, 3]);
  assert.deepEqual(used.map((u) => [u.id, u.from, u.to, u.note?.path, u.cites]), [[1, "smith2020", "smith2020x", "lit/smith2020.md", 1]]);
  assert.equal(s.notices.length, 1);
  assert.match(s.notices[0], /"Cited paper" changed from smith2020 to smith2020x\. The vault uses smith2020: the literature note lit\/smith2020\.md and 1 note that cites it\./);
  assert.deepEqual([...s.Gam.state.keys], [[1, "smith2020x"], [2, "lee2021"], [3, "new2020"]]);
  assert.deepEqual(checkKeyChanges(s.Gam, [1, 2, 3]), []);
});

test("checkKeyChanges: a removed key that the vault cites is reported; without an index every change is", async () => {
  const s = setup({ vaultFiles: [{ path: "x.md", text: "[[smith2020]]" }], keys: new Map([[1, "smith2020"]]) });
  s.makeItem(1);
  assert.match(checkKeyChanges(s.Gam, [1]).length && s.notices[0], /smith2020 was removed/);
  const t = setup({ keys: new Map([[1, "a2020"]]) });
  t.Gam.state.index = null;
  t.makeItem(1, { citationKey: "b2020" });
  checkKeyChanges(t.Gam, [1]);
  assert.match(t.notices[0], /gam cannot check the vault now/);
});

test("readAllKeys folds the field and Extra rows into one key per item", async () => {
  const s = setup();
  s.Zotero.DB.queryAsync = async () => [
    { itemID: 1, fieldName: "citationKey", value: "a2020" },
    { itemID: 1, fieldName: "extra", value: "Citation Key: other" },
    { itemID: 2, fieldName: "extra", value: "PMID: 1\nCitation Key: b2020" },
    { itemID: 3, fieldName: "extra", value: "PMID: 2" },
  ];
  assert.deepEqual([...(await readAllKeys(s.Zotero))], [[1, "a2020"], [2, "b2020"]]);
});

test("takenKeys has the library keys and the literature notes", async () => {
  const s = setup({ libraryKeys: ["a2020"], vaultFiles: [{ path: "lit/b2020.md", text: "" }, { path: "lit/Lee2019.md", text: "" }] });
  assert.deepEqual([...(await takenKeys(s.Gam))].sort(), ["Lee2019", "a2020", "b2020", "lee2019"]);
});

test("autoKeys leaves out an item without a year, or without a creator and a title (New Item)", async () => {
  const s = setup();
  const empty = s.makeItem(1, { lastName: "", date: "", title: "" });
  empty.toJSON = () => ({ title: "", creators: [], date: "" });
  const noYear = s.makeItem(2, { date: "" });
  const titleOnly = s.makeItem(3, { title: "The Economist" });
  titleOnly.toJSON = () => ({ title: "The Economist", creators: [], date: "1999" });
  assert.deepEqual(await autoKeys(s.Gam, [1, 2, 3]), ["economist1999"]);
  assert.equal(empty.saves + noYear.saves, 0);
  assert.equal(readyForKey({ title: "", creators: [], date: "" }), false);
  assert.equal(readyForKey({ title: "T", creators: [], date: "2020" }), true);
});

test("an automatic key that starts during Citation keys waits for it, so no key is given twice", async () => {
  const s = setup();
  const planned = s.makeItem(1);
  const fresh = s.makeItem(2);
  // The new item arrives while the assign loop writes.
  let auto = null;
  const save = planned.saveTx.bind(planned);
  planned.saveTx = async () => {
    auto = autoKeys(s.Gam, [2]);
    await new Promise((r) => setTimeout(r, 5));
    return save();
  };
  // The preview runs before item 2 gets a key; then 2 must not take smith2020.
  const r = await assignKeys(s.Gam, [planned], { confirm: async () => [1] });
  const given = await auto;
  assert.equal(r.assigned, 1);
  assert.equal(planned.fields.citationKey, "smith2020");
  assert.deepEqual(given, ["smith2020a"]);
  assert.equal(fresh.fields.citationKey, "smith2020a");
});

test("takenKeys has the file name of a note whose citekey is another one", async () => {
  const s = setup({ vaultFiles: [{ path: "lit/smith2020.md", text: "---\ncitekey: smith2020b\n---\n" }] });
  const taken = await takenKeys(s.Gam);
  assert.ok(taken.has("smith2020") && taken.has("smith2020b"));
});
