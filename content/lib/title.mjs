// Title text: the fixes that are always safe, and the tags that Zotero uses in titles.
// Pure module: no Zotero or browser globals.

// A tag has no attributes, or attributes with "=": "a <b and c> d" is text.
const ATTRS = "(?:\\s+[\\w:-]+\\s*=\\s*(?:\"[^\"<>]*\"|'[^'<>]*'|[^\\s\"'<>]+))*";
const tagRegExp = (names) => new RegExp(`<(/?)(${names})(${ATTRS})\\s*/?>`, "gi");

// The rich text of Zotero titles. Other names are text, if they are not in DROPPED.
const RICH = "i|b|sub|sup|span";
// Tags that come with imported titles. A name that is not here (for example <String>) is text.
const BLOCK = "p|br|div|li|ul|ol|h[1-6]|title|tr|td|jats:title|jats:p";
const DROPPED = `${BLOCK}|a|em|strong|u|s|small|big|font|tt|code|jats:(?:italic|bold|sub|sup|sc)|mml:[a-z]+`;

const isBlock = new RegExp(`^(?:${BLOCK})$`, "i");
const isRich = new RegExp(`^(?:${RICH})$`, "i");
const isNocase = (attrs) => /\bclass\s*=\s*["']?nocase["']?/i.test(attrs);
const isSmallCaps = (attrs) => /\bstyle\s*=\s*["']?[^"']*small-caps/i.test(attrs);

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: "\u00a0" };

function decode(text) {
  return text.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|(amp|lt|gt|quot|apos|nbsp));/gi, (all, dec, hex, name) => {
    if (name) return ENTITIES[name.toLowerCase()];
    const code = dec ? parseInt(dec, 10) : parseInt(hex, 16);
    const valid = code >= 32 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
    return valid ? String.fromCodePoint(code) : all;
  });
}

/** Remove the tags that Zotero does not use, and the ones that have no pair. */
function cleanTags(title) {
  const parts = [];
  const open = [];
  let last = 0;
  for (const m of title.matchAll(tagRegExp(`${RICH}|${DROPPED}`))) {
    parts.push({ text: title.slice(last, m.index) });
    last = m.index + m[0].length;
    const [, close, name, attrs] = m;
    const part = { text: m[0], tag: true, keep: false, block: isBlock.test(name) };
    parts.push(part);
    if (!isRich.test(name)) continue;
    const lower = name.toLowerCase();
    if (!close) {
      const allowed = lower === "span" ? isNocase(attrs) || isSmallCaps(attrs) : !attrs;
      open.push({ name: lower, part, allowed });
      continue;
    }
    const at = open.findLastIndex((o) => o.name === lower);
    if (at < 0) continue;
    // Tags that are still open inside this pair have no pair: they go.
    const [start] = open.splice(at);
    if (start.allowed) start.part.keep = part.keep = true;
  }
  parts.push({ text: title.slice(last) });
  return parts.map((p) => (!p.tag || p.keep ? p.text : p.block ? " " : "")).join("");
}

/** The title as parts: [{text, tag, nocase}]. nocase: text that Zotero must not change the case of. */
export function segments(title) {
  const out = [];
  const spans = [];
  let last = 0;
  const text = String(title ?? "");
  const push = (s, tag) => {
    if (s) out.push({ text: s, tag, nocase: !tag && spans.includes(true) });
  };
  for (const m of text.matchAll(tagRegExp(RICH))) {
    push(text.slice(last, m.index), false);
    last = m.index + m[0].length;
    push(m[0], true);
    if (m[2].toLowerCase() !== "span") continue;
    if (m[1]) spans.pop();
    else spans.push(isNocase(m[3]));
  }
  push(text.slice(last), false);
  return out;
}

/** The title without tags. */
export function plainText(title) {
  return segments(title).filter((s) => !s.tag).map((s) => s.text).join("");
}

// A final dot that belongs to the last word: an abbreviation, initials, or an ellipsis.
const KEEP_DOT = /(?:\bet al|\betc|\b(?:Inc|Ltd|Corp|Co|Jr|Sr)|(?:^|[\s.(-])\p{Lu}|\.\.)\.$/u;

function dropFinalPunctuation(text) {
  let t = text.trimEnd();
  while (/[.:;,]$/.test(t) && !KEEP_DOT.test(t)) t = t.slice(0, -1).trimEnd();
  return t;
}

/** The title with the fixes that are always safe. It never makes a title empty. */
export function safeFix(title) {
  const original = String(title ?? "").normalize("NFC");
  let t = cleanTags(decode(original))
    .replace(/[\u00ad\u200b\u2060\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const parts = segments(t);
  const end = parts.findLastIndex((p) => !p.tag);
  if (end >= 0) parts[end].text = dropFinalPunctuation(parts[end].text) || parts[end].text;
  t = parts.map((p) => p.text).join("").trim();
  return /[\p{L}\p{N}]/u.test(plainText(t)) ? t : original.trim();
}
