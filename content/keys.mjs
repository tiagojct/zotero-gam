// Citation keys in Zotero: read them, give new ones, and watch for changes.
// gam never changes a key that exists. It gives a key only to an item that has none.

import { currentKey, yearOf } from "./lib/citekey.mjs";
import { planKeys, keyReport, reportLines, keyChanges, AUTO_KEY_MAX } from "./lib/keys.mjs";
import { skipSummary } from "./lib/plan-batch.mjs";
import { canChange } from "./ui/common.mjs";
import { notify } from "./notify.mjs";

const FIELDS_SQL = "SELECT itemID, fieldName, value FROM itemData JOIN itemDataValues USING (valueID) "
  + "JOIN fieldsCombined USING (fieldID) WHERE fieldName IN (?, ?)";

/** The citekeys in all libraries: the native field and "Citation Key:" lines in Extra. */
export async function libraryCitekeys(Zotero) {
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
export async function saveCitekey(Zotero, item, key) {
  const fieldID = Zotero.ItemFields.getID("citationKey");
  if (fieldID && Zotero.ItemFields.isValidForType(fieldID, item.itemTypeID)) {
    item.setField("citationKey", key);
  } else {
    const lines = String(item.getField("extra") || "").split("\n").filter((l) => !/^\s*citation key\s*:/i.test(l));
    item.setField("extra", [`Citation Key: ${key}`, ...lines].join("\n").trim());
  }
  await item.saveTx();
}

/**
 * The keys that a new key must not take: all libraries and the literature notes of the vault
 * (the citekey and the file name of each note, as zotero-local-mcp does). The notes are there in
 * lower case too: on macOS smith2020.md and Smith2020.md are the same file. Library keys keep their
 * case: Pandoc keys are case-sensitive.
 */
export async function takenKeys(Gam) {
  const index = Gam.state.index;
  const notes = [
    ...(index?.citekeys() || []),
    ...(index?.notes() || []).map((n) => n.path.split("/").pop().replace(/\.md$/, "")),
  ];
  return new Set([...(await libraryCitekeys(Gam.Zotero)), ...notes, ...notes.map((k) => k.toLowerCase())]);
}

// The key writers (automatic keys and "Citation keys") run one after the other, so each one
// plans with the keys that the one before it wrote.
let queue = Promise.resolve();
function exclusive(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

/** Keep the key watch current after a write, also during a scan (see Gam.scan). */
function remember(Gam, id, key) {
  Gam.state.keys?.set(id, key);
  Gam.state.keysTouched?.add(id);
}

/** Map of item ID to key, for every item that has a key (one query). */
export async function readAllKeys(Zotero) {
  const fields = new Map();
  for (const row of (await Zotero.DB.queryAsync(FIELDS_SQL, ["citationKey", "extra"])) || []) {
    if (!fields.has(row.itemID)) fields.set(row.itemID, {});
    fields.get(row.itemID)[row.fieldName] = row.value;
  }
  const keys = new Map();
  for (const [id, f] of fields) {
    const key = currentKey({ citationKey: f.citationKey, extra: f.extra });
    if (key) keys.set(id, key);
  }
  return keys;
}

function field(item, name) {
  try {
    return item.getField(name) || "";
  } catch {
    return "";
  }
}

const titleOf = (item) => field(item, "title") || "(no title)";

/** How the vault uses a key: {note: the literature note or null, cites: the number of notes that cite it}. */
function vaultUse(index, key) {
  return { note: index.noteFor({ citekey: key }), cites: index.citedCount({ citekey: key }) };
}

function useText({ note, cites }) {
  const parts = [];
  if (note) parts.push("the literature note");
  if (cites) parts.push(`${cites} note${cites === 1 ? "" : "s"} that cite${cites === 1 ? "s" : ""} it`);
  return parts.join(" and ");
}

/** A title for a notice: at most max characters. */
export function shortTitle(title, max = 60) {
  const t = String(title || "(no title)");
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/**
 * Compare the keys of the items ids with the last known keys. When an existing key changed (by hand,
 * by sync, or by another tool) and the vault uses the old key, show one notice. Returns the changes
 * that the vault uses: [{id, from, to, title, note, cites}].
 */
export function checkKeyChanges(Gam, ids) {
  const before = Gam.state.keys;
  if (!before) return [];
  const items = (Gam.Zotero.Items.get(ids) || []).filter((i) => i?.isRegularItem?.());
  const after = new Map(items.map((i) => [i.id, Gam.itemInfo(i).citekey || ""]));
  const changes = keyChanges(before, after, [...after.keys()]);
  for (const [id, key] of after) {
    if (key) before.set(id, key);
    else before.delete(id);
    Gam.state.keysTouched?.add(id);
  }
  if (!changes.length) return [];
  const index = Gam.state.index;
  const byId = new Map(items.map((i) => [i.id, i]));
  const used = changes
    .map((c) => ({ ...c, title: titleOf(byId.get(c.id)), ...(index ? vaultUse(index, c.from) : { note: null, cites: 0 }) }))
    .filter((c) => !index || c.note || c.cites);
  if (!used.length) return [];
  const lines = used.slice(0, 3).flatMap((c) => [
    c.to ? `Citation key changed: ${c.from} to ${c.to}` : `Citation key removed: ${c.from}`,
    `"${shortTitle(c.title)}"`,
    index ? `The vault uses ${c.from}: ${useText(c)}.` : "gam cannot check the vault now.",
  ]);
  if (used.length > 3) lines.push(`${used.length - 3} more keys changed.`);
  lines.push("Change the key back, or update the vault.");
  notify(Gam.Zotero, lines.join("\n"), false);
  return used;
}

/**
 * True when the metadata of json is enough for a key that stays right: a year and a creator or a
 * title. "New Item" saves an empty item at once; its key would be anonnd and would not change later.
 */
export function readyForKey(json) {
  return !!yearOf(json) && ((json.creators?.length ?? 0) > 0 || !!String(json.title ?? "").trim());
}

/**
 * Give keys to new items (the setting "Give new items a citation key"). Only regular, editable
 * items that still have no key and have a year and a creator or a title (see readyForKey; the others
 * get a key in Tools > Citation keys). More than AUTO_KEY_MAX items: nothing is written, one notice.
 * Returns the keys that were given.
 */
export function autoKeys(Gam, ids) {
  if (!Gam.prefs.autoKey()) return Promise.resolve([]);
  return exclusive(() => autoKeysNow(Gam, ids));
}

async function autoKeysNow(Gam, ids) {
  const Zotero = Gam.Zotero;
  const items = (Zotero.Items.get(ids) || []).filter((i) => i?.isRegularItem?.() && canChange(i)
    && i.library?.libraryType !== "feed" && !Gam.itemInfo(i).citekey && readyForKey(i.toJSON()));
  if (!items.length) return [];
  if (items.length > AUTO_KEY_MAX) {
    notify(Zotero, `${items.length} new items have no citation key. gam gives keys automatically to at most `
      + `${AUTO_KEY_MAX} items at once. Use Tools > Citation keys… to give them keys.`, false);
    return [];
  }
  const rows = planKeys(items.map((i) => ({ id: i.id, title: titleOf(i), json: i.toJSON(), existingKey: null, skip: null })),
    await takenKeys(Gam));
  const byId = new Map(items.map((i) => [i.id, i]));
  const given = [];
  for (const row of rows) {
    const item = byId.get(row.id);
    // The item can have a key now (another tool, a sync): gam does not change it.
    if (row.status !== "assign" || Gam.itemInfo(item).citekey) continue;
    try {
      await saveCitekey(Zotero, item, row.citekey);
      remember(Gam, row.id, row.citekey);
      given.push(row.citekey);
    } catch (e) {
      Zotero.logError(e);
    }
  }
  if (given.length) {
    notify(Zotero, given.length === 1 ? `New item: citation key ${given[0]}.` : `New items: citation keys ${given.join(", ")}.`);
  }
  return given;
}

// True while "Citation keys" runs: a second one stops.
let assigning = false;

/**
 * Give keys to the items that have none, after a preview. confirm(preview) returns the ids of the
 * rows to write, or null. preview: {name, rows: [{id, title, citekey}], skipped, problems}.
 * Before each write, gam checks again that the item has no key and that the key is free.
 * Returns {assigned, errors, cancelled}.
 */
export async function assignKeys(Gam, items, { name = "", confirm }) {
  const Zotero = Gam.Zotero;
  const stop = (message, ok) => {
    notify(Zotero, message, ok);
    return { assigned: 0, errors: ok ? [] : [message], cancelled: true };
  };
  if (assigning) return stop("Citation keys: a batch is still running.", false);
  assigning = true;
  try {
    return await exclusive(() => assignKeysNow(Gam, items, confirm, name, stop));
  } finally {
    assigning = false;
  }
}

async function assignKeysNow(Gam, items, confirm, name, stop) {
  const Zotero = Gam.Zotero;
  const regular = items.filter((i) => i?.isRegularItem?.());
  const problems = reportLines(keyReport(regular.map((i) => ({
    id: i.id, title: titleOf(i), native: field(i, "citationKey"), extra: field(i, "extra"),
  }))));
  const rows = planKeys(regular.map((i) => ({
    id: i.id,
    title: titleOf(i),
    json: i.toJSON(),
    existingKey: Gam.itemInfo(i).citekey || null,
    skip: canChange(i) ? null : "cannot be changed",
  })), await takenKeys(Gam));
  const toAssign = rows.filter((r) => r.status === "assign");
  if (!toAssign.length && !problems.length) {
    return stop(`${regular.length === 1 ? "The item has" : `All ${regular.length} items have`} a citation key. No problems found.`, true);
  }
  const chosen = await confirm({ name, rows: toAssign, skipped: skipSummary(rows), problems });
  if (!chosen?.length) return { assigned: 0, errors: [], cancelled: true };

  const wanted = new Set(chosen);
  const byId = new Map(regular.map((i) => [i.id, i]));
  const taken = await takenKeys(Gam);
  let assigned = 0;
  const errors = [];
  for (const row of toAssign) {
    if (!wanted.has(row.id)) continue;
    const item = byId.get(row.id);
    const now = Gam.itemInfo(item).citekey;
    if (now) {
      errors.push(`"${row.title}" has the key ${now} now. gam did not change it.`);
      continue;
    }
    if (taken.has(row.citekey)) {
      errors.push(`${row.citekey} is used now, after the preview. "${row.title}" got no key.`);
      continue;
    }
    try {
      await saveCitekey(Zotero, item, row.citekey);
      taken.add(row.citekey);
      remember(Gam, row.id, row.citekey);
      assigned += 1;
    } catch (e) {
      errors.push(`"${row.title}": ${e.message || e}`);
    }
  }
  notify(Zotero, [`${assigned} citation key${assigned === 1 ? "" : "s"} assigned.`, ...errors].join("\n"), errors.length === 0);
  return { assigned, errors, cancelled: false };
}
