// The "Note" and "Cited in" columns of the item tree.

import { columnText, citedData, citedText } from "../lib/state.mjs";
import { noteState } from "./common.mjs";

function registerNote(Gam) {
  const Zotero = Gam.Zotero;
  return Zotero.ItemTreeManager.registerColumn({
    dataKey: "gamNote",
    label: "Note",
    pluginID: Gam.id,
    flex: 0,
    width: "80",
    dataProvider: (item) => {
      try {
        return columnText(noteState(Gam, item));
      } catch (e) {
        Gam.log(`column: ${e}`);
        return "";
      }
    },
    renderCell: (index, data, column, isFirstColumn, doc) => {
      const span = doc.createElement("span");
      span.className = `cell ${column.className}`;
      span.textContent = data;
      if (data === "missing") {
        span.style.color = "var(--accent-red, #d00)";
        span.title = "The linked vault note does not exist";
      }
      return span;
    },
  });
}

/**
 * The number of vault notes that cite the item (the count of "Cited in" in the item pane).
 * The data is the count with leading zeros: Zotero sorts a plugin column by its data as text.
 */
function registerCited(Gam) {
  const Zotero = Gam.Zotero;
  return Zotero.ItemTreeManager.registerColumn({
    dataKey: "gamCited",
    label: "Cited in",
    pluginID: Gam.id,
    flex: 0,
    width: "70",
    // The first click shows the most cited items first.
    sortReverse: true,
    zoteroPersist: ["width", "hidden", "sortDirection"],
    dataProvider: (item) => {
      try {
        if (!item?.isRegularItem?.() || !Gam.state.index) return "";
        return citedData(Gam.state.index.citedCount(Gam.itemInfo(item)));
      } catch (e) {
        Gam.log(`column cited: ${e}`);
        return "";
      }
    },
    renderCell: (index, data, column, isFirstColumn, doc) => {
      const span = doc.createElement("span");
      span.className = `cell ${column.className}`;
      span.textContent = citedText(data);
      if (span.textContent === "0") span.style.opacity = "0.5";
      span.title = "Vault notes that cite this item";
      return span;
    },
  });
}

export function registerColumn(Gam) {
  const Zotero = Gam.Zotero;
  const dataKeys = [registerNote(Gam), registerCited(Gam)].filter(Boolean);
  if (dataKeys.length) {
    Gam.onRefresh.push(({ columnChanged }) => {
      if (columnChanged) Zotero.ItemTreeManager.refreshColumns();
    });
    Gam.cleanups.push(() => dataKeys.forEach((key) => Zotero.ItemTreeManager.unregisterColumn(key)));
  }
  return dataKeys;
}
