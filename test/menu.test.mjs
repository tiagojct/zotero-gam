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
