// "Create note": write the literature note and the Zotero child note.

import { planNote, localDate, CHILD_NOTE_TEXT } from "./lib/plan-note.mjs";
import { joinPath } from "./lib/paths.mjs";
import { buildUri, childNoteHtml } from "./lib/obsidian.mjs";
import { missingLinks } from "./lib/state.mjs";
import { createFile } from "./vault.mjs";
import { openInObsidian } from "./ui/common.mjs";

/** The citekeys in the library: the native field and "Citation Key:" lines in Extra. */
async function libraryCitekeys(Zotero) {
  const keys = new Set();
  const native = await Zotero.DB.columnQueryAsync(
    "SELECT value FROM itemData JOIN itemDataValues USING (valueID) JOIN fieldsCombined USING (fieldID) "
    + "WHERE fieldName = ?", ["citationKey"]);
  for (const v of native || []) keys.add(String(v));
  const extras = await Zotero.DB.columnQueryAsync(
    "SELECT value FROM itemData JOIN itemDataValues USING (valueID) JOIN fieldsCombined USING (fieldID) "
    + "WHERE fieldName = ? AND value LIKE ?", ["extra", "%citation key%"]);
  for (const v of extras || []) {
    for (const m of String(v).matchAll(/^\s*citation key\s*:\s*(\S+)\s*$/gim)) keys.add(m[1]);
  }
  return keys;
}

/** Store a new citekey: the native field when the item type has it, else a first line in Extra. */
async function saveCitekey(Zotero, item, key) {
  const fieldID = Zotero.ItemFields.getID("citationKey");
  if (fieldID && Zotero.ItemFields.isValidForType(fieldID, item.itemTypeID)) {
    item.setField("citationKey", key);
  } else {
    const lines = String(item.getField("extra") || "").split("\n").filter((l) => !/^\s*citation key\s*:/i.test(l));
    item.setField("extra", [`Citation Key: ${key}`, ...lines].join("\n").trim());
  }
  await item.saveTx();
}

function notify(Zotero, message, ok = true) {
  const pw = new Zotero.ProgressWindow();
  pw.changeHeadline("gam");
  pw.addDescription(message);
  pw.show();
  pw.startCloseTimer(ok ? 4000 : 8000);
}

/** A citekey that is safe as a file name inside the literature folder. */
function safeFileKey(key) {
  return /^[^/\\\0]+$/.test(key) && !key.startsWith(".");
}

/** Throws with a message for the user when gam must not change the item. */
function checkItem(Gam, item) {
  if (!item?.isRegularItem()) throw new Error("Notes can only be made for regular items.");
  if (!Gam.state.index) throw new Error(Gam.state.error || "The vault index is not ready.");
  if (item.isInTrash?.()) throw new Error("This item is in the trash. Nothing was written.");
  if (item.library && !item.library.editable || item.isEditable && !item.isEditable()) {
    throw new Error("This item cannot be changed (read-only library or item). Nothing was written.");
  }
}

/** Add the child note with the obsidian:// link (and the marker tag) to item. */
async function addChildNote(Gam, item, html) {
  const note = new Gam.Zotero.Item("note");
  note.libraryID = item.libraryID;
  note.parentID = item.id;
  note.setNote(html);
  const marker = Gam.prefs.marker();
  if (marker) note.addTag(marker);
  await note.saveTx();
}

/**
 * Create the note for one item. Returns {path, citekey, openError}. Throws with a message for the user.
 * openError is the message when the note was made but Obsidian did not open it, else null.
 * refresh: false when the caller refreshes once after several items.
 */
export async function createNote(Gam, item, { open = Gam.prefs.openAfterCreate(), quiet = false, refresh = true } = {}) {
  const Zotero = Gam.Zotero;
  checkItem(Gam, item);
  const { citekey: existingKey } = Gam.itemInfo(item);
  if (existingKey && !safeFileKey(existingKey)) {
    throw new Error(`The citekey "${existingKey}" cannot be used as a file name. Nothing was written.`);
  }
  const taken = existingKey ? new Set() : new Set([...(await libraryCitekeys(Zotero)), ...Gam.state.index.citekeys()]);
  const plan = planNote({
    json: item.toJSON(),
    itemKey: item.key,
    existingKey,
    taken,
    vaultName: Gam.prefs.vaultName(),
    // The folder of the index (the case on disk), so the new note is in the index after the refresh.
    literatureFolder: Gam.state.literatureFolder || Gam.prefs.literatureFolder(),
    today: localDate(),
    libraryPath: item.library?.libraryType === "group" ? `groups/${item.library.groupID}` : "library",
  });
  const abs = joinPath(Gam.prefs.vault(), plan.relPath);

  // The file first: if it exists, nothing in Zotero changes.
  await createFile(abs, plan.text);
  try {
    if (plan.newKey) await saveCitekey(Zotero, item, plan.citekey);
    const vault = Gam.prefs.vaultName().toLowerCase();
    const linked = (Gam.state.links.get(item.id) || [])
      .some((l) => l.vault.toLowerCase() === vault && l.file.normalize("NFC") === plan.relPath.normalize("NFC"));
    if (!linked) await addChildNote(Gam, item, plan.childHtml);
  } catch (e) {
    await Gam.refresh({ force: true });
    throw new Error(`The note file was written to ${plan.relPath}, but the change in Zotero failed: ${e.message || e}`);
  }

  if (refresh) await Gam.refresh({ force: true });
  let openError = null;
  if (open) {
    try {
      openInObsidian(Gam, plan.relPath);
    } catch (e) {
      openError = `Obsidian did not open the note: ${e.message || e}`;
    }
  }
  if (!quiet) notify(Zotero, [`Note created: ${plan.relPath}`, openError].filter(Boolean).join("\n"), !openError);
  return { path: plan.relPath, citekey: plan.citekey, openError };
}

/** Create notes for several items; report one summary. */
export async function createNotes(Gam, items) {
  const Zotero = Gam.Zotero;
  const regular = items.filter((i) => i.isRegularItem());
  let made = 0;
  const errors = [];
  const warnings = [];
  for (const item of regular) {
    try {
      const r = await createNote(Gam, item, { open: regular.length === 1 && Gam.prefs.openAfterCreate(), quiet: true, refresh: false });
      made += 1;
      if (r.openError) warnings.push(r.openError);
    } catch (e) {
      errors.push(e.message || String(e));
    }
  }
  await Gam.refresh({ force: true });
  const text = [`${made} note(s) created.`, ...errors, ...warnings].join("\n");
  notify(Zotero, text, errors.length === 0 && warnings.length === 0);
  return { made, errors, warnings };
}

/**
 * For an item whose literature note is in the index: add the missing child note with the
 * obsidian:// link, and set the citekey of the note when the item has none and no other item
 * has it. Writes nothing in the vault. Returns {childNote, citekey, warning}: what was added.
 */
export async function linkNote(Gam, item, { quiet = false, refresh = true } = {}) {
  const Zotero = Gam.Zotero;
  checkItem(Gam, item);
  const info = Gam.itemInfo(item);
  const missing = missingLinks({
    index: Gam.state.index,
    links: Gam.state.links.get(item.id) || [],
    vaultName: Gam.prefs.vaultName(),
    citekey: info.citekey,
    itemKey: info.itemKey,
  });
  if (!missing) return { childNote: false, citekey: null, warning: null };

  let citekey = null;
  let warning = null;
  if (missing.citekey) {
    const key = missing.citekey;
    if (!safeFileKey(key) || /\s/.test(key)) warning = `The citekey "${key}" of the note cannot be used, so it was not set.`;
    else if ((await libraryCitekeys(Zotero)).has(key)) warning = `The citekey "${key}" is used by another item, so it was not set.`;
    else citekey = key;
  }
  const path = missing.note.path;
  try {
    if (citekey) await saveCitekey(Zotero, item, citekey);
    if (missing.childNote) {
      const stem = path.split("/").pop().replace(/\.md$/, "");
      await addChildNote(Gam, item, childNoteHtml(CHILD_NOTE_TEXT, buildUri(Gam.prefs.vaultName(), path), stem));
    }
  } catch (e) {
    await Gam.refresh({ force: true });
    throw new Error(`The link to ${path} was not added: ${e.message || e}`);
  }
  if (refresh) await Gam.refresh({ force: true });
  if (!quiet) notify(Zotero, [`Linked to ${path}`, warning].filter(Boolean).join("\n"), !warning);
  return { childNote: missing.childNote, citekey, warning };
}

/** linkNote for several items; one refresh and one summary. */
export async function linkNotes(Gam, items) {
  const Zotero = Gam.Zotero;
  let linked = 0;
  const errors = [];
  const warnings = [];
  for (const item of items.filter((i) => i.isRegularItem())) {
    try {
      const r = await linkNote(Gam, item, { quiet: true, refresh: false });
      if (r.childNote || r.citekey) linked += 1;
      if (r.warning) warnings.push(r.warning);
    } catch (e) {
      errors.push(e.message || String(e));
    }
  }
  await Gam.refresh({ force: true });
  notify(Zotero, [`${linked} item(s) linked to their notes.`, ...errors, ...warnings].join("\n"),
    errors.length === 0 && warnings.length === 0);
  return { linked, errors, warnings };
}

export { notify };
