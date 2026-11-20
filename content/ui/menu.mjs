// Context menu entries on items and the Tools menu entry.

import { noteState, missingLinks, canChange, openInObsidian } from "./common.mjs";
import { createNotes, linkNotes, collectionItems, createNotesForCollection, notify } from "../create.mjs";
import { wikilink, pandocCite } from "../lib/copy.mjs";
import { confirmNotes, confirmKeys } from "./preview-dialog.mjs";
import { assignKeys } from "../keys.mjs";

export function registerMenus(Gam) {
  const Zotero = Gam.Zotero;
  const single = (ctx) => (ctx.items?.length === 1 ? ctx.items[0] : null);
  const needKey = (ctx) => (ctx.items || []).filter((i) => i.isRegularItem() && canChange(i) && !Gam.itemInfo(i).citekey);
  const runKeys = (items, name) => assignKeys(Gam, items, { name, confirm: async (preview) => confirmKeys(Gam, preview) })
    .catch((e) => {
      Zotero.logError(e);
      notify(Zotero, e.message || String(e), false);
    });

  const itemMenu = Zotero.MenuManager.registerMenu({
    menuID: "gam-item",
    pluginID: Gam.id,
    target: "main/library/item",
    menus: [
      {
        menuType: "menuitem",
        l10nID: "gam-menu-open",
        onShowing: (ev, ctx) => {
          const item = single(ctx);
          ctx.setVisible(!!item && noteState(Gam, item).kind === "note");
        },
        onCommand: (ev, ctx) => {
          const item = single(ctx);
          const s = item && noteState(Gam, item);
          if (s?.kind === "note") openInObsidian(Gam, s.note.path);
        },
      },
      {
        menuType: "menuitem",
        l10nID: "gam-menu-create",
        onShowing: (ev, ctx) => {
          const items = (ctx.items || []).filter((i) => i.isRegularItem() && canChange(i));
          ctx.setVisible(!!Gam.state.index && items.some((i) => noteState(Gam, i).kind !== "note"));
        },
        onCommand: (ev, ctx) => {
          const items = (ctx.items || []).filter((i) => i.isRegularItem() && canChange(i) && noteState(Gam, i).kind !== "note");
          createNotes(Gam, items).catch((e) => Zotero.logError(e));
        },
      },
      {
        menuType: "menuitem",
        l10nID: "gam-menu-link",
        onShowing: (ev, ctx) => {
          ctx.setVisible((ctx.items || []).some((i) => canChange(i) && missingLinks(Gam, i)));
        },
        onCommand: (ev, ctx) => {
          const items = (ctx.items || []).filter((i) => canChange(i) && missingLinks(Gam, i));
          linkNotes(Gam, items).catch((e) => Zotero.logError(e));
        },
      },
      {
        menuType: "menuitem",
        l10nID: "gam-menu-keys",
        onShowing: (ev, ctx) => {
          ctx.setVisible(needKey(ctx).length > 0);
        },
        onCommand: (ev, ctx) => {
          const items = needKey(ctx);
          if (items.length) runKeys(items, items.length === 1 ? "selected item" : "selected items");
        },
      },
      {
        menuType: "menuitem",
        l10nID: "gam-menu-copy",
        onShowing: (ev, ctx) => {
          const item = single(ctx);
          ctx.setVisible(!!item && item.isRegularItem() && !!Gam.itemInfo(item).citekey);
        },
        onCommand: (ev, ctx) => {
          const item = single(ctx);
          const key = item && Gam.itemInfo(item).citekey;
          if (key) Zotero.Utilities.Internal.copyTextToClipboard(wikilink(key));
        },
      },
      {
        menuType: "menuitem",
        l10nID: "gam-menu-copy-pandoc",
        onShowing: (ev, ctx) => {
          const item = single(ctx);
          ctx.setVisible(!!item && item.isRegularItem() && !!pandocCite(Gam.itemInfo(item).citekey));
        },
        onCommand: (ev, ctx) => {
          const item = single(ctx);
          const text = item && pandocCite(Gam.itemInfo(item).citekey);
          if (text) Zotero.Utilities.Internal.copyTextToClipboard(text);
        },
      },
    ],
  });

  // The collection that the context menu opened on, or null (library root, saved search, trash).
  const collectionOf = (ctx) => {
    try {
      const row = ctx.collectionTreeRow;
      return row?.isCollection?.() ? row.ref : null;
    } catch {
      return null;
    }
  };

  const collectionMenu = Zotero.MenuManager.registerMenu({
    menuID: "gam-collection",
    pluginID: Gam.id,
    target: "main/library/collection",
    menus: [
      {
        menuType: "menuitem",
        l10nID: "gam-menu-create-collection",
        onShowing: (ev, ctx) => {
          const collection = collectionOf(ctx);
          ctx.setVisible(!!collection && !!Gam.state.index);
        },
        onCommand: (ev, ctx) => {
          const collection = collectionOf(ctx);
          if (!collection) return;
          (async () => {
            const items = await collectionItems(Zotero, collection);
            await createNotesForCollection(Gam, items, {
              name: collection.name,
              confirm: async (preview) => confirmNotes(Gam, preview),
            });
          })().catch((e) => {
            Zotero.logError(e);
            notify(Zotero, e.message || String(e), false);
          });
        },
      },
    ],
  });

  const toolsMenu = Zotero.MenuManager.registerMenu({
    menuID: "gam-tools",
    pluginID: Gam.id,
    target: "main/menubar/tools",
    menus: [
      {
        menuType: "menuitem",
        l10nID: "gam-menu-refresh",
        // A full scan: every file is read again.
        onCommand: () => {
          Gam.clearCache();
          Gam.refresh({ force: true }).catch((e) => Zotero.logError(e));
        },
      },
      {
        menuType: "menuitem",
        l10nID: "gam-menu-keys-library",
        // All items of the library that is selected in the left pane.
        onCommand: () => {
          (async () => {
            const selected = Zotero.getActiveZoteroPane()?.getSelectedLibraryIDs?.() || [];
            if (selected.length > 1) {
              notify(Zotero, "Select one library in the left pane, then choose Citation keys again.", false);
              return;
            }
            const libraryID = selected[0] || Zotero.Libraries.userLibraryID;
            const items = (await Zotero.Items.getAll(libraryID, true, false)).filter((i) => i.isRegularItem());
            await runKeys(items, Zotero.Libraries.get(libraryID)?.name || "library");
          })().catch((e) => {
            Zotero.logError(e);
            notify(Zotero, e.message || String(e), false);
          });
        },
      },
    ],
  });

  const ids = [itemMenu, collectionMenu, toolsMenu].filter(Boolean);
  Gam.cleanups.push(() => ids.forEach((id) => Zotero.MenuManager.unregisterMenu(id)));
  return ids;
}
