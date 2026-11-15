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
