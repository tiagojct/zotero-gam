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

export function columnText(state) {
  if (state.kind === "note") return state.note.status || "no status";
  if (state.kind === "missing") return "missing";
  return "";
}
