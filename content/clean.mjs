// Clean titles and filenames in Zotero. gam changes the case of a title only after the window
// "Clean library"; the safe fixes of new items are automatic (setting).

import { safeFix } from "./lib/title.mjs";
import { buildEvidence } from "./lib/case.mjs";
import { planTitle, planFile, needsNotice, newShortTitle, ignoreKey } from "./lib/plan-clean.mjs";
import { loadIgnored, saveIgnored, appendLog, loadTerms } from "./clean-store.mjs";
import { canChange } from "./ui/common.mjs";
import { shortTitle } from "./keys.mjs";
import { exclusive } from "./queue.mjs";
import { notify } from "./notify.mjs";

/** The largest batch of new items that gam cleans without the window. */
export const AUTO_CLEAN_MAX = 20;

const ABSTRACTS_SQL = "SELECT value FROM itemData JOIN itemDataValues USING (valueID) "
  + "JOIN fieldsCombined USING (fieldID) JOIN items USING (itemID) WHERE fieldName = ? AND libraryID = ?";

/** The words that the abstracts of a library have in lower case (see lib/case.mjs). */
export async function libraryEvidence(Gam, libraryID) {
  return buildEvidence((await Gam.Zotero.DB.columnQueryAsync(ABSTRACTS_SQL, ["abstractNote", libraryID])) || []);
}

function field(item, name) {
  try {
    return item.getField(name) || "";
  } catch {
    return "";
  }
}

/** True for a regular item that gam can clean. */
function canClean(item) {
  return !!item?.isRegularItem?.() && canChange(item) && item.library?.libraryType !== "feed";
}

/** What planTitle needs of an item. */
function titleData(Zotero, item) {
  return {
    id: item.id,
    libraryID: item.libraryID,
    key: item.key,
    type: Zotero.ItemTypes.getName(item.itemTypeID),
    title: field(item, "title"),
    language: field(item, "language"),
    abstract: field(item, "abstractNote"),
  };
}

/** Add one write to the log. A log that cannot be written does not stop the write. */
async function logWrite(Gam, item, name, from, to) {
  try {
    await appendLog(Gam.Zotero.DataDirectory.dir,
      { date: new Date().toISOString(), libraryID: item.libraryID, key: item.key, field: name, old: from, new: to });
  } catch (e) {
    Gam.Zotero.logError(e);
  }
}

/**
 * Write a title, and the short title when it is the start of the old title. Returns "changed", and
 * writes nothing, when the item does not have the title from any more or has changes that are not saved.
 */
export async function writeTitle(Gam, item, from, to) {
  if (field(item, "title") !== from || item.hasChanged?.()) return "changed";
  const short = field(item, "shortTitle");
  const nextShort = newShortTitle(from, to, short);
  try {
    item.setField("title", to);
    if (nextShort !== short) item.setField("shortTitle", nextShort);
    await item.saveTx();
  } catch (e) {
    // The item object must not keep a title that is not in the database.
    item.setField("title", from);
    if (nextShort !== short) item.setField("shortTitle", short);
    throw e;
  }
  await logWrite(Gam, item, "title", from, to);
  if (nextShort !== short) await logWrite(Gam, item, "shortTitle", short, nextShort);
  return "written";
}

/**
 * Make the safe fixes in the titles of new items (the setting "Clean the titles of new items"), and give
 * one notice when titles need a check in the window. More than AUTO_CLEAN_MAX items: one notice, no write.
 * Returns the number of titles that were fixed and that need a check.
 */
export function autoTitles(Gam, ids) {
  if (!Gam.prefs.cleanNew()) return Promise.resolve({ fixed: 0, toCheck: 0 });
  return exclusive(() => autoTitlesNow(Gam, ids));
}

async function autoTitlesNow(Gam, ids) {
  const Zotero = Gam.Zotero;
  const items = (Zotero.Items.get(ids) || []).filter((i) => canClean(i) && field(i, "title").trim());
  if (!items.length) return { fixed: 0, toCheck: 0 };
  if (items.length > AUTO_CLEAN_MAX) {
    notify(Zotero, `${items.length} new items. gam cleans at most ${AUTO_CLEAN_MAX} new titles at once.\n`
      + "Use Tools > Clean library…", false);
    return { fixed: 0, toCheck: 0 };
  }
  const entries = items.map((item) => ({ item, data: titleData(Zotero, item) }));
  const { terms } = await loadTerms(Gam.prefs.termsFile(), Gam.homeDir);
  const { keys: ignored } = await loadIgnored(Zotero.DataDirectory.dir);
  const evidence = new Map();
  for (const { data } of entries) {
    if (!evidence.has(data.libraryID)) evidence.set(data.libraryID, await libraryEvidence(Gam, data.libraryID));
  }
  let fixed = 0;
  let toCheck = 0;
  for (const { item, data } of entries) {
    try {
      const to = safeFix(data.title);
      if (to !== data.title) {
        if (await writeTitle(Gam, item, data.title, to) !== "written") continue;
        fixed += 1;
      }
      const row = planTitle({ ...data, title: to }, { userTerms: terms, evidence: evidence.get(data.libraryID), ignored });
      if (needsNotice(row)) toCheck += 1;
    } catch (e) {
      Zotero.logError(e);
    }
  }
  if (toCheck) notify(Zotero, `${toCheck} new title${toCheck === 1 ? "" : "s"} to check: Tools > Clean library…`);
  return { fixed, toCheck };
}

/** True for a PDF or EPUB without a parent item that gam can change. */
export function isOrphan(Zotero, item) {
  return !!item && !item.isRegularItem?.() && canChange(item) && item.library?.libraryType !== "feed"
    && !!Zotero.RecognizeDocument.canRecognize(item);
}

/** The name that Zotero's template gives a file of parent (an item, or a copy with another title). */
function templateName(Zotero, file, parent) {
  const base = Zotero.Attachments.getFileBaseNameFromItem(parent, { attachmentTitle: field(file, "title") });
  const ext = Zotero.Attachments.getCorrectFileExtension(file);
  return base ? Zotero.File.getValidFileName(base + (ext ? `.${ext}` : "")) : "";
}

/** The file row of an item, or null. Only the file that Zotero itself renames: the best attachment. */
async function planFileOf(Zotero, item, ignored) {
  if (!item.numAttachments()) return null;
  const file = await item.getBestAttachment();
  if (!file || file.isLinkedFileAttachment() || !canChange(file)) return null;
  if (!Zotero.Attachments.shouldAutoRenameAttachment(file)) return null;
  // Without a file on disk there is no correct extension, and nothing to rename.
  if (!(await file.getFilePathAsync())) return null;
  const row = planFile({
    id: file.id, libraryID: file.libraryID, key: file.key, parentID: item.id,
    current: file.attachmentFilename, template: templateName(Zotero, file, item), ignored,
  });
  if (!row) return null;
  return {
    ...row,
    title: field(item, "title"),
    // The name for an edited title. The copy of the item is never saved.
    templateFor: (title) => {
      const copy = item.clone(null, { skipTags: true, includeCollections: false });
      copy.setField("title", title);
      return templateName(Zotero, file, copy);
    },
  };
}

const byText = (get) => (a, b) => get(a).localeCompare(get(b), "en", { sensitivity: "base" });

/**
 * The rows of the window "Clean library": {titles, suggestions, files, orphans, errors}. It writes nothing.
 * A file row has templateFor(title): the new name when the title of its item changes.
 */
export async function planLibrary(Gam, items, { orphans }) {
  const Zotero = Gam.Zotero;
  const dir = Zotero.DataDirectory.dir;
  const { terms, error: termsError } = await loadTerms(Gam.prefs.termsFile(), Gam.homeDir);
  const { keys: ignored, error: ignoredError } = await loadIgnored(dir);
  const list = items.filter(canClean);
  await Zotero.Items.loadDataTypes?.(list, ["itemData", "creators", "childItems"]);
  const evidence = new Map();
  const plan = { titles: [], suggestions: [], files: [], orphans: [], errors: [termsError, ignoredError].filter(Boolean) };
  for (const item of list) {
    try {
      if (!evidence.has(item.libraryID)) evidence.set(item.libraryID, await libraryEvidence(Gam, item.libraryID));
      const row = planTitle(titleData(Zotero, item), { userTerms: terms, evidence: evidence.get(item.libraryID), ignored });
      if (row) plan[row.kind === "title" ? "titles" : "suggestions"].push(row);
      const file = await planFileOf(Zotero, item, ignored);
      if (file) plan.files.push(file);
    } catch (e) {
      Zotero.logError(e);
    }
  }
  plan.orphans = orphans.filter((o) => isOrphan(Zotero, o)).map((o) => ({ id: o.id, name: o.attachmentFilename || field(o, "title") }));
  plan.titles.sort(byText((r) => r.from));
  plan.suggestions.sort(byText((r) => r.from));
  plan.files.sort(byText((r) => r.from));
  plan.orphans.sort(byText((r) => r.name));
  return plan;
}

// The notice has one line for each problem: not more than this.
const MAX_ERRORS = 5;

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const quoted = (text) => `"${shortTitle(text)}"`;
const changedError = (text) => `${quoted(text)} changed after the list was made. gam did not change it.`;

/** Write the chosen titles, then rename the chosen files. Returns {titles, files, errors}. */
async function applyChoices(Gam, plan, choices, objects) {
  const Zotero = Gam.Zotero;
  const done = { titles: 0, files: 0, errors: [] };
  const titleRows = new Map([...plan.titles, ...plan.suggestions].map((r) => [r.id, r]));
  for (const { id, to } of choices.titles) {
    const row = titleRows.get(id);
    const title = String(to ?? "").normalize("NFC").trim();
    if (!row || !title || title === row.from) continue;
    try {
      const item = objects.get(id);
      if (canClean(item) && await writeTitle(Gam, item, row.from, title) === "written") done.titles += 1;
      else done.errors.push(changedError(row.from));
    } catch (e) {
      done.errors.push(`${quoted(row.from)}: ${e.message || e}`);
    }
  }
  const fileRows = new Map(plan.files.map((r) => [r.id, r]));
  for (const id of choices.files) {
    const row = fileRows.get(id);
    if (!row) continue;
    try {
      const [file] = Zotero.Items.get([id]);
      if (!file || !canChange(file) || file.attachmentFilename !== row.from || file.parentID !== row.parentID) {
        done.errors.push(changedError(row.from));
      } else if (!(await file.getFilePathAsync())) {
        done.errors.push(`${quoted(row.from)}: the file is not on this computer.`);
      } else {
        await Gam.renameFileFromParent(file);
        if (file.attachmentFilename === row.from) {
          done.errors.push(`${quoted(row.from)} was not renamed.`);
        } else {
          done.files += 1;
          await logWrite(Gam, file, "filename", row.from, file.attachmentFilename);
        }
      }
    } catch (e) {
      done.errors.push(`${quoted(row.from)}: ${e.message || e}`);
    }
  }
  return done;
}

/** Start Zotero's lookup for files without a parent; after it, show the ones that it did not identify. */
async function lookUp(Gam, files) {
  const Zotero = Gam.Zotero;
  const done = Zotero.RecognizeDocument.recognizeItems(files);
  Zotero.ProgressQueues.get("recognize")?.getDialog().open();
  await done;
  const left = files.filter((f) => isOrphan(Zotero, f));
  if (!left.length) return;
  notify(Zotero, `${left.length === 1 ? "1 file still has" : `${left.length} files still have`} no parent item.\n`
    + "Use Create Parent Item in the menu of the file.", false);
  const win = Zotero.getMainWindow();
  if (win?.Zotero_Tabs?.selectedID === "zotero-pane") await win.ZoteroPane.selectItems(left.map((f) => f.id));
}

// True while the window is open or its choices are written: a second one stops.
let cleaning = false;

/**
 * Clean items and files without a parent, after the window. confirm(plan) returns the choices
 * {titles: [{id, to}], files: [id], lookups: [id], ignored: [{kind, id}], createParent: id or null},
 * or {cancelled: true, ignored}, or null.
 * Returns {titles, files, lookups, errors, cancelled, lookupsDone}; lookupsDone is a Promise.
 */
export async function cleanItems(Gam, items, { name = "", orphans = [], confirm }) {
  const Zotero = Gam.Zotero;
  const nothing = { titles: 0, files: 0, lookups: 0, errors: [], cancelled: true, lookupsDone: Promise.resolve() };
  if (cleaning) {
    notify(Zotero, "Clean library is already open.", false);
    return nothing;
  }
  cleaning = true;
  try {
    return await cleanNow(Gam, items, { name, orphans, confirm, nothing });
  } finally {
    cleaning = false;
  }
}

async function cleanNow(Gam, items, { name, orphans, confirm, nothing }) {
  const Zotero = Gam.Zotero;
  const plan = await planLibrary(Gam, items, { orphans });
  if (![plan.titles, plan.suggestions, plan.files, plan.orphans].some((rows) => rows.length)) {
    notify(Zotero, [`Nothing to clean in ${name || "the library"}.`, ...plan.errors].join("\n"), !plan.errors.length);
    return { ...nothing, errors: plan.errors };
  }
  const choices = await confirm(plan);
  if (!choices) return nothing;

  const objects = new Map(items.map((i) => [i.id, i]));
  const errors = [];
  const ignoreError = await saveIgnored(Zotero.DataDirectory.dir, ignoredKeys(Zotero, plan, choices.ignored || []));
  if (ignoreError) errors.push(ignoreError);
  if (choices.cancelled) {
    if (ignoreError) notify(Zotero, ignoreError, false);
    return { ...nothing, errors };
  }
  if (choices.createParent) {
    if (ignoreError) notify(Zotero, ignoreError, false);
    const pane = Zotero.getActiveZoteroPane();
    await pane.selectItem(choices.createParent);
    await pane.createParentItemsFromSelected();
    return { ...nothing, errors, cancelled: false };
  }

  const done = await exclusive(() => applyChoices(Gam, plan, choices, objects));
  errors.push(...done.errors);
  const offered = new Set(plan.orphans.map((o) => o.id));
  const files = (Zotero.Items.get(choices.lookups.filter((id) => offered.has(id))) || []).filter((f) => isOrphan(Zotero, f));
  const changed = [done.titles && plural(done.titles, "title"), done.files && plural(done.files, "filename")].filter(Boolean);
  const summary = changed.length ? [`${changed.join(" and ")} changed.`] : files.length ? [] : ["Nothing changed."];
  const more = errors.length - MAX_ERRORS;
  const shown = [...errors.slice(0, MAX_ERRORS), ...(more > 0 ? [`${plural(more, "more problem")}.`] : [])];
  if (summary.length || errors.length) notify(Zotero, [...summary, ...shown].join("\n"), !errors.length);
  // Not awaited: without a network, the lookup does not end.
  const lookupsDone = files.length ? lookUp(Gam, files).catch((e) => Zotero.logError(e)) : Promise.resolve();
  return { titles: done.titles, files: done.files, lookups: files.length, errors, cancelled: false, lookupsDone };
}

/** The entries of the ignore file for the rows {kind, id}. */
function ignoredKeys(Zotero, plan, rows) {
  const lists = { title: plan.titles, suggestion: plan.suggestions, file: plan.files };
  return rows.flatMap(({ kind, id }) => {
    const row = lists[kind]?.find((r) => r.id === id);
    const [item] = row ? Zotero.Items.get([id]) || [] : [];
    return item ? [ignoreKey({ libraryID: item.libraryID, key: item.key, kind, value: row.from })] : [];
  });
}
