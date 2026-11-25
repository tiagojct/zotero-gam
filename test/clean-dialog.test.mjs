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
  replaceChildren(...c) { this.children = []; this.append(...c); }
  append(...c) { for (const x of c) { x.parent = this; this.children.push(x); } }
  remove() { this.parent.children = this.parent.children.filter((c) => c !== this); }
  focus() { this.focused += 1; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  fire(t, ev = {}) { for (const fn of this.listeners[t] || []) fn(ev); }
  all(fn) { return this.children.flatMap((c) => [...(fn(c) ? [c] : []), ...c.all(fn)]); }
  text() { return [this.textContent, ...this.children.map((c) => c.text())].filter(Boolean).join(" ").replace(/\s+/g, " "); }
}
const tag = (t) => (e) => e.tag === t;
const cls = (c) => (e) => e.className.split(" ").includes(c);

const plan = () => ({
  titles: [
    { id: 1, kind: "title", from: "Asthma in africa.", to: "Asthma in Africa", reasons: ["safe", "terms"], shortFor: (t) => (t.startsWith("Asthma in Africa") ? "Asthma" : "") },
    { id: 2, kind: "title", from: "Maps of europe", to: "Maps of Europe", reasons: ["terms"] },
  ],
  suggestions: [
    { id: 3, kind: "suggestion", from: "A delphi study", to: "A Delphi study", reasons: ["suggestion"] },
    { id: 4, kind: "suggestion", from: "The handbook", to: "The Handbook", reasons: ["suggestion"] },
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
  const window = { innerWidth: 950, arguments: [io], addEventListener: (t, fn) => { win[t] = fn; }, sizeToContent() {}, close: () => { closed += 1; } };
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
  return { io, root, accept, resize: (width = window.innerWidth - 1) => { window.innerWidth = width; win.resize(); }, sections, section, rows, document, result, closed: () => closed,
    acceptDialog: () => { doc.dialogaccept(); return result(); } };
}
const ticked = (rows) => rows.map((r) => r.check.checked);

test("the window has a section for each kind of row, with its count", () => {
  const d = open();
  assert.equal(d.document.documentElement.attrs.title, "Clean library: My Library");
  assert.deepEqual(d.sections().map((s) => s.attrs["aria-label"]),
    ["Titles (2)", "Title suggestions (2)", "Filenames (2)", "Files without a parent (1)"]);
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
    titles: [{ id: 1, to: "Asthma in Africa" }, { id: 3, to: "A Delphi study" }], files: [{ id: 105, to: "Right.pdf" }], lookups: [50], ignored: [], createParent: null,
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

const marked = (row) => row.el.all(cls("gam-diff")).map((e) => e.textContent);

test("the words of the old title that change are marked, also after an edit", () => {
  const p = plan();
  p.titles = [
    { id: 1, kind: "title", from: "The asthma in africa and in europe.", to: "The asthma in Africa and in Europe", reasons: ["safe", "terms"] },
    { id: 2, kind: "title", from: "A  title here", to: "A title here", reasons: ["safe"] },
    { id: 3, kind: "title", from: "<p>One two</p> three", to: "One two three", reasons: ["safe"] },
  ];
  const d = open(p);
  const [a, b, c] = d.rows("Titles");
  assert.deepEqual(marked(a), ["africa", "europe."]);
  assert.deepEqual(marked(b), []);
  assert.deepEqual(marked(c), ["<p>One", "two</p>"]);
  assert.match(a.el.text(), /was: The asthma in africa and in europe\./);
  a.type("The asthma in africa and in Europe");
  assert.deepEqual(marked(a), ["europe."]);
  a.type("");
  assert.deepEqual(marked(a), []);
});

test("the old title is there in full, whatever is marked", () => {
  const p = plan();
  p.titles = [{ id: 1, kind: "title", from: "a b a  c b a", to: "a c a B", reasons: ["terms"] }];
  const row = open(p).rows("Titles")[0];
  const was = row.el.all(cls("gam-was"))[0];
  const flat = (e) => e.textContent + e.children.map(flat).join("");
  assert.equal(flat(was), "was: a b a  c b a");
});

test("a title field has as many lines as its text", () => {
  const d = open();
  const f = d.rows("Titles")[0].field;
  // A field of 20 px for each row, and a text of 3 lines.
  Object.defineProperty(f, "clientHeight", { get: () => f.rows * 20 });
  Object.defineProperty(f, "scrollHeight", { get: () => Math.max(60, f.rows * 20) });
  d.rows("Titles")[0].type("A long title");
  assert.equal(f.rows, 3);
  Object.defineProperty(d.rows("Titles")[1].field, "clientHeight", { get: () => 20 });
  Object.defineProperty(d.rows("Titles")[1].field, "scrollHeight", { get: () => 999 });
  d.rows("Titles")[1].type("It never fits");
  assert.ok(d.rows("Titles")[1].field.rows <= 12);
  assert.equal(d.rows("Title suggestions")[0].field.rows, 1);
});

test("the fields are measured again when the window has another size", () => {
  const d = open();
  const f = d.rows("Titles")[0].field;
  Object.defineProperty(f, "clientHeight", { get: () => f.rows * 20 });
  Object.defineProperty(f, "scrollHeight", { get: () => 40 });
  d.resize(950);
  assert.equal(f.rows, 1, "the height alone does not change the lines");
  d.resize();
  assert.equal(f.rows, 2);
});

test("the fields are measured together: the number of layouts does not grow with the rows", () => {
  const p = plan();
  p.titles = Array.from({ length: 300 }, (_, i) => ({ id: i, kind: "title", from: `old ${i}`, to: `new ${i}`, reasons: ["terms"] }));
  const d = open(p);
  // A layout: a read of a size after a write of rows.
  let dirty = false;
  let layouts = 0;
  for (const { field } of d.rows("Titles")) {
    let rows = 1;
    const read = (v) => { if (dirty) { dirty = false; layouts += 1; } return v; };
    Object.defineProperty(field, "rows", { get: () => rows, set: (v) => { if (v !== rows) dirty = true; rows = v; } });
    Object.defineProperty(field, "clientHeight", { get: () => read(rows * 20) });
    Object.defineProperty(field, "scrollHeight", { get: () => read(60) });
  }
  d.resize();
  assert.ok(d.rows("Titles").every((r) => r.field.rows === 3));
  assert.ok(layouts <= 13, String(layouts));
});

test("a very long title is not compared word by word", () => {
  const p = plan();
  const long = Array.from({ length: 5000 }, (_, i) => `w${i}`).join(" ");
  p.titles = [{ id: 1, kind: "title", from: `${long}.`, to: long, reasons: ["safe"] }];
  const t = Date.now();
  const row = open(p).rows("Titles")[0];
  assert.deepEqual(marked(row), []);
  assert.ok(Date.now() - t < 500);
});

test("the sticky heading does not cover what has the focus", () => {
  const css = fs.readFileSync(new URL("../content/preview.css", import.meta.url), "utf8");
  assert.match(css, /\.gam-scroll \{[^}]*scroll-padding-block-start: 3em;/);
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

test("a changed short title shows, and follows the edited title", () => {
  const d = open();
  const [a, b] = d.rows("Titles");
  assert.match(a.el.text(), /short title: Asthma/);
  assert.doesNotMatch(b.el.text(), /short title/);
  a.type("Other");
  assert.doesNotMatch(a.el.text(), /short title/);
});

test("Select all is complete when only the rows that can be ticked are ticked", () => {
  const p = plan();
  p.files[0].templateFor = () => "x.pdf";
  const d = open(p);
  const all = d.section("Filenames").all(cls("gam-all"))[0].all(tag("input"))[0];
  all.checked = true;
  all.fire("change");
  assert.deepEqual([all.checked, all.indeterminate], [true, false]);
  all.checked = false;
  all.fire("change");
  assert.deepEqual(ticked(d.rows("Filenames")), [false, false]);
});

test("Enter has no default button: it cannot apply the window", () => {
  assert.match(fs.readFileSync(new URL("../content/clean.xhtml", import.meta.url), "utf8"), /<dialog [^>]*defaultButton="none"/);
});
