// What "Create note" writes, decided before any write. Pure module: no Zotero or browser globals.

import { baseKey, uniqueKey } from "./citekey.mjs";
import { noteFromItem } from "./template.mjs";
import { buildUri, childNoteHtml } from "./obsidian.mjs";
import { joinPath } from "./paths.mjs";

export const CHILD_NOTE_TEXT = "Literature note in the vault.";

export function localDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * json: the Zotero item JSON. existingKey: the item's citekey or null.
 * taken: the citekeys of the library and the vault (for a new key).
 * libraryPath: "library" for the user library, "groups/<id>" for a group.
 * Returns {citekey, newKey, relPath, text, uri, childHtml}. relPath is from the vault root.
 */
export function planNote({ json, itemKey, existingKey, taken, vaultName, literatureFolder, today, libraryPath = "library" }) {
  const citekey = existingKey || uniqueKey(baseKey(json), taken);
  const relPath = joinPath(literatureFolder, `${citekey}.md`).replace(/^\//, "");
  const uri = buildUri(vaultName, relPath);
  return {
    citekey,
    newKey: !existingKey,
    relPath,
    text: noteFromItem(json, { citekey, itemKey, today, libraryPath }),
    uri,
    childHtml: childNoteHtml(CHILD_NOTE_TEXT, uri, citekey),
  };
}
