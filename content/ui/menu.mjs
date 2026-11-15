// Context menu entries on items and the Tools menu entry.

import { noteState, missingLinks, canChange, openInObsidian } from "./common.mjs";
import { createNotes, linkNotes } from "../create.mjs";

export function registerMenus(Gam) {
  const Zotero = Gam.Zotero;
  const single = (ctx) => (ctx.items?.length === 1 ? ctx.items[0] : null);

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
        l10nID: "gam-menu-copy",
        onShowing: (ev, ctx) => {
          const item = single(ctx);
          ctx.setVisible(!!item && item.isRegularItem() && !!Gam.itemInfo(item).citekey);
        },
        onCommand: (ev, ctx) => {
          const item = single(ctx);
          const key = item && Gam.itemInfo(item).citekey;
          if (key) Zotero.Utilities.Internal.copyTextToClipboard(`[[${key}]]`);
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
    ],
  });

  const ids = [itemMenu, toolsMenu].filter(Boolean);
  Gam.cleanups.push(() => ids.forEach((id) => Zotero.MenuManager.unregisterMenu(id)));
  return ids;
}
