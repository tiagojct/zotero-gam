import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndex } from "../content/lib/index.mjs";
import { render } from "../content/ui/pane.mjs";

// A small DOM: only what pane.mjs uses.
class Node {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.textContent = "";
    this.attrs = {};
    this.dataset = {};
    this.listeners = {};
    this.isConnected = true;
    this.disabled = false;
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  append(...c) { this.children.push(...c); }
  replaceChildren(...c) { this.children = c; }
  addEventListener(t, fn) { this.listeners[t] = fn; }
  querySelector() { return null; }
  text() { return [this.textContent, ...this.children.map((c) => c.text())].join(" ").trim(); }
  find(pred) {
    if (pred(this)) return this;
    for (const c of this.children) {
      const r = c.find(pred);
      if (r) return r;
    }
    return null;
  }
}
const doc = { createElement: (t) => new Node(t) };

function setup() {
  let finish;
  const item = (id, title) => ({
    id, key: `KEY${id}`.padEnd(8, "0"), title, isRegularItem: () => true,
  });
  const Gam = {
    state: { index: buildIndex([], { literatureFolder: "lit" }), links: new Map(), error: null },
    prefs: { vaultName: () => "v" },
    itemInfo: (i) => ({ citekey: null, itemKey: i.key, doi: "" }),
    actions: { createNote: () => new Promise((r) => { finish = r; }) },
  };
  return { Gam, item, finish: () => finish() };
}

test("after Create note, the section is not drawn again for the item of the click when another item is shown", async () => {
  const s = setup();
  const body = new Node("div");
  const a = s.item(1, "A");
  const b = s.item(2, "B");
  render(s.Gam, { doc, body, item: a });
  const button = body.find((n) => n.tag === "button");
  const done = button.listeners.click({ target: button });
  assert.equal(button.disabled, true);
  // The user selects B while the note for A is made; Zotero draws B in the same body.
  s.Gam.state.index = buildIndex([{ path: "lit/x.md", text: "---\ntitle: Title of A\nzotero: zotero://select/library/items/KEY10000\n---\n" }], { literatureFolder: "lit" });
  render(s.Gam, { doc, body, item: b });
  s.finish();
  await done;
  assert.ok(!body.text().includes("Title of A"), body.text());
  assert.ok(body.text().includes("No literature note."));
});

test("after Create note, the section of the same item is drawn again", async () => {
  const s = setup();
  const body = new Node("div");
  const a = s.item(1, "A");
  render(s.Gam, { doc, body, item: a });
  const button = body.find((n) => n.tag === "button");
  const done = button.listeners.click({ target: button });
  s.Gam.state.index = buildIndex([{ path: "lit/x.md", text: "---\ntitle: Title of A\nzotero: zotero://select/library/items/KEY10000\n---\n" }], { literatureFolder: "lit" });
  s.finish();
  await done;
  assert.ok(body.text().includes("Title of A"), body.text());
});
