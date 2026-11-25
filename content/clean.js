/* The window "Clean library". It reads window.arguments[0] (see ui/clean-dialog.mjs): {name, plan}, and
 * sets io.result to a JSON text: the choices, or {cancelled: true, ignored} after Ignore and Cancel.
 * null: the user cancelled. The window writes nothing. */
"use strict";

(function () {
  const NS = "http://www.w3.org/1999/xhtml";
  const REASONS = { safe: "spaces, punctuation or tags", terms: "names", "title-case": "sentence case", suggestion: "check this one" };
  // A title field has not more lines than this.
  const MAX_LINES = 12;
  // A title with more words than this gets no marks: the time grows with the square.
  const MAX_WORDS = 200;

  /** Give the fields the lines of their text. Together: each pass is one layout, also with many fields. */
  function fit(fields) {
    let left = fields;
    for (const f of left) f.rows = 1;
    for (let n = 2; n <= MAX_LINES && left.length; n += 1) {
      left = left.filter((f) => f.scrollHeight > f.clientHeight);
      for (const f of left) f.rows = n;
    }
  }

  function h(tag, text, className) {
    const e = document.createElementNS(NS, tag);
    if (text) e.textContent = text;
    if (className) e.setAttribute("class", className);
    return e;
  }

  function button(text, label, onClick) {
    const b = h("button", text, "gam-button");
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.addEventListener("click", onClick);
    return b;
  }

  function checkbox(label) {
    const c = h("input");
    c.type = "checkbox";
    c.setAttribute("aria-label", label);
    return c;
  }

  /** The words of from that are not in to, in order (the longest common part stays): [{text, changed}]. */
  function diffWords(from, to) {
    const a = from.split(/(\s+)/);
    const b = to.split(/\s+/);
    const words = a.filter((x, i) => i % 2 === 0);
    if (Math.max(words.length, b.length) > MAX_WORDS) return [{ text: from, changed: false }];
    // common[i][j]: the length of the longest common part of words from i and b from j.
    const common = Array.from({ length: words.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = words.length - 1; i >= 0; i -= 1) {
      for (let j = b.length - 1; j >= 0; j -= 1) {
        common[i][j] = words[i] === b[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
      }
    }
    const out = [];
    let j = 0;
    words.forEach((word, i) => {
      while (j < b.length && words[i] !== b[j] && common[i][j + 1] > common[i + 1][j]) j += 1;
      const same = j < b.length && word === b[j];
      if (same) j += 1;
      if (word) out.push({ text: word, changed: !same });
      if (a[2 * i + 1]) out.push({ text: a[2 * i + 1], changed: false });
    });
    return out;
  }

  const clean = (text) => String(text).replace(/\s+/g, " ").trim();

  window.addEventListener("load", () => {
    const io = window.arguments[0].wrappedJSObject || window.arguments[0];
    const { plan } = io;
    const dialog = document.getElementById("gam-clean-dialog");
    const root = document.getElementById("gam-clean-root");
    document.documentElement.setAttribute("title", `Clean library: ${io.name || "library"}`);

    const ignored = [];
    const sections = [];
    const box = h("div", null, "gam-box");
    box.append(h("div", "Nothing in the library changes until you select Apply. You can edit a new title. "
      + "Ignore takes a row away for as long as its title or filename stays the same, also when you cancel.", "gam-intro"));
    if (plan.errors.length) {
      const problems = h("div", null, "gam-problems");
      for (const line of plan.errors) problems.append(h("div", line, "gam-problem"));
      box.append(problems);
    }
    const scroll = h("div", null, "gam-scroll");
    box.append(scroll);
    root.append(box);

    // A row: {id, kind, check, el, focusable, valid()}. valid(): false when there is nothing to write.
    function section(title, rows, { bulkIgnore = false } = {}) {
      if (!rows.length) return;
      const s = { rows, el: h("div", null, "gam-section"), title };
      s.el.setAttribute("role", "group");
      const head = h("div", null, "gam-section-head");
      s.heading = h("div", "", "gam-section-title");
      const all = h("label", null, "gam-all");
      s.all = checkbox(`Select all: ${title}`);
      s.all.addEventListener("change", () => {
        for (const r of rows) r.check.checked = s.all.checked;
        update();
      });
      all.append(s.all, h("span", "Select all"));
      head.append(s.heading, all);
      s.el.append(head);
      for (const r of rows) {
        r.section = s;
        r.check.addEventListener("change", update);
        s.el.append(r.el);
      }
      if (bulkIgnore) {
        s.el.append(button("Ignore all that are not ticked", `Ignore all that are not ticked: ${title}`, () => {
          for (const r of rows.filter((x) => !x.check.checked)) ignore(r, false);
          update();
        }));
      }
      sections.push(s);
      scroll.append(s.el);
    }

    function ignore(row, moveFocus = true) {
      const { rows } = row.section;
      const at = rows.indexOf(row);
      rows.splice(at, 1);
      row.el.remove();
      ignored.push({ kind: row.kind, id: row.id });
      io.result = JSON.stringify({ cancelled: true, ignored });
      if (!rows.length) {
        row.section.el.remove();
        sections.splice(sections.indexOf(row.section), 1);
      } else if (moveFocus) {
        rows[Math.min(at, rows.length - 1)].focusable.focus();
      }
    }

    function ignoreButton(row, name) {
      row.focusable = button("Ignore", `Ignore: ${name}`, () => {
        ignore(row);
        update();
      });
      return row.focusable;
    }

    function frame(row, name, ...side) {
      row.el = h("div", null, "gam-clean-row");
      row.text = h("div", null, "gam-text");
      const buttons = h("div", null, "gam-side");
      buttons.append(...side);
      row.el.append(row.check, row.text, buttons);
      return row;
    }

    function titleRow(r) {
      const row = { id: r.id, kind: r.kind, from: r.from, check: checkbox(`Change the title: ${r.from}`) };
      row.value = () => clean(row.field.value);
      row.valid = () => !!row.value() && row.value() !== r.from;
      row.check.checked = r.kind === "title";
      frame(row, r.from, ignoreButton(row, r.from));
      row.field = h("textarea", null, "gam-field");
      row.field.value = r.to;
      const shortLine = h("div", "", "gam-left");
      const was = h("div", "", "gam-title gam-was");
      let marked = null;
      row.refresh = () => {
        // An empty field writes nothing: no word changes.
        if (marked !== row.value()) {
          marked = row.value();
          const parts = row.valid() ? diffWords(r.from, marked) : [{ text: r.from, changed: false }];
          was.replaceChildren(h("span", "was: "), ...parts.map((p) => h("span", p.text, p.changed ? "gam-diff" : "")));
        }
        const short = row.valid() && r.shortFor ? r.shortFor(row.value()) : "";
        shortLine.textContent = short ? `short title: ${short}` : "";
      };
      row.field.setAttribute("aria-label", `New title of: ${r.from}`);
      row.field.addEventListener("input", () => {
        row.check.checked = row.valid();
        fit([row.field]);
        update();
      });
      // Enter would accept the window.
      row.field.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") ev.preventDefault();
      });
      const reasons = r.reasons.map((x) => REASONS[x] || x).join(", ");
      row.text.append(row.field, was, h("div", reasons, "gam-left"), shortLine);
      return row;
    }

    const titles = plan.titles.map(titleRow);
    const suggestions = plan.suggestions.map(titleRow);
    const titleOf = (id) => [...titles, ...suggestions].find((t) => t.id === id);

    const files = plan.files.map((r) => {
      const row = { id: r.id, kind: "file", check: checkbox(`Rename the file: ${r.from}`), to: r.to };
      row.valid = () => row.to !== r.from;
      frame(row, r.from, ignoreButton(row, r.from));
      const name = h("div", r.to, "gam-path");
      row.text.append(name, h("div", `was: ${r.from}`, "gam-title"));
      // The name for the title that Apply will write.
      row.refresh = () => {
        const t = titleOf(r.parentID);
        row.to = r.to;
        if (t && t.check.checked && t.valid()) {
          try {
            row.to = r.templateFor(t.value()) || r.to;
          } catch {
            // The name of the plan stays.
          }
        }
        name.textContent = row.to;
        row.check.disabled = !row.valid();
      };
      return row;
    });

    const orphans = plan.orphans.map((r) => {
      const row = { id: r.id, kind: "orphan", check: checkbox(`Retry the lookup: ${r.name}`), valid: () => true };
      row.check.checked = true;
      frame(row, r.name, button("Create parent…", `Create parent: ${r.name}`, () => {
        io.result = JSON.stringify({ titles: [], files: [], lookups: [], ignored, createParent: r.id });
        window.close();
      }));
      row.text.append(h("div", r.name, "gam-path"), h("div", "Retry lookup", "gam-left"));
      return row;
    });

    const picked = (rows) => rows.filter((r) => r.check.checked);

    function update() {
      for (const r of [...titles, ...suggestions]) {
        r.refresh();
        if (!r.valid()) r.check.checked = false;
      }
      for (const r of files) {
        r.refresh();
        if (!r.valid()) r.check.checked = false;
      }
      let n = 0;
      for (const s of sections) {
        const on = picked(s.rows).length;
        n += on;
        const label = `${s.title} (${s.rows.length})`;
        s.el.setAttribute("aria-label", label);
        s.heading.textContent = label;
        const possible = s.rows.filter((r) => r.valid()).length;
        s.all.checked = possible > 0 && on === possible;
        s.all.indeterminate = on > 0 && on < possible;
      }
      const accept = dialog.getButton("accept");
      if (accept) {
        accept.label = `Apply ${n} change${n === 1 ? "" : "s"}`;
        accept.disabled = n === 0;
      }
    }

    section("Titles", titles);
    section("Title suggestions", suggestions, { bulkIgnore: true });
    section("Filenames", files);
    section("Files without a parent", orphans);

    document.addEventListener("dialogaccept", () => {
      io.result = JSON.stringify({
        titles: picked([...titles, ...suggestions]).map((r) => ({ id: r.id, to: r.value() })),
        files: picked(files).map((r) => ({ id: r.id, to: r.to })),
        lookups: picked(orphans).map((r) => r.id),
        ignored,
        createParent: null,
      });
    });
    update();
    const fitAll = () => fit(sections.flatMap((s) => s.rows).map((r) => r.field).filter(Boolean));
    window.sizeToContent();
    fitAll();
    // The lines change only with the width.
    let width = window.innerWidth;
    window.addEventListener("resize", () => {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      fitAll();
    });
  });
})();
