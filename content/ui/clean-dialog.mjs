// The window "Clean library". It shows the plan and writes nothing.

/** plan: see planLibrary. Returns the choices (see cleanItems), or null when the user cancels. */
export function confirmClean(Gam, plan, name) {
  const win = Gam.Zotero.getMainWindow();
  const io = { name, plan, result: null };
  const url = new URL("../clean.xhtml", import.meta.url).href;
  win.openDialog(url, "gam-clean", "chrome,dialog,modal,centerscreen,resizable", io);
  // A text: objects of a window that is closed cannot be used.
  return io.result ? JSON.parse(io.result) : null;
}
