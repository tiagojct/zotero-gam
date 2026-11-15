// The vault state of one item. Pure module: no Zotero or browser globals.

/**
 * kind "note": the item has a literature note in the index.
 * kind "missing": the item has an obsidian:// link into this vault, but the file does not exist.
 * kind "none": no note (also when the vault was not found: index is null).
 */
export function noteState({ index, links, vaultName, citekey, itemKey }) {
  if (!index) return { kind: "none" };
  const note = index.noteFor({ citekey, itemKey });
  if (note) return { kind: "note", note };
  const vault = String(vaultName).toLowerCase();
  const gone = (links || []).find((l) => l.vault.toLowerCase() === vault && !index.hasPath(l.file));
  if (gone) return { kind: "missing", missingPath: gone.file };
  return { kind: "none" };
}

const nfc = (s) => String(s ?? "").normalize("NFC");

/**
 * What the item lacks for the literature note that the index has for it:
 * childNote: no obsidian:// link of this vault goes to the note;
 * citekey: the citekey of the note, when the item has no citekey (else null).
 * Returns {note, childNote, citekey}, or null when there is no note or nothing is missing.
 */
export function missingLinks({ index, links, vaultName, citekey, itemKey }) {
  const note = index?.noteFor({ citekey, itemKey });
  if (!note) return null;
  const vault = String(vaultName).toLowerCase();
  const linked = (links || []).some((l) => l.vault.toLowerCase() === vault && nfc(l.file) === nfc(note.path));
  const key = citekey ? null : note.citekey;
  if (linked && !key) return null;
  return { note, childNote: !linked, citekey: key };
}

export function columnText(state) {
  if (state.kind === "note") return state.note.status || "no status";
  if (state.kind === "missing") return "missing";
  return "";
}

/**
 * A string that changes only when a value in the Note column can change:
 * the status of a literature note, or whether a linked file exists.
 */
export function columnSignature(index, links) {
  if (!index) return "";
  const parts = index.notes().map((n) => `n\t${n.path}\t${n.citekey}\t${n.itemKey}\t${n.status}`).sort();
  for (const [id, list] of links) {
    for (const l of list) parts.push(`l\t${id}\t${l.vault.toLowerCase()}\t${l.file}\t${index.hasPath(l.file)}`);
  }
  return parts.join("\n");
}

/** True when a Zotero item event can change the obsidian links: an event on a note. */
export function isNoteEvent(event, ids, getItem, knownNoteIDs) {
  if (event === "delete") return ids.some((id) => knownNoteIDs.has(id));
  if (!["add", "modify", "trash"].includes(event)) return false;
  return ids.some((id) => {
    const item = getItem(id);
    return !!item && item.isNote();
  });
}
