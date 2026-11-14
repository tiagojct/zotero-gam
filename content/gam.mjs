// gam: plugin state, preferences and the vault index.
// bootstrap.js imports this module and passes Zotero in startup().

import { buildIndex } from "./lib/index.mjs";
import { currentKey } from "./lib/citekey.mjs";
import { parseUris } from "./lib/obsidian.mjs";
import { expandHome } from "./lib/paths.mjs";
import { registerColumn } from "./ui/column.mjs";
import { registerPane } from "./ui/pane.mjs";
import { registerMenus } from "./ui/menu.mjs";
import { createNote, notify } from "./create.mjs";
import { listMarkdown, vaultExists } from "./vault.mjs";

const { setTimeout, clearTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");

const PREF = "extensions.gam.";
const MIN_REFRESH_MS = 30000;

let Zotero = null;
let homeDir = "";
let notifierID = null;
let lastRefresh = 0;
let running = null;
let linksTimer = null;
const logged = new Set();
const focusHandlers = new Map();

function pref(name) {
  return Zotero.Prefs.get(PREF + name, true);
}


export const Gam = {
  id: null,
  rootURI: null,
  state: { index: null, error: null, links: new Map() },
  // Functions that Tasks 7 and 8 add, called after each refresh (for example, to redraw the column).
  onRefresh: [],
  // Functions called in shutdown() (for example, to unregister the column).
  cleanups: [],
  // Actions that Task 8 adds (createNote).
  actions: {},

  prefs: {
    vault: () => expandHome(String(pref("vault") || "~/quarterdeck/powerslave"), homeDir),
    vaultName: () => String(pref("vaultName") || "") || PathUtils.filename(Gam.prefs.vault()),
    literatureFolder: () => String(pref("literatureFolder") || "sub-sub/literature").replace(/^\/+|\/+$/g, ""),
    exclude: () => String(pref("exclude") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    marker: () => String(pref("marker") || ""),
    openAfterCreate: () => pref("openAfterCreate") !== false,
  },

  get Zotero() {
    return Zotero;
  },

  log(message) {
    if (logged.has(message)) return;
    logged.add(message);
    Zotero.debug(`gam: ${message}`);
  },

  /** {citekey, itemKey, doi} of a regular item. */
  itemInfo(item) {
    const field = (name) => {
      try {
        return item.getField(name) || "";
      } catch {
        return "";
      }
    };
    const citekey = currentKey({ citationKey: field("citationKey"), extra: field("extra") });
    return { citekey, itemKey: item.key, doi: field("DOI") };
  },

  async startup({ id, rootURI, Zotero: z, homeDir: home }) {
    Zotero = z;
    homeDir = home;
    this.id = id;
    this.rootURI = rootURI;
    notifierID = Zotero.Notifier.registerObserver({
      notify: (event, type, ids) => {
        if (["add", "modify", "delete", "trash", "refresh"].includes(event)) this.scheduleLinks();
      },
    }, ["item"], "gam");
    this.actions.createNote = (item) => createNote(this, item).catch((e) => {
      notify(Zotero, e.message || String(e), false);
    });
    registerColumn(this);
    registerPane(this);
    registerMenus(this);
    // On ADDON_ENABLE the main window is already open, and Zotero does not call onMainWindowLoad for it.
    for (const win of Zotero.getMainWindows()) {
      if (win.ZoteroPane) this.onMainWindowLoad(win);
    }
    await this.refresh({ force: true });
  },

  shutdown() {
    if (notifierID) Zotero.Notifier.unregisterObserver(notifierID);
    notifierID = null;
    for (const win of [...focusHandlers.keys()]) this.onMainWindowUnload(win);
    focusHandlers.clear();
    for (const fn of this.cleanups.splice(0)) {
      try {
        fn();
      } catch (e) {
        Zotero.logError(e);
      }
    }
    this.onRefresh = [];
    clearTimeout(linksTimer);
  },

  onMainWindowLoad(win) {
    if (focusHandlers.has(win)) return;
    win.MozXULElement.insertFTLIfNeeded("gam.ftl");
    const handler = () => this.refresh().catch((e) => Zotero.logError(e));
    win.addEventListener("focus", handler);
    focusHandlers.set(win, handler);
  },

  onMainWindowUnload(win) {
    const handler = focusHandlers.get(win);
    if (handler) win.removeEventListener("focus", handler);
    focusHandlers.delete(win);
    win.document.querySelector('[href="gam.ftl"]')?.remove();
  },

  /** Read the vault and the obsidian links again. At most once each 30 s unless force is set. */
  async refresh({ force = false } = {}) {
    if (running) return running;
    if (!force && Date.now() - lastRefresh < MIN_REFRESH_MS) return;
    lastRefresh = Date.now();
    running = (async () => {
      const vault = this.prefs.vault();
      if (await vaultExists(vault)) {
        const files = await listMarkdown(vault, this.prefs.exclude());
        this.state.index = buildIndex(files, { literatureFolder: this.prefs.literatureFolder() });
        this.state.error = null;
      } else {
        this.state.index = null;
        this.state.error = `Vault folder not found: ${vault}`;
        this.log(this.state.error);
      }
      await this.loadLinks();
      Zotero.debug(`gam: index ${this.state.index ? this.state.index.citekeys().size : 0} literature notes, `
        + `${this.state.links.size} items with obsidian links`);
      this.notifyRefresh();
    })();
    try {
      await running;
    } finally {
      running = null;
    }
  },

  /** The obsidian:// links of the child notes, by parent item ID. */
  async loadLinks() {
    const rows = await Zotero.DB.queryAsync(
      "SELECT parentItemID AS parentID, note FROM itemNotes WHERE parentItemID IS NOT NULL "
      + "AND note LIKE ? AND itemID NOT IN (SELECT itemID FROM deletedItems)",
      ["%obsidian://open%"],
    );
    const links = new Map();
    for (const row of rows || []) {
      const found = parseUris(row.note);
      if (!found.length) continue;
      if (!links.has(row.parentID)) links.set(row.parentID, []);
      links.get(row.parentID).push(...found);
    }
    this.state.links = links;
  },

  scheduleLinks() {
    clearTimeout(linksTimer);
    linksTimer = setTimeout(() => {
      this.loadLinks().then(() => this.notifyRefresh()).catch((e) => Zotero.logError(e));
    }, 1000);
  },

  notifyRefresh() {
    for (const fn of this.onRefresh) {
      try {
        fn();
      } catch (e) {
        Zotero.logError(e);
      }
    }
  },
};
