/* The preview dialog of "Create notes for collection" and "Citation keys". It reads
 * window.arguments[0] (see ui/preview-dialog.mjs) and sets io.selected to the ids of the rows that
 * the user keeps, or leaves it null when the user cancels. The dialog writes nothing.
 * A row shows relPath (folder dimmed) or main. io.verb and io.noun name the action on the button;
 * io.problems are lines shown below the list. */
"use strict";

(function () {
  const NS = "http://www.w3.org/1999/xhtml";

  function h(tag, text, className) {
    const e = document.createElementNS(NS, tag);
    if (text) e.textContent = text;
    if (className) e.setAttribute("class", className);
    return e;
  }

  window.addEventListener("load", () => {
    const io = window.arguments[0].wrappedJSObject || window.arguments[0];
    const dialog = document.getElementById("gam-preview-dialog");
    const root = document.getElementById("gam-preview-root");
    document.documentElement.setAttribute("title", io.title);

    const verb = io.verb || "Create";
    const [one, many] = io.noun || ["note", "notes"];
    const box = h("div", null, "gam-box");
    box.append(h("div", io.intro, "gam-intro"));

    const all = h("label", null, "gam-all");
    const allBox = h("input");
    allBox.type = "checkbox";
    allBox.checked = true;
    all.append(allBox, h("span", "Select all"));
    box.append(all);

    const list = h("div", null, "gam-list");
    const boxes = [];
    for (const row of io.rows) {
      const line = h("label", null, "gam-row");
      const check = h("input");
      check.type = "checkbox";
      check.checked = true;
      boxes.push({ id: row.id, check });
      const text = h("div", null, "gam-text");
      // The folder is dimmed; the file name is the part that matters.
      const main = row.relPath ?? row.main ?? "";
      const slash = row.relPath ? main.lastIndexOf("/") : -1;
      const path = h("div", null, "gam-path");
      if (slash >= 0) path.append(h("span", main.slice(0, slash + 1), "gam-dir"));
      path.append(h("span", main.slice(slash + 1)));
      if (row.newKey) path.append(h("span", "new citekey", "gam-new"));
      text.append(path, h("div", row.title, "gam-title"));
      line.append(check, text);
      list.append(line);
    }
    box.append(list);
    if (!io.rows.length) list.append(h("div", io.empty || "Nothing to do.", "gam-left"));
    if (io.skipped?.length) box.append(h("div", `Left out: ${io.skipped.join("; ")}.`, "gam-left"));
    if (io.problems?.length) {
      const problems = h("div", null, "gam-problems");
      problems.append(h("div", io.problemsTitle || "Problems", "gam-problems-title"));
      for (const line of io.problems) problems.append(h("div", line, "gam-problem"));
      box.append(problems);
    }
    root.append(box);

    const update = () => {
      const n = boxes.filter((b) => b.check.checked).length;
      const accept = dialog.getButton("accept");
      if (accept) {
        accept.label = `${verb} ${n} ${n === 1 ? one : many}`;
        accept.disabled = n === 0;
      }
      allBox.checked = boxes.length > 0 && n === boxes.length;
    };
    list.addEventListener("change", update);
    allBox.addEventListener("change", () => {
      for (const b of boxes) b.check.checked = allBox.checked;
      update();
    });
    document.addEventListener("dialogaccept", () => {
      io.selected = boxes.filter((b) => b.check.checked).map((b) => b.id);
    });
    update();
    window.sizeToContent();
  });
})();
