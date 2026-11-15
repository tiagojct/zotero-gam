// The "Vault" section of the item pane.

import { noteState, missingLinks, openInObsidian } from "./common.mjs";

const PANE_ID = "gam-vault";

function el(doc, tag, text, style) {
  const e = doc.createElement(tag);
  if (text) e.textContent = text;
  if (style) e.setAttribute("style", style);
  return e;
}

function link(doc, Gam, path) {
  const a = el(doc, "div", path.replace(/\.md$/, ""), "cursor: pointer; color: var(--accent-blue, #2e6ed1); margin: 2px 0;");
  a.title = "Open in Obsidian";
  a.addEventListener("click", () => openInObsidian(Gam, path));
  return a;
}

function button(doc, label, onClick) {
  const b = el(doc, "button", label, "margin-top: 6px; margin-inline-end: 6px;");
  b.addEventListener("click", onClick);
  return b;
}

// The item that each section body shows now. Zotero reuses a body for the next selected item.
const shownItem = new WeakMap();

/** Draw the section for item into body. Exported for the tests. */
export function render(Gam, { doc, body, item, setSectionSummary }) {
  shownItem.set(body, item);
  body.replaceChildren();
  const box = el(doc, "div", null, "padding: 2px 0; user-select: text;");
  body.append(box);
  if (Gam.state.error) {
    box.append(el(doc, "div", Gam.state.error));
    setSectionSummary?.("");
    return;
  }
  const state = noteState(Gam, item);
  // The button is off while the action runs, so a second click cannot start a second write.
  const run = (action) => (event) => {
    const b = event?.target;
    if (b) b.disabled = true;
    return Promise.resolve(action?.(item)).finally(() => {
      if (b?.isConnected) b.disabled = false;
      // Draw again only if the body still shows this item: the user can select another item meanwhile.
      if (body.isConnected && shownItem.get(body) === item) render(Gam, { doc, body, item, setSectionSummary });
    });
  };
  const create = run(Gam.actions.createNote);

  if (state.kind === "note") {
    const n = state.note;
    box.append(el(doc, "div", n.title, "font-weight: 600;"));
    const tags = n.tags.filter((t) => t.startsWith("topic/"));
    box.append(el(doc, "div", [n.status || "no status", tags.join(", ")].filter(Boolean).join(" · "), "opacity: 0.8;"));
    if (n.summary) box.append(el(doc, "div", n.summary, "margin-top: 6px; white-space: pre-wrap;"));
    box.append(button(doc, "Open in Obsidian", () => openInObsidian(Gam, n.path)));
    if (Gam.actions.linkNote && missingLinks(Gam, item)) {
      box.append(button(doc, "Add Zotero link", run(Gam.actions.linkNote)));
    }
    setSectionSummary?.(n.status || "");
  } else if (state.kind === "missing") {
    box.append(el(doc, "div", `The linked note does not exist: ${state.missingPath}`));
    if (Gam.actions.createNote) box.append(button(doc, "Create note", create));
    setSectionSummary?.("missing");
  } else {
    box.append(el(doc, "div", "No literature note."));
    if (Gam.actions.createNote) box.append(button(doc, "Create note", create));
    setSectionSummary?.("");
  }

  const cited = el(doc, "div", null, "margin-top: 8px;");
  cited.dataset.gamCited = "1";
  box.append(cited);
}

function renderCitedIn(Gam, { doc, body, item }) {
  const cited = body.querySelector("[data-gam-cited]");
  if (!cited || !Gam.state.index) return;
  const paths = Gam.state.index.citedIn(Gam.itemInfo(item));
  cited.replaceChildren();
  if (!paths.length) return;
  cited.append(el(doc, "div", "Cited in", "font-weight: 600;"));
  for (const p of paths) cited.append(link(doc, Gam, p));
}

export function registerPane(Gam) {
  const Zotero = Gam.Zotero;
  const icon = Gam.rootURI + "content/icons/gam.svg";
  // Every shown section (library and reader panes), by body element.
  const shown = new Map();
  const paneID = Zotero.ItemPaneManager.registerSection({
    paneID: PANE_ID,
    pluginID: Gam.id,
    header: { l10nID: "gam-pane-header", icon },
    sidenav: { l10nID: "gam-pane-sidenav", icon },
    onItemChange: ({ item, setEnabled }) => {
      setEnabled(!!item?.isRegularItem());
    },
    onRender: (props) => {
      shown.set(props.body, props);
      render(Gam, props);
    },
    onDestroy: ({ body }) => {
      shown.delete(body);
    },
    onAsyncRender: async (props) => {
      renderCitedIn(Gam, props);
    },
  });
  if (paneID) {
    Gam.onRefresh.push(() => {
      for (const [body, props] of shown) {
        if (!body.isConnected) {
          shown.delete(body);
        } else if (props.item) {
          render(Gam, props);
          renderCitedIn(Gam, props);
        }
      }
    });
    Gam.cleanups.push(() => {
      shown.clear();
      Zotero.ItemPaneManager.unregisterSection(paneID);
    });
  }
  return paneID;
}
