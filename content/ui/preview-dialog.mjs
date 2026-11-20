// The preview dialog of "Create notes for collection". It shows the plan and writes nothing.

/**
 * preview: {name, folder, rows: [{id, title, relPath, newKey}], skipped: [string]}.
 * Returns the ids of the rows that the user keeps, or null when the user cancels.
 */
export function confirmNotes(Gam, preview) {
  const win = Gam.Zotero.getMainWindow();
  const n = preview.rows.length;
  const io = {
    title: `Create notes: ${preview.name || "collection"}`,
    intro: `${n} note${n === 1 ? "" : "s"} will be written in ${preview.folder}/. `
      + "Nothing is written until you select Create. Clear the box of a note to leave it out.",
    rows: preview.rows.map((r) => ({ id: r.id, title: r.title, relPath: r.relPath, newKey: r.newKey })),
    skipped: preview.skipped,
    selected: null,
  };
  const url = new URL("../preview.xhtml", import.meta.url).href;
  win.openDialog(url, "gam-preview", "chrome,dialog,modal,centerscreen,resizable", io);
  return io.selected;
}

/**
 * The dialog of "Citation keys". preview: {name, rows: [{id, title, citekey}], skipped: [string],
 * problems: [string]}. Returns the ids of the rows that the user keeps, or null when the user cancels.
 */
export function confirmKeys(Gam, preview) {
  const win = Gam.Zotero.getMainWindow();
  const n = preview.rows.length;
  const intro = n
    ? `${n} item${n === 1 ? "" : "s"} in ${preview.name || "the library"} ${n === 1 ? "has" : "have"} no citation key. `
      + "gam gives each one the key shown. Nothing is written until you select Assign. "
      + "Clear the box of an item to leave it out. gam never changes a key that exists."
    : `All items in ${preview.name || "the library"} have a citation key.`;
  const io = {
    title: `Citation keys: ${preview.name || "library"}`,
    intro,
    verb: "Assign",
    noun: ["key", "keys"],
    empty: "No item needs a key.",
    rows: preview.rows.map((r) => ({ id: r.id, title: r.title, main: r.citekey })),
    skipped: preview.skipped,
    problems: preview.problems,
    problemsTitle: "Problems that gam does not change",
    selected: null,
  };
  const url = new URL("../preview.xhtml", import.meta.url).href;
  win.openDialog(url, "gam-preview", "chrome,dialog,modal,centerscreen,resizable", io);
  return io.selected;
}
