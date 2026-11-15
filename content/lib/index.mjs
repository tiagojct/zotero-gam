// In-memory index of the vault: literature notes and references to items.
// Pure module: no Zotero or browser globals.

import { parseFrontmatter, firstSection } from "./frontmatter.mjs";
import { extractRefs } from "./refs.mjs";

const ZOTERO_KEY = /\/items\/([A-Z0-9]{8})/;

const nfc = (s) => String(s ?? "").normalize("NFC");

function add(map, key, path) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(path);
}

function asList(v) {
  if (Array.isArray(v)) return v;
  return v ? [v] : [];
}

const prefixOf = (literatureFolder) => nfc(literatureFolder).replace(/\/+$/, "") + "/";

/** The references in one file and, for a file in the literature folder, its note. */
function analyze(path, text, litPrefix) {
  const refs = extractRefs(text);
  if (!path.startsWith(litPrefix) || !path.endsWith(".md")) return { refs, note: null };
  const { data, body } = parseFrontmatter(text);
  const stem = path.split("/").pop().replace(/\.md$/, "");
  const citekey = nfc(typeof data.citekey === "string" && data.citekey ? data.citekey : stem);
  const itemKey = (typeof data.zotero === "string" && data.zotero.match(ZOTERO_KEY)?.[1]) || "";
  const note = {
    path,
    title: typeof data.title === "string" && data.title ? data.title : stem,
    status: typeof data.status === "string" ? data.status : "",
    tags: asList(data.tags).map(String),
    summary: firstSection(body, "## Summary", 3),
    citekey,
    itemKey,
  };
  return { refs, note };
}

/** True when cache has the data of this version of the file, so its text need not be read. */
export function isCached(cache, path, stamp, literatureFolder) {
  const entry = cache?.get(nfc(path));
  return !!entry && stamp != null && entry.stamp === stamp && entry.litPrefix === prefixOf(literatureFolder);
}

/**
 * files: [{path, stamp, text}], path relative to the vault root with "/".
 * cache (optional, a Map kept between scans): the data of each file by path. A file with text null
 * takes its data from the cache (listMarkdown leaves out the text when isCached is true).
 * Files that are not in files are removed from the cache.
 */
export function buildIndex(files, { literatureFolder, cache = null }) {
  const litPrefix = prefixOf(literatureFolder);
  const paths = new Set();
  const byCitekey = new Map();
  const byItemKey = new Map();
  const refsByCitekey = new Map();
  const refsByItemKey = new Map();
  const refsByDoi = new Map();

  const seen = new Set();

  for (const f of files) {
    const path = nfc(f.path);
    paths.add(path);
    // A file in an excluded folder exists (a link to it is not "missing"), but its references do not count.
    if (f.excluded) continue;
    seen.add(path);
    let entry;
    if (f.text != null) {
      entry = { stamp: f.stamp, litPrefix, ...analyze(path, f.text, litPrefix) };
      if (cache && f.stamp != null) cache.set(path, entry);
    } else if (isCached(cache, path, f.stamp, literatureFolder)) {
      entry = cache.get(path);
    } else {
      // No text and no cached data (the cache was cleared during the scan): the file exists,
      // but its data comes with the next scan. Made-up data would be wrong.
      continue;
    }
    const { refs, note } = entry;
    for (const k of refs.citekeys) add(refsByCitekey, k, path);
    for (const k of refs.itemKeys) add(refsByItemKey, k, path);
    for (const d of refs.dois) add(refsByDoi, d, path);
    if (!note) continue;
    byCitekey.set(note.citekey, note);
    if (note.itemKey) byItemKey.set(note.itemKey, note);
  }
  if (cache) {
    for (const key of [...cache.keys()]) if (!seen.has(key)) cache.delete(key);
  }

  return {
    noteFor({ citekey, itemKey } = {}) {
      return (citekey && byCitekey.get(nfc(citekey))) || (itemKey && byItemKey.get(itemKey)) || null;
    },
    hasPath(path) {
      return paths.has(nfc(path));
    },
    citedIn({ citekey, itemKey, doi } = {}) {
      const own = this.noteFor({ citekey, itemKey })?.path;
      const out = new Set();
      for (const p of (citekey && refsByCitekey.get(nfc(citekey))) || []) out.add(p);
      for (const p of (itemKey && refsByItemKey.get(itemKey)) || []) out.add(p);
      for (const p of (doi && refsByDoi.get(String(doi).toLowerCase())) || []) out.add(p);
      out.delete(own);
      return [...out].sort();
    },
    /** The number of files in citedIn(). */
    citedCount(args = {}) {
      return this.citedIn(args).length;
    },
    /**
     * A string that changes when the references of any file change (so, when a "Cited in" count
     * can change). A hash, not the references: a vault can have many thousands.
     */
    refsSignature() {
      let h = 0x811c9dc5;
      const feed = (text) => {
        for (let i = 0; i < text.length; i++) {
          h ^= text.charCodeAt(i);
          h = Math.imul(h, 0x01000193) >>> 0;
        }
      };
      for (const [tag, map] of [["c", refsByCitekey], ["i", refsByItemKey], ["d", refsByDoi]]) {
        for (const key of [...map.keys()].sort()) {
          feed(`${tag}\t${key}\t${[...map.get(key)].sort().join("\t")}\n`);
        }
      }
      return h.toString(16);
    },
    citekeys() {
      return new Set(byCitekey.keys());
    },
    notes() {
      return [...byCitekey.values()];
    },
  };
}
