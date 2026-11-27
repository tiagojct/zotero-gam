import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeIO } from "./helpers/fake-io.mjs";

installFakeIO();
const { registerMenus } = await import("../content/ui/menu.mjs");

function setup(citekey = "cai2026") {
  const menus = {};
  const copied = [];
  const Zotero = {
    MenuManager: {
      registerMenu: (def) => { menus[def.menuID] = def; return def.menuID; },
      unregisterMenu() {},
    },
    Utilities: { Internal: { copyTextToClipboard: (t) => copied.push(t) } },
  };
  const Gam = {
    Zotero, id: "gam@x", cleanups: [],
    state: { index: {}, links: new Map() },
    itemInfo: () => ({ citekey, itemKey: "K", doi: "" }),
  };
  registerMenus(Gam);
  const find = (menuID, l10nID) => menus[menuID].menus.find((m) => m.l10nID === l10nID);
  return { Gam, menus, find, copied };
}
const item = { isRegularItem: () => true };
const visible = (entry, ctx) => { let v = null; entry.onShowing({}, { ...ctx, setVisible: (x) => { v = x; } }); return v; };

test("the item menu copies [[citekey]] and [@citekey]", () => {
  const s = setup("cai2026");
  const ctx = { items: [item] };
  s.find("gam-item", "gam-menu-copy").onCommand({}, ctx);
  s.find("gam-item", "gam-menu-copy-pandoc").onCommand({}, ctx);
  assert.deepEqual(s.copied, ["[[cai2026]]", "[@cai2026]"]);
});

test("the Pandoc entry uses braces for a key with other characters, and hides for a key without a form", () => {
  const braced = setup("doe2020.");
  braced.find("gam-item", "gam-menu-copy-pandoc").onCommand({}, { items: [item] });
  assert.deepEqual(braced.copied, ["[@{doe2020.}]"]);
  const spaced = setup("a b");
  assert.equal(visible(spaced.find("gam-item", "gam-menu-copy-pandoc"), { items: [item] }), false);
  const none = setup("");
  assert.equal(visible(none.find("gam-item", "gam-menu-copy-pandoc"), { items: [item] }), false);
  const several = setup("cai2026");
  assert.equal(visible(several.find("gam-item", "gam-menu-copy-pandoc"), { items: [item, item] }), false);
});

test("the collection menu shows for a collection only, and only with a vault index", () => {
  const s = setup();
  const entry = s.find("gam-collection", "gam-menu-create-collection");
  assert.equal(s.menus["gam-collection"].target, "main/library/collection");
  const row = (isCollection) => ({ isCollection: () => isCollection, ref: { name: "C" } });
  assert.equal(visible(entry, { collectionTreeRow: row(true) }), true);
  assert.equal(visible(entry, { collectionTreeRow: row(false) }), false);
  const throwing = {};
  Object.defineProperty(throwing, "collectionTreeRow", { get() { throw new Error("no row"); } });
  assert.equal(visible(entry, throwing), false);
  s.Gam.state.index = null;
  assert.equal(visible(entry, { collectionTreeRow: row(true) }), false);
});

test("Assign citation keys shows only for selected items without a key that gam can change", () => {
  const withKey = setup("cai2026");
  const entry = withKey.find("gam-item", "gam-menu-keys");
  const editable = { isRegularItem: () => true, isEditable: () => true, library: { editable: true } };
  assert.equal(visible(entry, { items: [editable] }), false);
  const without = setup("");
  const e2 = without.find("gam-item", "gam-menu-keys");
  assert.equal(visible(e2, { items: [editable] }), true);
  assert.equal(visible(e2, { items: [{ ...editable, library: { editable: false } }] }), false);
  assert.equal(visible(e2, { items: [{ ...editable, isRegularItem: () => false }] }), false);
});

test("the Tools menu has Citation keys", () => {
  const s = setup();
  assert.ok(s.find("gam-tools", "gam-menu-keys-library"));
  assert.equal(s.menus["gam-tools"].target, "main/menubar/tools");
});

// --- Clean library

function cleanSetup({ type = "user", editable = true, selected = [1] } = {}) {
  const s = setup();
  const notices = [];
  const ran = [];
  const Z = s.Gam.Zotero;
  const lib = { name: "My Library", libraryType: type, editable };
  const paper = { id: 1, isRegularItem: () => true, isEditable: () => editable, library: lib };
  const orphan = { id: 2, isRegularItem: () => false, isEditable: () => editable, library: lib, pdf: true };
  const child = { id: 3, isRegularItem: () => false, isEditable: () => editable, library: lib, pdf: false };
  Object.assign(Z, {
    RecognizeDocument: { canRecognize: (i) => !!i.pdf },
    getActiveZoteroPane: () => ({ getSelectedLibraryIDs: () => selected }),
    Libraries: { userLibraryID: 1, get: () => lib },
    Items: { getAll: async () => [paper, orphan, child] },
    logError: (e) => { throw e; },
    ProgressWindow: class { changeHeadline() {} addDescription(t) { notices.push(t); } show() {} startCloseTimer() {} },
  });
  s.Gam.actions = { clean: async (items, opts) => ran.push([items.map((i) => i.id), opts.name, opts.orphans.map((i) => i.id)]) };
  return { ...s, notices, ran, paper, orphan, child };
}
const settle = () => new Promise((r) => setTimeout(r, 5));

test("Tools > Clean library cleans the selected library: its items and its files without a parent", async () => {
  const s = cleanSetup();
  s.find("gam-tools", "gam-menu-clean-library").onCommand();
  await settle();
  assert.deepEqual(s.ran, [[[1], "My Library", [2]]]);
});

test("Clean library refuses two libraries, a feed and a read-only library", async () => {
  for (const [o, re] of [[{ selected: [1, 2] }, /one library/], [{ type: "feed" }, /feed/], [{ editable: false }, /read-only/]]) {
    const s = cleanSetup(o);
    s.find("gam-tools", "gam-menu-clean-library").onCommand();
    await settle();
    assert.deepEqual(s.ran, []);
    assert.match(s.notices.join(" "), re);
  }
});

test("Citation keys refuses a feed and a read-only library", async () => {
  for (const [o, re] of [[{ type: "feed" }, /Citation keys does not work on a feed/], [{ editable: false }, /Citation keys does not work on a read-only library/]]) {
    const s = cleanSetup(o);
    let read = 0;
    s.Gam.Zotero.Items.getAll = async () => { read++; return [s.paper]; };
    s.find("gam-tools", "gam-menu-keys-library").onCommand();
    await settle();
    assert.equal(read, 0);
    assert.match(s.notices.join(" "), re);
  }
});

test("the item menu has Clean for items and files without a parent that gam can change", async () => {
  const s = cleanSetup();
  const entry = s.find("gam-item", "gam-menu-clean");
  assert.equal(visible(entry, { items: [s.paper] }), true);
  assert.equal(visible(entry, { items: [s.orphan] }), true);
  assert.equal(visible(entry, { items: [s.child] }), false);
  assert.equal(visible(entry, { items: [] }), false);
  assert.equal(visible(entry, { items: [cleanSetup({ editable: false }).paper] }), false);
  assert.equal(visible(entry, { items: [cleanSetup({ type: "feed" }).paper] }), false);
  entry.onCommand({}, { items: [s.paper, s.orphan, s.child] });
  entry.onCommand({}, { items: [s.paper] });
  await settle();
  assert.deepEqual(s.ran, [[[1], "selected items", [2]], [[1], "selected item", []]]);
});

test("Find PDF in OpenAlex shows for an item with a DOI and no PDF", () => {
  const s = setup();
  const files = new Map([[11, { attachmentContentType: "application/pdf", isInTrash: () => false }]]);
  Object.assign(s.Gam.Zotero, {
    Items: { get: (id) => files.get(id) },
    Utilities: { ...s.Gam.Zotero.Utilities, cleanDOI: (x) => (/10\.\d+\/\S+/.exec(x) || [null])[0] },
  });
  const ran = [];
  s.Gam.actions = { findPDFs: (items) => ran.push(items) };
  const entry = s.find("gam-item", "gam-menu-find-pdf");
  const doc = (doi, atts = []) => ({
    isRegularItem: () => true, library: { editable: true }, getField: (f) => (f === "DOI" ? doi : ""), getAttachments: () => atts,
  });
  assert.equal(visible(entry, { items: [doc("10.1/a")] }), true);
  assert.equal(visible(entry, { items: [doc("10.1/a", [11])] }), false);
  assert.equal(visible(entry, { items: [doc("")] }), false);
  assert.equal(visible(entry, { items: [{ ...doc("10.1/a"), library: { editable: false } }] }), false);
  const a = doc("10.1/a");
  entry.onCommand({}, { items: [a, doc("")] });
  assert.equal(ran.length, 1);
  assert.equal(ran[0].length, 2);
});
