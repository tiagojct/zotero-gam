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

/** files: [{path, text}], path relative to the vault root with "/". */
export function buildIndex(files, { literatureFolder }) {
  const litPrefix = nfc(literatureFolder).replace(/\/+$/, "") + "/";
  const paths = new Set();
  const byCitekey = new Map();
  const byItemKey = new Map();
  const refsByCitekey = new Map();
  const refsByItemKey = new Map();
  const refsByDoi = new Map();

  for (const f of files) {
    const path = nfc(f.path);
    paths.add(path);
    const refs = extractRefs(f.text);
    for (const k of refs.citekeys) add(refsByCitekey, k, path);
    for (const k of refs.itemKeys) add(refsByItemKey, k, path);
    for (const d of refs.dois) add(refsByDoi, d, path);
    if (!path.startsWith(litPrefix) || !path.endsWith(".md")) continue;

    const { data, body } = parseFrontmatter(f.text);
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
    byCitekey.set(citekey, note);
    if (itemKey) byItemKey.set(itemKey, note);
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
    citekeys() {
      return new Set(byCitekey.keys());
    },
  };
}
