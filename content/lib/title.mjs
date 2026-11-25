// Title text: the fixes that are always safe, and the tags that Zotero uses in titles.
// Pure module: no Zotero or browser globals.

// A tag has no attributes, or attributes with "=": "a <b and c> d" is text.
const ATTRS = "(?:\\s+[\\w:-]+\\s*=\\s*(?:\"[^\"<>]*\"|'[^'<>]*'|[^\\s\"'<>]+))*";
const tagRegExp = (names) => new RegExp(`<(/?)(${names})(${ATTRS})\\s*/?>`, "gi");

// The rich text of Zotero titles. Other names are text, if they are not in DROPPED.
const RICH = "i|b|sub|sup|span";
// Tags that come with imported titles. A name that is not here (for example <String>) is text.
const BLOCK = "p|br|div|li|ul|ol|h[1-6]|title|tr|td|jats:title|jats:p";
const DROPPED = `${BLOCK}|a|em|strong|u|s|small|big|font|tt|code|scp|inline-formula|tex-math|alternatives|`
  + "jats:(?:italic|bold|sub|sup|sc)|mml:(?:math|mrow|mi|mn|mo|mtext|mstyle)";
// Math with a structure (a power, a fraction): without its tags it is another number.
const MATH_STRUCTURE = /<mml:(?!(?:math|mrow|mi|mn|mo|mtext|mstyle)\b)/i;
// A superscript or a subscript never goes: 10<sup>6</sup> is not 106.
const SCRIPT = /^(?:jats:)?(sup|sub)$/;

const isBlock = new RegExp(`^(?:${BLOCK})$`, "i");
const isRich = new RegExp(`^(?:${RICH})$`, "i");
const isNocase = (attrs) => /\bclass\s*=\s*["']?nocase["']?/i.test(attrs);
const isSmallCaps = (attrs) => /\bstyle\s*=\s*["']?[^"']*small-caps/i.test(attrs);

// The entities that gam knows. Others stay as they are.
const ENTITIES = new Map(Object.entries({
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’",
  ldquo: "“", rdquo: "”", hellip: "…", reg: "®", copy: "©", trade: "™", deg: "°", plusmn: "±", times: "×", micro: "µ",
  middot: "·", laquo: "«", raquo: "»", le: "≤", ge: "≥", szlig: "ß", ordf: "ª", ordm: "º",
  aelig: "æ", AElig: "Æ", oslash: "ø", Oslash: "Ø", aring: "å", Aring: "Å", eth: "ð", ETH: "Ð", thorn: "þ", THORN: "Þ",
}));
"alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega".split(" ")
  .forEach((name, i) => {
    // U+03C2 (final sigma) is between rho and sigma.
    const code = 0x3b1 + i + (i >= 17 ? 1 : 0);
    ENTITIES.set(name, String.fromCharCode(code));
    ENTITIES.set(name[0].toUpperCase() + name.slice(1), String.fromCharCode(code - 32));
  });
for (const [mark, letters] of [["grave", "aeiou"], ["acute", "aeiouy"], ["circ", "aeiou"], ["tilde", "ano"], ["uml", "aeiouy"], ["cedil", "c"], ["caron", "s"]]) {
  const combining = { grave: "̀", acute: "́", circ: "̂", tilde: "̃", uml: "̈", cedil: "̧", caron: "̌" }[mark];
  for (const c of letters) {
    ENTITIES.set(c + mark, (c + combining).normalize("NFC"));
    ENTITIES.set(c.toUpperCase() + mark, (c.toUpperCase() + combining).normalize("NFC"));
  }
}
// Numeric entities 128 to 159 are windows-1252, as in HTML (&#150; is a dash).
const CP1252 = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ";

function decode(text) {
  return text.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]{2,8}));/gi, (all, dec, hex, name) => {
    if (name) return ENTITIES.get(name) ?? all;
    let code = dec ? parseInt(dec, 10) : parseInt(hex, 16);
    if (code >= 128 && code <= 159) code = CP1252.codePointAt(code - 128);
    const valid = code >= 32 && code <= 0x10ffff && !(code >= 127 && code <= 159) && !(code >= 0xd800 && code <= 0xdfff);
    return valid ? String.fromCodePoint(code) : all;
  });
}

/**
 * Remove the tags that Zotero does not use. Text can look like a tag ("<a> and <u> in English"), so a tag
 * goes only with its pair, or as a block tag at the start or end of the title. loose: also without a pair.
 */
function cleanTags(title, loose) {
  const parts = [];
  const open = [];
  const math = MATH_STRUCTURE.test(title);
  let last = 0;
  for (const m of title.matchAll(tagRegExp(`${RICH}|${DROPPED}`))) {
    parts.push({ text: title.slice(last, m.index) });
    last = m.index + m[0].length;
    const [, close, name, attrs] = m;
    const lower = name.toLowerCase();
    if (math && lower.startsWith("mml:")) {
      parts.push({ text: m[0] });
      continue;
    }
    const block = isBlock.test(lower);
    const part = { text: m[0], tag: true, drop: loose && !SCRIPT.test(lower), block };
    parts.push(part);
    if (block && !close && /^\S/.test(title.slice(last)) && !title.slice(0, m.index).trim()) part.drop = true;
    if (block && close && /\S$/.test(title.slice(0, m.index)) && !title.slice(last).trim()) part.drop = true;
    if (!close) {
      const keep = lower === "span" ? isNocase(attrs) || isSmallCaps(attrs) : isRich.test(lower) || SCRIPT.test(lower);
      // The tag as Zotero writes it: without attributes and prefix.
      if (keep && lower !== "span" && (attrs || lower.startsWith("jats:"))) part.plain = `<${lower.replace("jats:", "")}>`;
      open.push({ name: lower, part, keep });
      continue;
    }
    const at = open.findLastIndex((o) => o.name === lower);
    if (at < 0) continue;
    // Tags that are still open inside this pair have no pair.
    const [start] = open.splice(at);
    start.part.drop = part.drop = !start.keep;
    if (start.keep && start.part.plain) {
      start.part.text = start.part.plain;
      part.text = start.part.plain.replace("<", "</");
    }
  }
  parts.push({ text: title.slice(last) });
  return parts.map((p) => (!p.tag || !p.drop ? p.text : p.block ? " " : "")).join("");
}

const oneSpace = (text) => text.replace(/\s+/g, " ").trim();

/** The title without the tags that have no pair. It can take away text that looks like a tag: only for the window. */
export function dropLooseTags(title) {
  const t = oneSpace(cleanTags(title, true));
  return /[\p{L}\p{N}]/u.test(t) ? t : title;
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

// Words that end with a dot.
const ABBREVIATION = new RegExp("(?:^|[^\\p{L}\\p{N}])(?:al|etc|cf|viz|sp|spp|subsp|var|vs|ca|ed|eds|vol|no|nos|pp|approx|"
  + "dept|univ|assoc|hosp|figs?|suppl|rev|yrs|cia|inc|ltd|lda|corp|co|bros|jr|sr|st|dr|mr|mrs|ms|prof)\\.$", "iu");

/** True when the final dot of text belongs to its last word: an abbreviation, initials, or an ellipsis. */
function keepDot(text) {
  if (/\.\s?\.\s?\.$/.test(text) || /\.\s\.$/.test(text)) return true;
  return ABBREVIATION.test(text) || /&c\.$/.test(text) || /(?:^|[^\p{L}\p{N}])\p{Lu}\.$/u.test(text) || /\.\p{L}\S*\.$/u.test(text);
}

/** True when the last character of text can go: final punctuation that is not part of a word or an entity. */
function endsLoose(text) {
  return /[.:;,]$/.test(text) && !keepDot(text) && !/&#?\w+;$/.test(text);
}

function dropFinalPunctuation(title) {
  const parts = segments(title);
  const texts = parts.filter((p) => !p.tag);
  const plain = () => texts.map((p) => p.text).join("").trimEnd();
  while (endsLoose(plain()) && /[\p{L}\p{N}]/u.test(plain())) {
    const end = texts.findLast((p) => p.text.trim());
    end.text = end.text.trimEnd().slice(0, -1).trimEnd();
  }
  return parts.map((p) => p.text).join("").trim();
}

function fixOnce(title) {
  const t = cleanTags(title, false).normalize("NFC").replace(/[­​⁠﻿]/g, "");
  return dropFinalPunctuation(oneSpace(t));
}

// What a fix must not change: the letters and digits, and the superscripts and subscripts ("^", "_"),
// without what else looks like a tag.
const core = (text) => text.normalize("NFC").replace(/[\^_]/g, "")
  .replace(/<(\/?)(?:jats:)?(sup|sub)\b[^<>]*>/gi, (all, close, name) => (/p/i.test(name) ? "^" : "_"))
  .replace(/<[^<>]*>/g, "").replace(/[^\p{L}\p{N}^_]/gu, "");

/**
 * The title with the fixes that are always safe. It never makes a title empty, and never takes away a
 * letter or a digit.
 */
export function safeFix(title) {
  const original = String(title ?? "").normalize("NFC");
  const decoded = decode(original);
  let t = decoded;
  for (let before = null; before !== t;) {
    before = t;
    t = fixOnce(t);
  }
  return /[\p{L}\p{N}]/u.test(plainText(t)) && core(t) === core(decoded) ? t : original.trim();
}
