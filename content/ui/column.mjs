// The "Note" and "Cited in" columns of the item tree.

import { columnText, citedData, citedText } from "../lib/state.mjs";
import { noteState } from "./common.mjs";
import { statusTone, TONE_COLORS } from "../lib/status.mjs";

/** The dot before a status: a coloured circle that follows the light or dark theme. */
function statusDot(doc, status) {
  const [light, dark] = TONE_COLORS[statusTone(status)];
  const dot = doc.createElement("span");
  Object.assign(dot.style, {
    display: "inline-block", flex: "none", width: "7px", height: "7px", borderRadius: "50%",
    background: `light-dark(${light}, ${dark})`,
  });
  return dot;
}

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
      if (data === "missing") {
        span.textContent = data;
        span.style.color = "var(--accent-red, #d00)";
        span.title = "The linked vault note does not exist";
      } else if (data) {
        Object.assign(span.style, { display: "inline-flex", alignItems: "center", gap: "6px" });
        const label = doc.createElement("span");
        label.textContent = data;
        span.append(statusDot(doc, data), label);
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
      span.style.fontVariantNumeric = "tabular-nums";
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
