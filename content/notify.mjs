// A short notice in the corner of the Zotero window.

export function notify(Zotero, message, ok = true) {
  const pw = new Zotero.ProgressWindow();
  pw.changeHeadline("gam");
  pw.addDescription(message);
  pw.show();
  pw.startCloseTimer(ok ? 4000 : 8000);
}
