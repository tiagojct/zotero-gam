// A short notice in the corner of the Zotero window.

/** One line of the notice for each line of message: the window is as wide as its longest line. */
export function notify(Zotero, message, ok = true) {
  const pw = new Zotero.ProgressWindow();
  pw.changeHeadline("gam");
  for (const line of String(message).split("\n")) pw.addDescription(line);
  pw.show();
  pw.startCloseTimer(ok ? 4000 : 8000);
}
