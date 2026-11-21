// gam endpoints on Zotero's local HTTP server (127.0.0.1:23119). Read only.
// GET /gam/selection: what is selected in the Zotero window, for zotero-local-mcp.

import { refuseReason, libraryName, selectionAnswer } from "./lib/selection.mjs";

export const SELECTION_PATH = "/gam/selection";

function json(status, body) {
  return [status, "application/json", JSON.stringify(body)];
}

function library(Zotero, libraryID) {
  const lib = Zotero.Libraries.get(libraryID);
  const type = lib?.libraryType || "user";
  const groupID = type === "group" ? Zotero.Groups.getGroupIDFromLibraryID(libraryID) : null;
  return libraryName({ type, groupID });
}

function describeItem(gam, item) {
  const info = item.isRegularItem() ? gam.itemInfo(item) : { citekey: "", doi: "" };
  return {
    key: item.key,
    library: library(gam.Zotero, item.libraryID),
    itemType: item.itemType,
    title: item.getDisplayTitle(),
    citekey: info.citekey,
    doi: info.doi,
  };
}

/** The selection in the active main window, as selectionAnswer() describes it. */
export function readSelection(gam) {
  const Zotero = gam.Zotero;
  const win = Zotero.getMainWindow();
  const pane = Zotero.getActiveZoteroPane();
  if (!win || !pane) return selectionAnswer({ version: gam.version });
  const tab = win.Zotero_Tabs?.selectedType || "library";
  const items = pane.getSelectedItems().map((item) => describeItem(gam, item));
  let reader = null;
  if (tab === "reader") {
    const r = Zotero.Reader.getByTabID(win.Zotero_Tabs.selectedID);
    const att = r ? Zotero.Items.get(r.itemID) : null;
    if (att) reader = { key: att.key, library: library(Zotero, att.libraryID) };
  }
  let collection = null;
  const collections = pane.getSelectedCollections?.() || [];
  if (collections.length === 1) collection = { key: collections[0].key, name: collections[0].name };
  return selectionAnswer({ version: gam.version, tab, items, reader, collection });
}

/** Add the endpoints. The cleanup removes them in shutdown(). */
export function registerEndpoints(gam) {
  const Zotero = gam.Zotero;
  function Selection() {}
  Selection.prototype = {
    supportedMethods: ["GET"],
    async init(request) {
      const refused = refuseReason(request);
      if (refused) return json(403, { error: refused });
      try {
        return json(200, readSelection(gam));
      } catch (e) {
        Zotero.logError(e);
        return json(500, { error: String(e?.message || e) });
      }
    },
  };
  Zotero.Server.Endpoints[SELECTION_PATH] = Selection;
  gam.cleanups.push(() => {
    if (Zotero.Server.Endpoints[SELECTION_PATH] === Selection) delete Zotero.Server.Endpoints[SELECTION_PATH];
  });
}
