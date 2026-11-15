import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { confirmNotes } from "../content/ui/preview-dialog.mjs";

// A small DOM: only what preview.js uses.
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.listeners = {}; this.textContent = ""; this.checked = false; }
  setAttribute(k, v) { this.attrs[k] = v; }
  append(...c) { this.children.push(...c); }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  fire(t) { for (const fn of this.listeners[t] || []) fn(); }
  all(tag) { return this.children.flatMap((c) => [...(c.tag === tag ? [c] : []), ...c.all(tag)]); }
  text() { return [this.textContent, ...this.children.map((c) => c.text())].join(" "); }
}

function openDialog(io) {
  const accept = { label: "", disabled: false };
  const root = new El("vbox");
  const dialog = { getButton: (n) => (n === "accept" ? accept : null) };
  const docListeners = {};
  const winListeners = {};
  const document = {
    documentElement: new El("window"),
    createElementNS: (ns, tag) => new El(tag),
    getElementById: (id) => ({ "gam-preview-dialog": dialog, "gam-preview-root": root })[id],
    addEventListener: (t, fn) => { docListeners[t] = fn; },
  };
  const window = {
    arguments: [io],
    addEventListener: (t, fn) => { winListeners[t] = fn; },
    sizeToContent() {},
  };
  vm.runInNewContext(fs.readFileSync(new URL("../content/preview.js", import.meta.url), "utf8"), { window, document });
  winListeners.load();
  const list = root.children[0].children.find((c) => c.attrs.style?.includes("overflow-y"));
  const boxes = list.all("input");
  const allBox = root.all("input")[0];
  return { accept, root, list, boxes, allBox, document, accepted: () => docListeners.dialogaccept() };
}

const rows = [
  { id: 1, title: "First paper", relPath: "lit/a2020.md", newKey: true },
  { id: 2, title: "Second paper", relPath: "lit/b2021.md", newKey: false },
  { id: 3, title: "Third paper", relPath: "lit/c2022.md", newKey: false },
];
const makeIo = () => ({ title: "Create notes: C", intro: "3 notes will be written.", rows, skipped: ["2 already have a note"], selected: null });

test("the dialog lists each note with its path and title, and all are kept at first", () => {
  const d = openDialog(makeIo());
  assert.equal(d.document.documentElement.attrs.title, "Create notes: C");
  const text = d.root.text();
  assert.match(text, /lit\/a2020\.md  \(new citekey\)/);
  assert.match(text, /Second paper/);
  assert.match(text, /Left out: 2 already have a note\./);
  assert.equal(d.boxes.length, 3);
  assert.equal(d.accept.label, "Create 3 notes");
  assert.equal(d.accept.disabled, false);
});

test("accept gives the ids of the rows that stay checked; cancel leaves null", () => {
  const io = makeIo();
  const d = openDialog(io);
  d.boxes[1].checked = false;
  d.list.listeners.change[0]();
  assert.equal(d.accept.label, "Create 2 notes");
  assert.equal(d.allBox.checked, false);
  d.accepted();
  assert.deepEqual([...io.selected], [1, 3]);
  const cancelled = makeIo();
  openDialog(cancelled);
  assert.equal(cancelled.selected, null);
});

test("Select all clears and sets every row; with no row the Create button is off", () => {
  const d = openDialog(makeIo());
  d.allBox.checked = false;
  d.allBox.fire("change");
  assert.ok(d.boxes.every((b) => !b.checked));
  assert.equal(d.accept.disabled, true);
  d.allBox.checked = true;
  d.allBox.fire("change");
  assert.ok(d.boxes.every((b) => b.checked));
  assert.equal(d.accept.disabled, false);
});

test("confirmNotes opens a modal dialog on preview.xhtml and returns the selection", () => {
  let call = null;
  const Gam = {
    Zotero: {
      getMainWindow: () => ({
        openDialog: (url, name, flags, io) => { call = { url, name, flags, io }; io.selected = [2]; },
      }),
    },
  };
  const selected = confirmNotes(Gam, { name: "My papers", folder: "lit", rows, skipped: [] });
  assert.deepEqual(selected, [2]);
  assert.match(call.url, /content\/preview\.xhtml$/);
  assert.match(call.flags, /modal/);
  assert.equal(call.io.title, "Create notes: My papers");
  assert.match(call.io.intro, /3 notes will be written in lit\//);
  assert.deepEqual(call.io.rows.map((r) => r.id), [1, 2, 3]);
});
