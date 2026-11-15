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

const key = (s) => String(s ?? "").normalize("NFC").toLowerCase();

/**
 * True when one of links (obsidian:// links, {vault, file}) opens the note at notePath in this vault:
 * the same path in any case or Unicode form, or a link with the file name only (Obsidian finds it).
 */
export function linksTo(links, vaultName, notePath) {
  const vault = key(vaultName);
  const path = key(notePath);
  const name = path.split("/").pop();
  return (links || []).some((l) => key(l.vault) === vault && (key(l.file) === path || key(l.file) === name));
}

/**
 * What the item lacks for the literature note that the index has for it. Returns null when there
 * is no note, when the note names another Zotero item, or when a link to the note exists.
 * Else {note, childNote: true, citekey}: citekey is the citekey of the note when the item has
 * none (gam sets it with the link), else null. A missing citekey alone does not count: gam may
 * not be able to set it (another item has it), and the action would then never go away.
 */
export function missingLinks({ index, links, vaultName, citekey, itemKey }) {
  const note = index?.noteFor({ citekey, itemKey });
  if (!note) return null;
  if (note.itemKey && itemKey && note.itemKey !== itemKey) return null;
  if (linksTo(links, vaultName, note.path)) return null;
  return { note, childNote: true, citekey: citekey ? null : note.citekey };
}

export function columnText(state) {
  if (state.kind === "note") return state.note.status || "no status";
  if (state.kind === "missing") return "missing";
  return "";
}

/**
 * A string that changes only when a value in the Note or "Cited in" column can change:
 * the status of a literature note, whether a linked file exists, or the references in the vault.
 */
export function columnSignature(index, links) {
  if (!index) return "";
  const parts = [`r\t${index.refsSignature()}`];
  parts.push(...index.notes().map((n) => `n\t${n.path}\t${n.citekey}\t${n.itemKey}\t${n.status}`).sort());
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

const CITED_WIDTH = 5;

/**
 * The data of the "Cited in" column: the count with leading zeros, so that Zotero sorts the
 * column as numbers whatever its collation setting. "" when there is no count.
 */
export function citedData(count) {
  if (!Number.isInteger(count) || count < 0) return "";
  return String(count).padStart(CITED_WIDTH, "0");
}

/** The text of a "Cited in" cell: the count without the leading zeros. */
export function citedText(data) {
  return /^\d+$/.test(String(data ?? "")) ? String(Number(data)) : "";
}
