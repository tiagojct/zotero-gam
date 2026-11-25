// The data files of "Clean library" in the Zotero data folder: the ignored rows and the log of the
// writes. And the terms file of the user, which gam only reads. Uses IOUtils.

import { joinPath, expandHome } from "./lib/paths.mjs";
import { parseTerms } from "./lib/terms.mjs";

const IGNORED = "gam-ignored.json";
const LOG = "gam-clean.jsonl";

/** The ignored rows: {keys: Set, error}. A file that cannot be read gives no keys and an error text. */
export async function loadIgnored(dir) {
  const path = joinPath(dir, IGNORED);
  try {
    if (!(await IOUtils.exists(path))) return { keys: new Set(), error: null };
    const data = JSON.parse(await IOUtils.readUTF8(path));
    const valid = data?.version === 1 && Array.isArray(data.keys) && data.keys.every((k) => typeof k === "string");
    if (!valid) throw new Error("it does not have the format that gam writes");
    return { keys: new Set(data.keys), error: null };
  } catch (e) {
    return { keys: new Set(), error: `gam cannot read ${path} (${e.message || e}). Ignored rows show again.` };
  }
}

/**
 * Add rows to the ignored ones. The file is read again first, and a file that cannot be read is not
 * changed. Returns null, or an error text.
 */
export async function saveIgnored(dir, addedKeys) {
  if (!addedKeys.length) return null;
  const path = joinPath(dir, IGNORED);
  const { keys, error } = await loadIgnored(dir);
  if (error) return error;
  for (const k of addedKeys) keys.add(k);
  try {
    const text = `${JSON.stringify({ version: 1, keys: [...keys].sort() }, null, 1)}\n`;
    await IOUtils.writeUTF8(path, text, { tmpPath: `${path}.tmp` });
    return null;
  } catch (e) {
    return `gam cannot write ${path} (${e.message || e}). The ignored rows show again.`;
  }
}

/** Add one write to the log: {date, libraryID, key, field, old, new}. It fails when the log cannot be written. */
export async function appendLog(dir, entry) {
  await IOUtils.writeUTF8(joinPath(dir, LOG), `${JSON.stringify(entry)}\n`, { mode: "appendOrCreate" });
}

let cached = { stamp: null, terms: [] };
const NO_TERMS = [];

/** The terms of the user's file: {terms, error}. The file is read again only when it changed. */
export async function loadTerms(path, homeDir) {
  const set = String(path ?? "").trim();
  if (!set) return { terms: NO_TERMS, error: null };
  const full = expandHome(set, homeDir);
  try {
    const { lastModified, size } = await IOUtils.stat(full);
    const stamp = `${full}\n${lastModified}\n${size}`;
    if (cached.stamp !== stamp) cached = { stamp, terms: parseTerms(await IOUtils.readUTF8(full)) };
    return { terms: cached.terms, error: null };
  } catch (e) {
    return { terms: NO_TERMS, error: `Terms file: gam cannot read ${full} (${e.message || e}).` };
  }
}
