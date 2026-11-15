// Helpers that the column, the pane and the menus share.

import { noteState as pureNoteState, missingLinks as pureMissingLinks } from "../lib/state.mjs";
import { buildUri } from "../lib/obsidian.mjs";

/** The vault state of a Zotero item (see lib/state.mjs). */
export function noteState(Gam, item) {
  if (!item?.isRegularItem?.()) return { kind: "none" };
  const { citekey, itemKey } = Gam.itemInfo(item);
  return pureNoteState({
    index: Gam.state.index,
    links: Gam.state.links.get(item.id) || [],
    vaultName: Gam.prefs.vaultName(),
    citekey,
    itemKey,
  });
}

/** True when gam can change item: not in the trash, and not in a read-only library. */
export function canChange(item) {
  if (item?.isInTrash?.()) return false;
  if (item?.library && !item.library.editable) return false;
  return !item?.isEditable || item.isEditable();
}

/** What a Zotero item lacks for its literature note (see lib/state.mjs), or null. */
export function missingLinks(Gam, item) {
  if (!item?.isRegularItem?.()) return null;
  const { citekey, itemKey } = Gam.itemInfo(item);
  return pureMissingLinks({
    index: Gam.state.index,
    links: Gam.state.links.get(item.id) || [],
    vaultName: Gam.prefs.vaultName(),
    citekey,
    itemKey,
  });
}

/** Open a vault note (path from the vault root) in Obsidian. */
export function openInObsidian(Gam, relPath) {
  Gam.Zotero.launchURL(buildUri(Gam.prefs.vaultName(), relPath));
}
