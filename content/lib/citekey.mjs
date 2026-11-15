// Citation keys in the form jacinto2026, jacinto2026a, jacinto2026b.
// Port of tools/zotero-local-mcp/src/zotero_local_mcp/citekey.py. Keep the two in step.
// Pure module: no Zotero or browser globals.

const EXTRA_LINE = /^\s*citation key\s*:\s*(\S+)\s*$/im;
const YEAR = /(?<!\d)(1[5-9]\d\d|20\d\d|21\d\d)(?!\d)/;
const SMALL = new Set(["of", "for", "the", "and", "on", "in", "de", "da", "do", "das", "dos", "e", "la", "le", "der", "und", "für"]);
const ARTICLES = new Set(["a", "an", "o", "os", "as", "um", "uma"]);

export function slug(text) {
  let s = String(text ?? "").normalize("NFKD").replace(/\p{M}/gu, "");
  s = s.replace(/ß/g, "ss").replace(/ø/g, "o").replace(/æ/g, "ae").replace(/ł/g, "l");
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function yearOf(data) {
  const m = String(data?.date ?? "").match(YEAR);
  return m ? m[1] : "";
}

function institutionSlug(name) {
  const head = String(name ?? "").split(",")[0];
  const words = head.split(/[\s/–—-]+/).filter((w) => w && !SMALL.has(w.toLowerCase()));
  return slug(words.slice(0, 3).join(""));
}

function firstCreator(creators) {
  for (const role of ["author", "editor", null]) {
    const c = creators.find((x) => role === null || x.creatorType === role);
    if (c) return c;
  }
  return {};
}

export function baseKey(data) {
  const creators = data?.creators ?? [];
  const one = firstCreator(creators);
  let name = slug(one.lastName ?? "") || institutionSlug(one.name ?? "");
  if (!name) {
    // No creator: the first main word of the title ("The Economist" -> economist).
    const words = String(data?.title ?? "").split(/\s+/).filter((w) => slug(w));
    const main = words.filter((w) => !SMALL.has(w.toLowerCase()) && !ARTICLES.has(w.toLowerCase()));
    name = slug((main.length ? main : words.length ? words : ["anon"])[0]);
  }
  return `${name || "anon"}${yearOf(data) || "nd"}`;
}

export function currentKey(data) {
  if (data?.citationKey) return data.citationKey;
  const m = String(data?.extra ?? "").match(EXTRA_LINE);
  return m ? m[1] : null;
}

function* suffixes() {
  const abc = "abcdefghijklmnopqrstuvwxyz";
  for (const c of abc) yield c;
  for (const a of abc) for (const b of abc) yield a + b;
}

export function uniqueKey(base, taken) {
  if (!taken.has(base)) return base;
  for (const s of suffixes()) {
    if (!taken.has(base + s)) return base + s;
  }
  throw new Error(`no free suffix for ${base}`);
}

/** True when key is safe as a file name inside the literature folder. */
export function safeFileKey(key) {
  return /^[^/\\\0]+$/.test(key) && !key.startsWith(".");
}
