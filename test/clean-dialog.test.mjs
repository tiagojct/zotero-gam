import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { confirmClean } from "../content/ui/clean-dialog.mjs";

// A small DOM: only what clean.js uses.
class El {
  constructor(tag) {
    Object.assign(this, { tag, children: [], attrs: {}, listeners: {}, textContent: "", checked: false, indeterminate: false,
      disabled: false, value: "", parent: null, focused: 0 });
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  get className() { return this.attrs.class || ""; }
  append(...c) { for (const x of c) { x.parent = this; this.children.push(x); } }
  remove() { this.parent.children = this.parent.children.filter((c) => c !== this); }
  focus() { this.focused += 1; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  fire(t, ev = {}) { for (const fn of this.listeners[t] || []) fn(ev); }
  all(fn) { return this.children.flatMap((c) => [...(fn(c) ? [c] : []), ...c.all(fn)]); }
  text() { return [this.textContent, ...this.children.map((c) => c.text())].filter(Boolean).join(" "); }
}
const tag = (t) => (e) => e.tag === t;
const cls = (c) => (e) => e.className.split(" ").includes(c);

const plan = () => ({
  titles: [
    { id: 1, kind: "title", from: "Asthma in africa.", to: "Asthma in Africa", reasons: ["safe", "terms"] },
    { id: 2, kind: "title", from: "Maps of europe", to: "Maps of Europe", reasons: ["terms"] },
  ],
  suggestions: [
    { id: 3, kind: "suggestion", from: "A delphi study", to: "A Delphi study", reasons: ["abstract"] },
    { id: 4, kind: "suggestion", from: "The handbook", to: "The Handbook", reasons: ["abstract"] },
  ],
  files: [{ id: 101, parentID: 1, from: "x.pdf", to: "Asthma in africa..pdf", title: "Asthma in africa.", templateFor: (t) => `${t}.pdf` },
    { id: 105, parentID: 5, from: "y.pdf", to: "Right.pdf", title: "Right", templateFor: (t) => `${t}.pdf` }],
  orphans: [{ id: 50, name: "scan.pdf" }],
  errors: ["Terms file: gam cannot read /x."],
});

function open(p = plan()) {
  const io = { name: "My Library", plan: p, result: null };
  const accept = { label: "", disabled: false };
  const root = new El("vbox");
  const dialog = { getButton: (n) => (n === "accept" ? accept : null) };
  const doc = {};
  const win = {};
  let closed = 0;
  const document = {
    documentElement: new El("window"),
    createElementNS: (ns, t) => new El(t),
    getElementById: (id) => ({ "gam-clean-dialog": dialog, "gam-clean-root": root })[id],
    addEventListener: (t, fn) => { doc[t] = fn; },
  };
  const window = { arguments: [io], addEventListener: (t, fn) => { win[t] = fn; }, sizeToContent() {}, close: () => { closed += 1; } };
  vm.runInNewContext(fs.readFileSync(new URL("../content/clean.js", import.meta.url), "utf8"), { window, document });
  win.load();
  const sections = () => root.all(cls("gam-section"));
  const section = (name) => sections().find((s) => s.attrs["aria-label"].startsWith(name));
  const rows = (name) => section(name).all(cls("gam-clean-row")).map((el) => ({
    el,
    check: el.all(tag("input"))[0],
    field: el.all(tag("textarea"))[0],
    buttons: el.all(tag("button")),
    tick(on) { this.check.checked = on; this.check.fire("change"); },
    type(text) { this.field.value = text; this.field.fire("input"); },
  }));
  const result = () => JSON.parse(io.result);
  return { io, root, accept, sections, section, rows, document, result, closed: () => closed,
    acceptDialog: () => { doc.dialogaccept(); return result(); } };
}
const ticked = (rows) => rows.map((r) => r.check.checked);

test("the window has a section for each kind of row, with its count", () => {
  const d = open();
  assert.equal(d.document.documentElement.attrs.title, "Clean library: My Library");
  assert.deepEqual(d.sections().map((s) => s.attrs["aria-label"]),
    ["Titles (2)", "Title suggestions from the abstract (2)", "Filenames (2)", "Files without a parent (1)"]);
  assert.match(d.root.text(), /Nothing in the library changes until you select Apply\./);
  assert.match(d.root.text(), /was: Asthma in africa\./);
  assert.match(d.root.text(), /Terms file: gam cannot read \/x\./);
});

test("a section without rows does not show", () => {
  const d = open({ ...plan(), titles: [], suggestions: [], orphans: [], errors: [] });
  assert.deepEqual(d.sections().map((s) => s.attrs["aria-label"]), ["Filenames (2)"]);
});

test("titles and lookups start ticked; suggestions and filenames do not", () => {
  const d = open();
  assert.deepEqual(ticked(d.rows("Titles")), [true, true]);
  assert.deepEqual(ticked(d.rows("Title suggestions")), [false, false]);
  assert.deepEqual(ticked(d.rows("Filenames")), [false, false]);
  assert.deepEqual(ticked(d.rows("Files without")), [true]);
  assert.equal(d.accept.label, "Apply 3 changes");
});

test("Apply gives the choices", () => {
  const d = open();
  d.rows("Title suggestions")[0].tick(true);
  d.rows("Filenames")[1].tick(true);
  d.rows("Titles")[1].tick(false);
  assert.equal(d.accept.label, "Apply 4 changes");
  assert.deepEqual(d.acceptDialog(), {
    titles: [{ id: 1, to: "Asthma in Africa" }, { id: 3, to: "A Delphi study" }], files: [105], lookups: [50], ignored: [], createParent: null,
  });
});

test("the button is off with nothing ticked, and says 1 change", () => {
  const d = open();
  for (const n of ["Titles", "Files without"]) d.rows(n).forEach((r) => r.tick(false));
  assert.equal(d.accept.disabled, true);
  assert.equal(d.accept.label, "Apply 0 changes");
  d.rows("Titles")[0].tick(true);
  assert.equal(d.accept.label, "Apply 1 change");
  assert.equal(d.accept.disabled, false);
});

test("an edited title ticks its row, and Apply gives the text with clean spaces", () => {
  const d = open();
  const row = d.rows("Title suggestions")[1];
  row.type("  The handbook\n of ethics ");
  assert.equal(row.check.checked, true);
  assert.deepEqual(d.acceptDialog().titles.at(-1), { id: 4, to: "The handbook of ethics" });
});

test("an empty or unchanged title clears its row, and the row cannot be ticked", () => {
  const d = open();
  const [a, b] = d.rows("Titles");
  a.type("   ");
  b.type("Maps of europe");
  assert.deepEqual(ticked([a, b]), [false, false]);
  a.tick(true);
  assert.equal(a.check.checked, false);
  assert.deepEqual(d.acceptDialog().titles, []);
  a.type("Asthma");
  assert.equal(a.check.checked, true);
});

test("a filename follows the title that Apply will write", () => {
  const d = open();
  const name = () => d.rows("Filenames")[0].el.text();
  assert.match(name(), /Asthma in Africa\.pdf/);
  const t = d.rows("Titles")[0];
  t.type("Asthma today");
  assert.match(name(), /Asthma today\.pdf/);
  t.tick(false);
  assert.match(name(), /Asthma in africa\.\.pdf/);
  t.tick(true);
  assert.match(name(), /Asthma today\.pdf/);
  t.buttons[0].fire("click");
  assert.match(name(), /Asthma in africa\.\.pdf/);
});

test("a filename that stays the same for the new title cannot be ticked", () => {
  const d = open();
  const f = d.rows("Filenames")[0];
  f.tick(true);
  d.rows("Titles")[0].type("x");
  assert.equal(f.check.checked, false);
  assert.equal(f.check.disabled, true);
  d.rows("Titles")[0].type("xy");
  assert.equal(f.check.disabled, false);
});

test("a template that fails keeps the name of the plan", () => {
  const p = plan();
  p.files[0].templateFor = () => { throw new Error("x"); };
  assert.match(open(p).rows("Filenames")[0].el.text(), /Asthma in africa\.\.pdf/);
});

test("Select all is for its section, and shows a mixed state", () => {
  const d = open();
  const all = (n) => d.section(n).all(cls("gam-all"))[0].all(tag("input"))[0];
  assert.equal(all("Titles").checked, true);
  d.rows("Titles")[0].tick(false);
  assert.deepEqual([all("Titles").checked, all("Titles").indeterminate], [false, true]);
  all("Filenames").checked = true;
  all("Filenames").fire("change");
  assert.deepEqual(ticked(d.rows("Filenames")), [true, true]);
  assert.deepEqual(ticked(d.rows("Title suggestions")), [false, false]);
  d.rows("Titles")[0].type("");
  all("Titles").checked = true;
  all("Titles").fire("change");
  assert.deepEqual(ticked(d.rows("Titles")), [false, true]);
});

test("Ignore removes the row and its count, and comes back on Apply and on Cancel", () => {
  const d = open();
  const [a, b] = d.rows("Titles");
  a.buttons[0].fire("click");
  assert.equal(d.section("Titles").attrs["aria-label"], "Titles (1)");
  assert.equal(d.rows("Titles").length, 1);
  assert.equal(b.buttons[0].focused, 1, "the focus goes to the next row");
  assert.equal(d.accept.label, "Apply 2 changes");
  assert.deepEqual(d.result(), { cancelled: true, ignored: [{ kind: "title", id: 1 }] });
  d.rows("Filenames")[1].buttons[0].fire("click");
  const r = d.acceptDialog();
  assert.deepEqual(r.ignored, [{ kind: "title", id: 1 }, { kind: "file", id: 105 }]);
  assert.deepEqual(r.titles, [{ id: 2, to: "Maps of Europe" }]);
  d.rows("Titles")[0].buttons[0].fire("click");
  assert.equal(d.sections().some((s) => s.attrs["aria-label"].startsWith("Titles")), false, "an empty section goes");
});

test("Cancel without Ignore gives no result", () => {
  assert.equal(open().io.result, null);
});

test("Ignore all that are not ticked is for suggestions only", () => {
  const d = open();
  const bulk = (n) => d.section(n).all((e) => e.tag === "button" && /not ticked/.test(e.textContent));
  for (const n of ["Titles", "Filenames", "Files without"]) assert.equal(bulk(n).length, 0);
  d.rows("Title suggestions")[0].tick(true);
  bulk("Title suggestions")[0].fire("click");
  assert.deepEqual(d.rows("Title suggestions").map((r) => r.field.value), ["A Delphi study"]);
  assert.deepEqual(d.result().ignored, [{ kind: "suggestion", id: 4 }]);
});

test("Create parent closes the window with that file, and the ignored rows", () => {
  const d = open();
  d.rows("Titles")[0].buttons[0].fire("click");
  d.rows("Files without")[0].buttons[0].fire("click");
  assert.equal(d.closed(), 1);
  assert.deepEqual(d.result(), { titles: [], files: [], lookups: [], ignored: [{ kind: "title", id: 1 }], createParent: 50 });
});

test("Enter in a title does not accept the window", () => {
  const d = open();
  let stopped = 0;
  const ev = (key) => ({ key, preventDefault: () => { stopped += 1; } });
  d.rows("Titles")[0].field.fire("keydown", ev("Enter"));
  d.rows("Titles")[0].field.fire("keydown", ev("a"));
  assert.equal(stopped, 1);
});

test("each control has an accessible name with the title or filename", () => {
  const d = open();
  const named = (e, re) => assert.match(e.attrs["aria-label"] || "", re);
  const t = d.rows("Titles")[0];
  for (const e of [t.check, t.field, t.buttons[0]]) named(e, /Asthma in africa\./);
  const f = d.rows("Filenames")[0];
  for (const e of [f.check, f.buttons[0]]) named(e, /x\.pdf/);
  const o = d.rows("Files without")[0];
  for (const e of [o.check, o.buttons[0]]) named(e, /scan\.pdf/);
  for (const s of d.sections()) named(s.all(cls("gam-all"))[0].all(tag("input"))[0], /Select all: /);
});

test("confirmClean opens the window and gives its choices", () => {
  let call = null;
  const Gam = { Zotero: { getMainWindow: () => ({ openDialog: (url, name, flags, io) => {
    call = { url, flags, io };
    io.result = JSON.stringify({ titles: [], files: [1], lookups: [], ignored: [], createParent: null });
  } }) } };
  assert.deepEqual(confirmClean(Gam, plan(), "L").files, [1]);
  assert.match(call.url, /content\/clean\.xhtml$/);
  assert.match(call.flags, /modal/);
  assert.equal(call.io.name, "L");
  Gam.Zotero.getMainWindow = () => ({ openDialog() {} });
  assert.equal(confirmClean(Gam, plan(), "L"), null);
});
