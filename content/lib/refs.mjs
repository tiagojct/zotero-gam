// References to Zotero items inside a vault note.
// Pure module: no Zotero or browser globals.

const WIKILINK = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
const PANDOC = /(?<![\w.@])@([a-z0-9][a-z0-9_:-]*)/g;
const ZOTERO = /zotero:\/\/select\/[^/\s]+\/items\/([A-Z0-9]{8})/g;
const DOI = /10\.\d{4,9}\/[^\s"<>]+/gi;
const CITEKEY = /^[a-z0-9]+$/;

export function extractRefs(text) {
  const src = String(text ?? "").normalize("NFC");
  const citekeys = new Set();
  const itemKeys = new Set();
  const dois = new Set();
  for (const m of src.matchAll(WIKILINK)) {
    const target = m[1].trim().split("/").pop().replace(/\.md$/, "");
    if (CITEKEY.test(target)) citekeys.add(target);
  }
  for (const m of src.matchAll(PANDOC)) {
    citekeys.add(m[1].replace(/[:-]+$/, ""));
  }
  for (const m of src.matchAll(ZOTERO)) itemKeys.add(m[1]);
  for (const m of src.matchAll(DOI)) {
    dois.add(m[0].replace(/[.,;:)\]]+$/, "").toLowerCase());
  }
  return { citekeys, itemKeys, dois };
}
