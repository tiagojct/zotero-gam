// The plan for "Create notes for collection": what would be written, decided before any write.
// Pure module: no Zotero or browser globals.

import { planNote } from "./plan-note.mjs";
import { safeFileKey } from "./citekey.mjs";

/**
 * entries: [{id, title, json, itemKey, existingKey, libraryPath, skip}] in display order.
 *   skip is a reason (string) when the item must not get a note, else null. The caller decides
 *   that (note in the index, read-only item, ...).
 * taken: the citekeys of the library and the vault. The function does not change it.
 * hasPath(relPath): true when the vault has a file at the path (case and Unicode form ignored).
 *
 * Returns rows in the same order: {id, title, status, reason, citekey, newKey, relPath}.
 * status "create": the row has the citekey and the path that createNote writes. Citekeys that are
 * new in one batch do not collide with each other. status "skip": reason says why.
 */
export function planBatch(entries, { taken, hasPath, vaultName, literatureFolder, today }) {
  const used = new Set(taken);
  const paths = new Set();
  const rows = [];
  for (const e of entries) {
    const row = { id: e.id, title: e.title || "(no title)", status: "skip", reason: "", citekey: e.existingKey || "", newKey: false, relPath: "" };
    rows.push(row);
    if (e.skip) {
      row.reason = e.skip;
      continue;
    }
    if (e.existingKey && !safeFileKey(e.existingKey)) {
      row.reason = "have a citekey that cannot be a file name";
      continue;
    }
    const plan = planNote({
      json: e.json,
      itemKey: e.itemKey,
      existingKey: e.existingKey,
      taken: used,
      vaultName,
      literatureFolder,
      today,
      libraryPath: e.libraryPath,
    });
    const pathKey = plan.relPath.normalize("NFC").toLowerCase();
    if (paths.has(pathKey)) {
      row.citekey = plan.citekey;
      row.relPath = plan.relPath;
      row.reason = "share a citekey with another item";
      continue;
    }
    if (hasPath(plan.relPath)) {
      row.citekey = plan.citekey;
      row.relPath = plan.relPath;
      row.reason = "would use a file name that is in the vault";
      continue;
    }
    paths.add(pathKey);
    // A new key is taken from now on, so the next item gets another one.
    if (plan.newKey) used.add(plan.citekey);
    Object.assign(row, { status: "create", citekey: plan.citekey, newKey: plan.newKey, relPath: plan.relPath });
  }
  return rows;
}

/** A line for the notice: "3 skipped: 2 already have a note, 1 is read-only". */
export function skipSummary(rows) {
  const counts = new Map();
  for (const r of rows) if (r.status === "skip") counts.set(r.reason, (counts.get(r.reason) || 0) + 1);
  return [...counts].map(([reason, n]) => `${n} ${reason}`);
}
