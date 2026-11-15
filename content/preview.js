/* The preview dialog of "Create notes for collection". It reads window.arguments[0] (see
 * ui/preview-dialog.mjs) and sets io.selected to the ids of the rows that the user keeps, or leaves
 * it null when the user cancels. The dialog writes nothing. */
"use strict";

(function () {
  const NS = "http://www.w3.org/1999/xhtml";

  function h(tag, text, style) {
    const e = document.createElementNS(NS, tag);
    if (text) e.textContent = text;
    if (style) e.setAttribute("style", style);
    return e;
  }

  window.addEventListener("load", () => {
    const io = window.arguments[0].wrappedJSObject || window.arguments[0];
    const dialog = document.getElementById("gam-preview-dialog");
    const root = document.getElementById("gam-preview-root");
    document.documentElement.setAttribute("title", io.title);

    const box = h("div", null, "display: flex; flex-direction: column; gap: 8px; min-width: 640px; max-width: 900px; padding: 4px;");
    box.append(h("div", io.intro));

    const all = h("label", null, "display: flex; gap: 6px; align-items: center;");
    const allBox = h("input");
    allBox.type = "checkbox";
    allBox.checked = true;
    all.append(allBox, h("span", "Select all"));
    box.append(all);

    const list = h("div", null, "height: 340px; overflow-y: auto; border: 1px solid ThreeDShadow; padding: 4px;");
    const boxes = [];
    for (const row of io.rows) {
      const line = h("label", null, "display: flex; gap: 8px; align-items: flex-start; padding: 2px 0;");
      const check = h("input");
      check.type = "checkbox";
      check.checked = true;
      boxes.push({ id: row.id, check });
      const text = h("div", null, "min-width: 0;");
      const head = h("div", null, "font-weight: 600; overflow-wrap: anywhere;");
      head.textContent = row.relPath + (row.newKey ? "  (new citekey)" : "");
      text.append(head, h("div", row.title, "opacity: 0.8; overflow-wrap: anywhere;"));
      line.append(check, text);
      list.append(line);
    }
    box.append(list);
    if (io.skipped.length) box.append(h("div", `Left out: ${io.skipped.join("; ")}.`, "opacity: 0.8;"));
    root.append(box);

    const update = () => {
      const n = boxes.filter((b) => b.check.checked).length;
      const accept = dialog.getButton("accept");
      if (accept) {
        accept.label = n === 1 ? "Create 1 note" : `Create ${n} notes`;
        accept.disabled = n === 0;
      }
      allBox.checked = n === boxes.length;
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
