// The case of titles: sentence case for Title Case, and capitals for names.
// Pure module: no Zotero or browser globals.

import { segments, plainText, dropLooseTags } from "./title.mjs";
import { keptNames } from "./terms.mjs";

// --- Language

const WORDS = {
  en: "the of and in for with on to from by an a is are at between using how what",
  pt: "de da dos das em na nos nas para uma um com sobre à ao aos às pela pelo que é como não",
  es: "de el la los las del una un con para por y en sobre que es como al",
  fr: "de le la les des du et en une un pour dans sur avec au aux est",
  de: "der die das und den dem ein eine zu für mit von im des ist",
  it: "di il lo la gli della delle dei del e una un per con nel nella che è",
};
const WORD_SETS = Object.entries(WORDS).map(([lang, text]) => [lang, new Set(text.split(" "))]);

/**
 * The language of a title: "en", "pt", or null for another language (no case proposals).
 * The words of the title count, not only the language field: the field is often "en" for every item.
 */
export function titleLanguage(title, field) {
  const code = String(field ?? "").trim().toLowerCase();
  if (code && !/^(en|pt|por)/.test(code)) return null;
  const words = plainText(title).toLowerCase().match(/\p{L}+/gu) || [];
  const scores = Object.fromEntries(WORD_SETS.map(([lang, set]) => [lang, words.filter((w) => set.has(w)).length]));
  for (const w of words) {
    if (/(?:ção|ções|ência|ências)$/.test(w)) scores.pt += 1;
    if (/[ãõ]/.test(w)) scores.pt += 1;
  }
  const best = Math.max(...Object.values(scores));
  if (best >= 2 && best > scores.en) return scores.pt === best ? "pt" : null;
  return /^p/.test(code) && !scores.en ? "pt" : "en";
}

// --- Evidence of names

const NAME = /(?<=[\p{Ll},(]\s|[/-])\p{Lu}\p{Ll}{2,}(?!\p{L})/gu;
const LOWER = /(?<!\p{L})\p{Ll}{3,}(?!\p{L})/gu;
const nfc = (text) => String(text ?? "").normalize("NFC");

/** The words that the abstracts of a library have in lower case: they are not names. */
export function buildEvidence(abstracts) {
  const lower = new Set();
  for (const a of abstracts) {
    for (const w of nfc(a).match(LOWER) || []) lower.add(w);
  }
  return { lower };
}

/** The names in an abstract (in lower case): a capital in the middle of a sentence, and never in lower case. */
export function names(abstract, evidence) {
  const text = nfc(abstract);
  const own = new Set(text.match(LOWER) || []);
  const out = new Set();
  for (const w of text.match(NAME) || []) {
    const fold = w.toLowerCase();
    if (!own.has(fold) && !evidence.lower.has(fold)) out.add(fold);
  }
  return out;
}

const ACRONYM = /(?<![\p{L}\p{N}])\p{Lu}[\p{Lu}\p{N}]+(?![\p{L}\p{N}])/gu;

// Words of two letters that are also acronyms (odds ratio, nitric oxide): LOWER does not have them.
const SHORT_WORD = /^(?:AM|AN|AS|AT|BE|BY|DO|GO|HE|IF|IN|IS|IT|ME|MY|NO|OF|ON|OR|SO|TO|UP|WE|DA|DE|EM|NA|OU|SE|UM)$/;

/** The acronyms in an abstract: words in capitals that are never in lower case ("RESULTS" is a heading). */
export function acronyms(abstract, evidence) {
  const text = nfc(abstract);
  const own = new Set(text.match(/(?<!\p{L})\p{Ll}{2,}(?!\p{L})/gu) || []);
  return new Set((text.match(ACRONYM) || []).filter((w) => !SHORT_WORD.test(w) && !own.has(w.toLowerCase()) && !evidence.lower.has(w.toLowerCase())));
}

// --- Case

const isUpper = (s) => s !== s.toLowerCase() && s === s.toUpperCase();
const letters = (s) => s.replace(/[^\p{L}]/gu, "");
const capitalise = (w) => w.charAt(0).toUpperCase() + w.slice(1);
// A word; an apostrophe stays in the word ("Bloom's").
const WORD = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’][\p{L}\p{N}]+)*/gu;

/** The words of the title that can change: [{seg, start, text, first, before, formula, initial}].
 * first: starts a sentence. formula: a symbol before a superscript or subscript ("Ca" of Ca<sup>2+</sup>).
 * initial: a dot follows ("A. niger"). */
function titleWords(segs) {
  const out = [];
  let plain = "";
  for (const [i, seg] of segs.entries()) {
    if (seg.tag) continue;
    const next = segs.findIndex((x, j) => j > i && !x.tag);
    const script = segs.slice(i + 1, next < 0 ? segs.length : next).some((x) => /^<(?:sup|sub)\b/i.test(x.text));
    for (const m of seg.text.matchAll(WORD)) {
      const before = plain + seg.text.slice(0, m.index);
      const formula = script && m[0].length <= 2 && m.index + m[0].length === seg.text.length;
      out.push({ seg, start: m.index, text: m[0], first: startsSentence(before), before, formula, nocase: seg.nocase,
        initial: seg.text[m.index + m[0].length] === "." });
    }
    plain += seg.text;
  }
  return out;
}

// The text before a word ends a sentence. The dot of "U.S. ", "E. " and "vs. " does not.
function startsSentence(before) {
  if (!/[\p{L}\p{N}]/u.test(before)) return true;
  if (/[?!]["'”’)\]]*\s+["'“‘([]*$/.test(before)) return true;
  if (!/\.["'”’)\]]*\s+["'“‘([]*$/.test(before)) return false;
  const last = before.match(/([\p{L}\p{N}]+)\.["'”’)\]]*\s+["'“‘([]*$/u)?.[1] || "";
  return !/^(?:\p{L}|vs|al|St|Dr|No|Fig|eg|ie)$/u.test(last);
}

/** The number of words of a title in capitals, or 0 for another title. */
function capsWords(segs) {
  const text = segs.filter((s) => !s.tag && !s.nocase).map((s) => s.text).join("");
  return isUpper(letters(text)) ? text.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length : 0;
}

const isAcronym = (w) => letters(w).length >= 2 && isUpper(letters(w));

/** At least 4 content words, and 70% of them or more have a capital. */
function isTitleCase(words) {
  const content = words.filter((w) => !w.first && !w.nocase && letters(w.text).length >= 4 && !isAcronym(w.text));
  const capital = content.filter((w) => /^\p{Lu}/u.test(w.text));
  return content.length >= 4 && capital.length / content.length >= 0.7;
}

// Words after which a single "A" is a name: "hepatitis A".
const LETTERED = /(?:hepatitis|vitamin|type|group|influenza|protein|factor|class|phase)\s+$/i;

/** The word in sentence case. */
function sentenceWord({ text, first, before, formula, initial }, allCaps, known, inCapitals) {
  const name = known.has(letters(text.replace(/['’].*$/, "")).toLowerCase());
  if (allCaps) {
    const low = text.toLowerCase();
    if (inCapitals.has(text) && !name) return text;
    return first || name ? capitalise(low) : low;
  }
  if (first || name || formula) return text;
  if (text === "A" && !initial) return LETTERED.test(before) ? text : "a";
  if (letters(text).length === 1 || /\p{N}/u.test(text) || /.\p{Lu}/u.test(text)) return text;
  return text.toLowerCase();
}

/** Replace words of the title: fn(word) gives the new text. */
function mapWords(segs, fn) {
  const out = segs.map((s) => ({ ...s }));
  const at = new Map(segs.map((s, i) => [s, out[i]]));
  // From the last word to the first, so that the positions stay right.
  for (const w of titleWords(segs).reverse()) {
    if (w.nocase) continue;
    const seg = at.get(w.seg);
    seg.text = seg.text.slice(0, w.start) + fn(w) + seg.text.slice(w.start + w.text.length);
  }
  return out;
}

const regExps = new WeakMap();
function termRegExp(terms) {
  if (!regExps.has(terms)) {
    const alternatives = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&").replace(/ /g, "\\s"));
    const byFold = new Map(terms.map((t) => [t.toLowerCase(), t]));
    const regExp = terms.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}])`, "giu") : null;
    regExps.set(terms, { regExp, byFold });
  }
  return regExps.get(terms);
}

// After these and a hyphen, the term is something else: step-down syndrome, real-world bank, pau-brasil, tinta-da-china.
const OTHER = [
  [/^down syndrome$/, /(?<!\p{L})(?:step|let|slow|shut|run|wind|break|lock|cool|knock)[-‐‑]$/iu],
  [/^world bank$/, /(?<!\p{L})real[-‐‑]$/iu],
  [/^(?:brasil|china)$/, /(?<!\p{L})(?:pau|da)[-‐‑]$/iu],
];
const joined = (before, fold) => OTHER.some(([term, left]) => term.test(fold) && left.test(before));

/** Give the terms their case. onlyAdd: a match that would lose a capital does not change. */
function applyTerms(segs, terms, onlyAdd) {
  const { regExp, byFold } = termRegExp(terms);
  if (!regExp) return segs;
  let plain = "";
  return segs.map((seg) => {
    if (seg.tag) return seg;
    const before = plain;
    plain += seg.text;
    if (seg.nocase) return seg;
    const text = seg.text.replace(regExp, (match, offset) => {
      let term = byFold.get(match.toLowerCase());
      if (!term || term.length !== match.length) return match;
      const left = before + seg.text.slice(0, offset);
      if (joined(left, term.toLowerCase())) return match;
      if (startsSentence(left) && isUpper(match[0])) term = match[0] + term.slice(1);
      const loses = [...match].some((c, i) => isUpper(c) && [...term][i] !== c);
      // "ASIA" in another title than one in capitals is an acronym.
      return loses && (onlyAdd || isAcronym(match)) ? match : term;
    });
    return { ...seg, text };
  });
}

const join = (segs) => segs.map((s) => s.text).join("");

/** The title without the footnote marks at its end. */
function dropFootnote(title) {
  const segs = segments(title);
  const i = segs.findLastIndex((s) => !s.tag && s.text.trim());
  if (i < 0) return title;
  const text = segs[i].text.replace(/\s*[*†‡]+\s*$/u, "");
  if (text === segs[i].text || !text.trim()) return title;
  segs[i].text = text;
  return join(segs);
}

/**
 * The case that a title must have. lang: titleLanguage. terms: termsFor. known: names of the abstract.
 * inCapitals: acronyms of the abstract.
 * Returns {title, reasons: ["title-case"] | ["terms"] | [], suggestion}. suggestion: title with the capitals
 * that only the abstract supports, and without a footnote mark or a tag without a pair; a title of 3 to 5
 * words in capitals (they can be acronyms) in sentence case. null when that is the same.
 */
export function caseProposal({ title, lang, terms, names: known, acronyms: inCapitals = new Set() }) {
  if (!lang) return { title, reasons: [], suggestion: null };
  const segs = segments(title);
  const caps = capsWords(segs);
  const kept = new Map(segs.map((seg) => [seg, seg.tag ? [] : keptNames(lang, seg.text, caps > 0)]));
  const keptText = (w) => {
    const k = kept.get(w.seg).find((x) => w.start >= x.start && w.start < x.start + x.name.length);
    return k && k.name.slice(w.start - k.start, w.start - k.start + w.text.length);
  };
  const sentence = () => applyTerms(mapWords(segs, (w) => keptText(w) ?? sentenceWord(w, caps > 0, known, inCapitals)), terms, false);
  if (caps >= 3 && caps <= 5) {
    const s = dropFootnote(join(sentence()));
    return { title, reasons: [], suggestion: s === title ? null : s };
  }
  const toSentence = caps >= 3 || (!caps && isTitleCase(titleWords(segs)));
  const reason = toSentence ? "title-case" : "terms";
  const changed = toSentence ? sentence() : applyTerms(segs, terms, true);
  const next = join(changed);
  const suggested = dropLooseTags(dropFootnote(join(mapWords(changed, (w) => {
    const fold = letters(w.text.replace(/['’].*$/, "")).toLowerCase();
    return !w.first && known.has(fold) && w.text === w.text.toLowerCase() ? capitalise(w.text) : w.text;
  }))));
  return { title: next, reasons: next === title ? [] : [reason], suggestion: suggested === next ? null : suggested };
}
