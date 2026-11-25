// A notice for a new PDF or EPUB that has no parent item after Zotero's lookup.

import { isOrphan } from "./clean.mjs";
import { shortTitle } from "./keys.mjs";

// Without a lookup (for example, Zotero's setting is off), the notice comes after this time.
const NO_LOOKUP_MS = 60000;
// Files that fail together give one notice.
const COLLECT_MS = 2000;
const MAX_NAMES = 3;

/**
 * add(ids): new items (the files without a parent are watched). stop(): end the watch.
 * Zotero's lookup queue tells when the lookup of a file ends.
 */
export function makeOrphanWatch({ Zotero, enabled, notify, setTimeout, clearTimeout }) {
  // The timer of each watched file, by item ID.
  const waiting = new Map();
  let ended = new Set();
  let collectTimer = null;
  let stopped = false;
  const queue = Zotero.ProgressQueues?.get("recognize");
  const { ROW_PROCESSING = 2 } = Zotero.ProgressQueue || {};

  function report() {
    collectTimer = null;
    const ids = [...ended];
    ended = new Set();
    if (!enabled()) return;
    const files = (Zotero.Items.get(ids) || []).filter((i) => isOrphan(Zotero, i));
    if (!files.length) return;
    const names = files.slice(0, MAX_NAMES).map((f) => `"${shortTitle(f.attachmentFilename || f.getField("title"))}"`);
    const more = files.length - names.length;
    notify(`${files.length === 1 ? "1 file has" : `${files.length} files have`} no parent item: `
      + `${names.join(", ")}${more ? ` and ${more} more` : ""}.\nTools > Clean library…`);
  }

  /** The lookup of a file ended, or there was none. */
  function end(id) {
    clearTimeout(waiting.get(id));
    waiting.delete(id);
    ended.add(id);
    clearTimeout(collectTimer);
    collectTimer = setTimeout(report, COLLECT_MS);
  }

  /** After NO_LOOKUP_MS: a file that is still in the lookup queue waits more. */
  function check(id) {
    const row = queue?.getRows().find((r) => r.id === id);
    if (row && row.status <= ROW_PROCESSING) waiting.set(id, setTimeout(() => check(id), NO_LOOKUP_MS));
    else end(id);
  }

  const onRow = ({ id, status }) => {
    if (waiting.has(id) && status > ROW_PROCESSING) end(id);
  };
  queue?.addListener("rowupdated", onRow);

  return {
    add(ids) {
      if (stopped || !enabled()) return;
      // The type of a file can come after the add event: isOrphan checks it at the notice.
      for (const item of Zotero.Items.get(ids) || []) {
        if (!item?.isAttachment?.() || item.parentID || waiting.has(item.id)) continue;
        waiting.set(item.id, setTimeout(() => check(item.id), NO_LOOKUP_MS));
      }
    },
    stop() {
      stopped = true;
      queue?.removeListener("rowupdated", onRow);
      for (const timer of waiting.values()) clearTimeout(timer);
      waiting.clear();
      clearTimeout(collectTimer);
      ended = new Set();
    },
  };
}
