// gam: plugin state, preferences and the vault index.
// bootstrap.js imports this module and passes Zotero in startup().

import { buildIndex, isCached } from "./lib/index.mjs";
import { currentKey } from "./lib/citekey.mjs";
import { parseUris } from "./lib/obsidian.mjs";
import { expandHome, checkLiteratureFolder, checkImportFolders } from "./lib/paths.mjs";
import { columnSignature, isNoteEvent } from "./lib/state.mjs";
import { makeRefresher, makeDebounce } from "./lib/refresher.mjs";
import { registerColumn } from "./ui/column.mjs";
import { registerPane } from "./ui/pane.mjs";
import { registerMenus } from "./ui/menu.mjs";
import { confirmClean } from "./ui/clean-dialog.mjs";
import { createNote, linkNote, notify } from "./create.mjs";
import { scanKeys, checkKeyChanges, autoKeys } from "./keys.mjs";
import { autoTitles, cleanItems } from "./clean.mjs";
import { makeNewItems } from "./new-items.mjs";
import { makeOrphanWatch } from "./orphans.mjs";
import { makeFolderImport } from "./import-folder.mjs";
import { listMarkdown, checkVault, realFolderCase } from "./vault.mjs";
import { registerEndpoints } from "./server.mjs";

const { setTimeout, clearTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");

const PREF = "extensions.gam.";
const MIN_REFRESH_MS = 30000;
// Settings save on each key press: scan once, this long after the last change.
const SETTINGS_DELAY_MS = 1000;
// New items get their automatic title fixes and key this long after the last "add" event.
const NEW_ITEMS_DELAY_MS = 2000;

let Zotero = null;
let homeDir = "";
let notifierID = null;
let refresher = null;
// The number of the current startup. A scan of an earlier startup (still running at shutdown) stops
// before it changes the state or the cache.
let run = 0;
let prefObservers = [];
let settingsChanged = null;
let linksTimer = null;
let newItems = null;
let orphanWatch = null;
let folderImport = null;
const logged = new Set();
const focusHandlers = new Map();
let knownNoteIDs = new Set();
let lastSignature = null;
// The data of each vault file from the last scan, so a scan reads only the files that changed.
const indexCache = new Map();
let cacheVault = null;
let cacheReset = false;

function pref(name) {
  return Zotero.Prefs.get(PREF + name, true);
}

/** A folder setting with the home folder, or "" when it is empty. */
function folderPref(name) {
  const value = String(pref(name) || "").trim();
  return value ? expandHome(value, homeDir) : "";
}

export const Gam = {
  id: null,
  version: null,
  rootURI: null,
  // literatureFolder: the folder of the last scan, with the case of the folders on disk.
  // keys: Map of item ID to citation key, for the key watch (null before the first scan).
  // keysTouched: item ID to key, for the keys that changed while a scan reads the keys (see scanKeys).
  state: { index: null, error: null, links: new Map(), literatureFolder: null, keys: null, keysTouched: null },
  // Functions that Tasks 7 and 8 add, called after each refresh (for example, to redraw the column).
  onRefresh: [],
  // Functions called in shutdown() (for example, to unregister the column).
  cleanups: [],
  // Actions that startup() adds (createNote, linkNote, clean).
  actions: {},

  prefs: {
    vault: () => expandHome(String(pref("vault") || "").trim(), homeDir),
    vaultName: () => String(pref("vaultName") || "") || (Gam.prefs.vault() ? PathUtils.filename(Gam.prefs.vault()) : ""),
    literatureFolder: () => String(pref("literatureFolder") || "literature").replace(/^\/+|\/+$/g, ""),
    exclude: () => String(pref("exclude") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    marker: () => String(pref("marker") || ""),
    openAfterCreate: () => pref("openAfterCreate") !== false,
    autoKey: () => pref("autoKey") === true,
    cleanNew: () => pref("cleanNew") === true,
    orphanNotice: () => pref("orphanNotice") === true,
    termsFile: () => String(pref("termsFile") || "").trim(),
    importOn: () => pref("importOn") === true,
    importFolder: () => folderPref("importFolder"),
    importDone: () => folderPref("importDone"),
  },

  get Zotero() {
    return Zotero;
  },

  get homeDir() {
    return homeDir;
  },

  log(message) {
    if (logged.has(message)) return;
    logged.add(message);
    Zotero.debug(`gam: ${message}`);
  },

  /** Zotero's own rename of a file after its parent item. */
  renameFileFromParent(file) {
    return ChromeUtils.importESModule("chrome://zotero/content/renameFiles.mjs").renameFileFromParent(file);
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

  async startup({ id, version, rootURI, Zotero: z, homeDir: home }) {
    Zotero = z;
    homeDir = home;
    this.id = id;
    this.version = version;
    this.rootURI = rootURI;
    // The titles first: a key can come from the title.
    newItems = makeNewItems({
      delay: NEW_ITEMS_DELAY_MS,
      enabled: () => this.prefs.cleanNew() || this.prefs.autoKey(),
      jobs: [(ids) => autoTitles(this, ids), (ids) => autoKeys(this, ids)],
      onError: (e) => Zotero.logError(e),
      setTimeout,
      clearTimeout,
    });
    orphanWatch = makeOrphanWatch({
      Zotero,
      enabled: () => this.prefs.orphanNotice(),
      notify: (text) => notify(Zotero, text, false),
      setTimeout,
      clearTimeout,
    });
    folderImport = makeFolderImport({
      Zotero,
      enabled: () => this.prefs.importOn(),
      folder: () => this.prefs.importFolder(),
      done: () => this.prefs.importDone(),
      check: (folder, done) => checkImportFolders(folder, done,
        { home: homeDir, vault: this.prefs.vault(), dataDir: Zotero.DataDirectory.dir }),
      notify: (text, ok) => notify(Zotero, text, ok),
      setTimeout,
      clearTimeout,
    });
    folderImport.start();
    notifierID = Zotero.Notifier.registerObserver({
      notify: (event, type, ids) => {
        if (isNoteEvent(event, ids, (id) => Zotero.Items.get(id), knownNoteIDs)) this.scheduleLinks();
        try {
          if (event === "add") {
            newItems?.add(ids);
            orphanWatch?.add(ids);
          }
          if (event === "modify") checkKeyChanges(this, ids);
        } catch (e) {
          Zotero.logError(e);
        }
      },
    }, ["item"], "gam");
    this.actions.createNote = (item) => createNote(this, item).catch((e) => {
      notify(Zotero, e.message || String(e), false);
    });
    this.actions.linkNote = (item) => linkNote(this, item).catch((e) => {
      notify(Zotero, e.message || String(e), false);
    });
    this.actions.clean = (items, opts) => cleanItems(this, items, {
      ...opts, confirm: async (plan) => confirmClean(this, plan, opts.name),
    });
    registerColumn(this);
    registerPane(this);
    registerMenus(this);
    registerEndpoints(this);
    const thisRun = ++run;
    refresher = makeRefresher(() => this.scan(thisRun), { minInterval: MIN_REFRESH_MS });
    // A changed setting takes effect one second after the last change.
    settingsChanged = makeDebounce(() => {
      this.refresh({ force: true }).catch((e) => Zotero.logError(e));
    }, SETTINGS_DELAY_MS, { setTimeout, clearTimeout });
    prefObservers = ["vault", "vaultName", "literatureFolder", "exclude"].map((name) =>
      Zotero.Prefs.registerObserver(PREF + name, () => settingsChanged?.call(), true));
    prefObservers.push(Zotero.Prefs.registerObserver(PREF + "importOn", () => folderImport?.changed(), true));
    // A folder setting saves on each key press: a path that is not complete is another folder. So a change
    // turns the import off, and the user turns it on again.
    prefObservers.push(...["importFolder", "importDone"].map((name) => Zotero.Prefs.registerObserver(PREF + name, () => {
      folderImport?.changed();
      if (this.prefs.importOn()) Zotero.Prefs.set(PREF + "importOn", false, true);
    }, true)));
    // On ADDON_ENABLE the main window is already open, and Zotero does not call onMainWindowLoad for it.
    for (const win of Zotero.getMainWindows()) {
      if (win.ZoteroPane) this.onMainWindowLoad(win);
    }
    await this.refresh({ force: true });
  },

  shutdown() {
    if (notifierID) Zotero.Notifier.unregisterObserver(notifierID);
    notifierID = null;
    for (const symbol of prefObservers) Zotero.Prefs.unregisterObserver(symbol);
    prefObservers = [];
    run += 1;
    settingsChanged?.cancel();
    settingsChanged = null;
    refresher = null;
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
    linksTimer = null;
    newItems?.cancel();
    newItems = null;
    orphanWatch?.stop();
    orphanWatch = null;
    folderImport?.stop();
    folderImport = null;
    // An update without a restart keeps this module loaded: free the index and the links.
    this.state = { index: null, error: null, links: new Map(), literatureFolder: null, keys: null, keysTouched: null };
    indexCache.clear();
    cacheVault = null;
    cacheReset = false;
    knownNoteIDs = new Set();
    lastSignature = null;
    logged.clear();
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
  async refresh(opts = {}) {
    return refresher?.(opts);
  },

  /** The next scan reads every file again. (A scan that runs now keeps its cache.) */
  clearCache() {
    cacheReset = true;
  },

  async scan(thisRun = run) {
    const stopped = () => thisRun !== run;
    if (stopped()) return;
    const vault = this.prefs.vault();
    const problem = (await checkVault(vault)) || checkLiteratureFolder(this.prefs.literatureFolder());
    if (stopped()) return;
    if (!problem) {
      if (cacheReset || vault !== cacheVault) indexCache.clear();
      cacheReset = false;
      cacheVault = vault;
      const literatureFolder = await realFolderCase(vault, this.prefs.literatureFolder());
      if (stopped()) return;
      const files = await listMarkdown(vault, this.prefs.exclude(), {
        isCurrent: (path, stamp) => isCached(indexCache, path, stamp, literatureFolder),
      });
      if (stopped()) return;
      this.state.index = buildIndex(files, { literatureFolder, cache: indexCache });
      this.state.literatureFolder = literatureFolder;
      this.state.error = null;
    } else {
      this.state.index = null;
      this.state.literatureFolder = null;
      this.state.error = problem;
      this.log(problem);
    }
    await this.loadLinks(thisRun);
    if (stopped()) return;
    const keys = await scanKeys(this);
    if (stopped()) return;
    this.state.keys = keys;
    Zotero.debug(`gam: index ${this.state.index ? this.state.index.citekeys().size : 0} literature notes, `
      + `${this.state.links.size} items with obsidian links`);
    this.notifyRefresh();
  },

  /** The obsidian:// links of the child notes, by parent item ID. */
  async loadLinks(thisRun = run) {
    const rows = await Zotero.DB.queryAsync(
      "SELECT itemID, parentItemID AS parentID, note FROM itemNotes WHERE parentItemID IS NOT NULL "
      + "AND note LIKE ? AND itemID NOT IN (SELECT itemID FROM deletedItems) "
      + "AND parentItemID NOT IN (SELECT itemID FROM deletedItems)",
      ["%obsidian://open%"],
    );
    if (thisRun !== run) return;
    const links = new Map();
    const ids = new Set();
    for (const row of rows || []) {
      ids.add(row.itemID);
      const found = parseUris(row.note);
      if (!found.length) continue;
      if (!links.has(row.parentID)) links.set(row.parentID, []);
      links.get(row.parentID).push(...found);
    }
    this.state.links = links;
    knownNoteIDs = ids;
  },

  scheduleLinks() {
    clearTimeout(linksTimer);
    linksTimer = setTimeout(() => {
      this.loadLinks().then(() => this.notifyRefresh()).catch((e) => Zotero.logError(e));
    }, 1000);
  },

  notifyRefresh() {
    const signature = columnSignature(this.state.index, this.state.links);
    const columnChanged = signature !== lastSignature;
    lastSignature = signature;
    for (const fn of this.onRefresh) {
      try {
        fn({ columnChanged });
      } catch (e) {
        Zotero.logError(e);
      }
    }
  },
};
