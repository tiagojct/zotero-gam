// The "Note" column of the item tree.

import { columnText } from "../lib/state.mjs";
import { noteState } from "./common.mjs";

export function registerColumn(Gam) {
  const Zotero = Gam.Zotero;
  const dataKey = Zotero.ItemTreeManager.registerColumn({
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
  if (dataKey) {
    Gam.onRefresh.push(({ columnChanged }) => {
      if (columnChanged) Zotero.ItemTreeManager.refreshColumns();
    });
    Gam.cleanups.push(() => Zotero.ItemTreeManager.unregisterColumn(dataKey));
  }
  return dataKey;
}
