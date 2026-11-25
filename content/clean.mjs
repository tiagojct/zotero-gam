// Clean titles and filenames in Zotero. gam changes the case of a title only after the window
// "Clean library"; the safe fixes of new items are automatic (setting).

import { safeFix } from "./lib/title.mjs";
import { buildEvidence } from "./lib/case.mjs";
import { planTitle, needsNotice, newShortTitle } from "./lib/plan-clean.mjs";
import { loadIgnored, appendLog, loadTerms } from "./clean-store.mjs";
import { canChange } from "./ui/common.mjs";
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
