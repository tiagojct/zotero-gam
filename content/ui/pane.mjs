// The "Vault" section of the item pane.

import { noteState, missingLinks, canChange, openInObsidian } from "./common.mjs";
import { statusTone, TONE_COLORS } from "../lib/status.mjs";

const PANE_ID = "gam-vault";

// The look of the section. The colours of a status come from lib/status.mjs.
const CSS = `
.gam { display: flex; flex-direction: column; gap: 10px; padding: 2px 0 4px; user-select: text; }
.gam-title { font-weight: 600; line-height: 1.35; overflow-wrap: anywhere; }
.gam-meta { display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; }
.gam-pill { display: inline-flex; align-items: center; gap: 6px; padding: 1px 9px 1px 7px; border-radius: 999px;
  background: color-mix(in srgb, var(--gam-tone) 16%, transparent); }
.gam-pill::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--gam-tone); }
.gam-chip { padding: 1px 7px; border-radius: 4px; background: color-mix(in srgb, currentColor 10%, transparent); opacity: 0.85; }
.gam-summary { white-space: pre-wrap; line-height: 1.45; opacity: 0.85; }
.gam-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.gam-note { line-height: 1.4; }
.gam-note.gam-missing { color: var(--accent-red, #d00); }
.gam-cited { display: flex; flex-direction: column; gap: 1px; }
.gam-cited-head { display: flex; gap: 6px; align-items: baseline; font-weight: 600; margin-bottom: 2px; }
.gam-count { font-weight: 400; opacity: 0.6; }
.gam-link { cursor: pointer; padding: 2px 6px; margin: 0 -6px; border-radius: 4px; overflow-wrap: anywhere;
  color: var(--accent-blue, #2e6ed1); }
.gam-link:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
.gam-dir { opacity: 0.6; }
${Object.entries(TONE_COLORS).map(([tone, [light]]) => `.gam-tone-${tone} { --gam-tone: ${light}; }`).join("\n")}
@media (prefers-color-scheme: dark) {
${Object.entries(TONE_COLORS).map(([tone, [, dark]]) => `  .gam-tone-${tone} { --gam-tone: ${dark}; }`).join("\n")}
}
`;

function el(doc, tag, text, className) {
  const e = doc.createElement(tag);
  if (text) e.textContent = text;
  if (className) e.className = className;
  return e;
}

/** A row of the "Cited in" list: the folder dimmed, then the name of the note. */
function link(doc, Gam, path) {
  const name = path.replace(/\.md$/, "");
  const slash = name.lastIndexOf("/");
  const a = el(doc, "div", null, "gam-link");
  if (slash >= 0) a.append(el(doc, "span", name.slice(0, slash + 1), "gam-dir"));
  a.append(el(doc, "span", name.slice(slash + 1)));
  a.title = "Open in Obsidian";
  a.addEventListener("click", () => openInObsidian(Gam, path));
  return a;
}

function button(doc, label, onClick) {
  const b = el(doc, "button", label);
  b.addEventListener("click", onClick);
  return b;
}

// The item that each section body shows now. Zotero reuses a body for the next selected item.
const shownItem = new WeakMap();

function actionRow(doc, ...buttons) {
  const row = el(doc, "div", null, "gam-actions");
  row.append(...buttons);
  return row;
}

/** Draw the section for item into body. Exported for the tests. */
export function render(Gam, { doc, body, item, setSectionSummary }) {
  shownItem.set(body, item);
  body.replaceChildren();
  const box = el(doc, "div", null, "gam");
  body.append(el(doc, "style", CSS), box);
  if (Gam.state.error) {
    box.append(el(doc, "div", Gam.state.error, "gam-note"));
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
  // No write buttons for an item that gam cannot change (trash, read-only library).
  const writable = canChange(item);
  const create = run(Gam.actions.createNote);

  if (state.kind === "note") {
    const n = state.note;
    box.append(el(doc, "div", n.title, "gam-title"));
    const meta = el(doc, "div", null, "gam-meta");
    meta.append(el(doc, "span", n.status || "no status", `gam-pill gam-tone-${statusTone(n.status)}`));
    for (const tag of n.tags.filter((t) => t.startsWith("topic/"))) meta.append(el(doc, "span", tag.slice("topic/".length), "gam-chip"));
    box.append(meta);
    if (n.summary) box.append(el(doc, "div", n.summary, "gam-summary"));
    const actions = el(doc, "div", null, "gam-actions");
    actions.append(button(doc, "Open in Obsidian", () => openInObsidian(Gam, n.path)));
    if (writable && Gam.actions.linkNote && missingLinks(Gam, item)) {
      actions.append(button(doc, "Add Zotero link", run(Gam.actions.linkNote)));
    }
    box.append(actions);
    setSectionSummary?.(n.status || "");
  } else if (state.kind === "missing") {
    box.append(el(doc, "div", `The linked note does not exist: ${state.missingPath}`, "gam-note gam-missing"));
    if (writable && Gam.actions.createNote) box.append(actionRow(doc, button(doc, "Create note", create)));
    setSectionSummary?.("missing");
  } else {
    box.append(el(doc, "div", "No literature note.", "gam-note"));
    if (writable && Gam.actions.createNote) box.append(actionRow(doc, button(doc, "Create note", create)));
    setSectionSummary?.("");
  }

  const cited = el(doc, "div", null, "gam-cited");
  cited.dataset.gamCited = "1";
  box.append(cited);
}

function renderCitedIn(Gam, { doc, body, item }) {
  const cited = body.querySelector("[data-gam-cited]");
  if (!cited || !Gam.state.index) return;
  const paths = Gam.state.index.citedIn(Gam.itemInfo(item));
  cited.replaceChildren();
  if (!paths.length) return;
  const head = el(doc, "div", null, "gam-cited-head");
  head.append(el(doc, "span", "Cited in"), el(doc, "span", String(paths.length), "gam-count"));
  cited.append(head);
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
