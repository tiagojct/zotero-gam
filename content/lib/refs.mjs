// References to Zotero items inside a vault note.
// Pure module: no Zotero or browser globals.

const WIKILINK = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
const PANDOC = /(?<![\p{L}\p{N}_.@])@([\p{L}\p{N}][\p{L}\p{N}_:.-]*)/gu;
// The form that Pandoc needs for a key with other characters: @{key}.
const PANDOC_BRACED = /(?<![\p{L}\p{N}_.@])@\{([^{}\s]+)\}/gu;
const ZOTERO = /zotero:\/\/select\/(?:library|users\/\d+|groups\/\d+)\/items\/([A-Z0-9]{8})/g;
const DOI = /10\.\d{4,9}\/[^\s"<>\]`]+/gi;
const NO_SPACE = /^\S+$/;

/** Remove trailing punctuation; keep a closing parenthesis that closes one inside the DOI. */
function trimDoi(doi) {
  let d = doi;
  for (;;) {
    const before = d;
    d = d.replace(/[.,;:*]+$/, "");
    const open = (d.match(/\(/g) || []).length;
    const close = (d.match(/\)/g) || []).length;
    if (d.endsWith(")") && close > open) d = d.slice(0, -1);
    if (d === before) return d;
  }
}

export function extractRefs(text) {
  const src = String(text ?? "").normalize("NFC");
  const citekeys = new Set();
  const itemKeys = new Set();
  const dois = new Set();
  for (const m of src.matchAll(WIKILINK)) {
    const target = m[1].trim().split("/").pop().replace(/\.md$/, "");
    if (target && NO_SPACE.test(target)) citekeys.add(target);
  }
  for (const m of src.matchAll(PANDOC)) {
    citekeys.add(m[1].replace(/[:.-]+$/, ""));
  }
  for (const m of src.matchAll(PANDOC_BRACED)) citekeys.add(m[1]);
  for (const m of src.matchAll(ZOTERO)) itemKeys.add(m[1]);
  for (const m of src.matchAll(DOI)) {
    dois.add(trimDoi(m[0]).toLowerCase());
  }
  return { citekeys, itemKeys, dois };
}
