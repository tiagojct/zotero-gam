import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../content/preferences.js", import.meta.url), "utf8");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function element(id) {
  const listeners = {};
  return {
    id, value: "", dataset: {}, textContent: "", attrs: {},
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    fire(type) { for (const fn of listeners[type] || []) fn({ type, target: this }); },
    removeAttribute(name) { delete this.attrs[name]; },
  };
}

function load({ stored = "" } = {}) {
  const saved = [];
  let key = stored;
  const field = element("gam-pref-openalex-key");
  const status = element("gam-pref-openalex-key-status");
  const root = element("gam-prefs");
  const docListeners = {};
  const winListeners = {};
  const document = {
    addEventListener: (type, fn) => { (docListeners[type] ||= []).push(fn); },
    getElementById: (id) => ({ [field.id]: field, [status.id]: status, [root.id]: root })[id] || null,
    l10n: { setAttributes: (el, id) => { el.attrs["data-l10n-id"] = id; } },
  };
  const window = { addEventListener: (type, fn) => { (winListeners[type] ||= []).push(fn); } };
  const context = vm.createContext({
    document, window, URL, setTimeout, clearTimeout, Ci: { nsILoginInfo: {} }, Services: {},
    Zotero: { logError() {} },
    Components: { stack: { filename: "chrome://zotero/x.js -> chrome://gam-0-7-0/content/preferences.js" }, Constructor: () => function () {} },
    ChromeUtils: {
      importESModule: () => ({
        getKey: async () => key,
        setKey: async (env, value) => {
          await wait(5);
          saved.push(value);
          key = String(value).trim();
          return key ? "saved" : "removed";
        },
      }),
    },
  });
  vm.runInContext(source, context);
  const fireLoad = async () => {
    for (const fn of docListeners.load || []) fn({ target: root });
    await wait(10);
  };
  const fireWindow = (type) => { for (const fn of winListeners[type] || []) fn({ type }); };
  return { field, status, saved, fireLoad, fireWindow };
}

test("the field shows the stored key when the pane loads", async () => {
  const s = load({ stored: "abc" });
  await s.fireLoad();
  assert.equal(s.field.value, "abc");
});

test("a typed or pasted key is saved without a change event", async () => {
  const s = load();
  await s.fireLoad();
  s.field.value = "pasted-key";
  s.field.fire("input");
  await wait(1200);
  assert.deepEqual(s.saved, ["pasted-key"]);
  assert.equal(s.status.attrs["data-l10n-id"], "gam-pref-openalex-key-saved");
});

test("closing the pane saves a key that was not saved yet", async () => {
  const s = load();
  await s.fireLoad();
  s.field.value = "fast";
  s.field.fire("input");
  s.fireWindow("pagehide");
  await wait(50);
  assert.deepEqual(s.saved, ["fast"]);
  await wait(1200);
  assert.deepEqual(s.saved, ["fast"]);
});

test("saves run one after the other, and the same value is not saved twice", async () => {
  const s = load();
  await s.fireLoad();
  s.field.value = "one";
  s.field.fire("change");
  s.field.value = "two";
  s.field.fire("change");
  s.field.fire("change");
  await wait(100);
  assert.deepEqual(s.saved, ["one", "two"]);
});
