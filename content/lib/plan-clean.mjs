// The rows of "Clean library". Pure module: no Zotero or browser globals.

import { safeFix, segments, plainText } from "./title.mjs";
import { termsFor } from "./terms.mjs";
import { titleLanguage, names, caseProposal } from "./case.mjs";

/** The item types whose titles get case proposals: titles of works such as films and laws do not. */
export const CASE_TYPES = new Set([
  "journalArticle", "preprint", "conferencePaper", "bookSection", "book", "report", "thesis", "magazineArticle",
  "newspaperArticle", "encyclopediaArticle", "document", "manuscript", "presentation", "webpage", "blogPost", "dataset",
]);

/** The entry of an ignored row. The value is the title or filename that the row had: a new value is a new row. */
export function ignoreKey({ libraryID, key, kind, value }) {
  return `${libraryID}/${key}/${kind}/${String(value).normalize("NFC")}`;
}

const termLists = new WeakMap();
function termsOf(lang, userTerms) {
  if (!termLists.has(userTerms)) termLists.set(userTerms, {});
  const lists = termLists.get(userTerms);
  lists[lang] ||= termsFor(lang, userTerms);
  return lists[lang];
}

/**
 * The row of one title: {id, kind, from, to, reasons}, or null. kind "title": safe fixes and case changes
 * ("safe", "terms", "title-case"); kind "suggestion": what only the abstract supports ("abstract").
 */
export function planTitle({ id, libraryID, key, type, title, language, abstract }, { userTerms, evidence, ignored }) {
  const from = String(title ?? "");
  if (!from.trim()) return null;
  const isIgnored = (kind) => ignored.has(ignoreKey({ libraryID, key, kind, value: from }));
  const fixed = safeFix(from);
  const lang = CASE_TYPES.has(type) ? titleLanguage(fixed, language) : null;
  const proposal = lang
    ? caseProposal({ title: fixed, lang, terms: termsOf(lang, userTerms), names: names(abstract, evidence) })
    : { title: fixed, reasons: [], suggestion: null };
  if (proposal.title !== from) {
    const reasons = [...(fixed === from ? [] : ["safe"]), ...proposal.reasons];
    return isIgnored("title") ? null : { id, kind: "title", from, to: proposal.title, reasons };
  }
  if (proposal.suggestion === null || isIgnored("suggestion")) return null;
  return { id, kind: "suggestion", from, to: proposal.suggestion, reasons: ["abstract"] };
}

/** True when a new item with this row needs a notice: a case change that gam does not make alone. */
export function needsNotice(row) {
  return row?.kind === "title" && row.reasons.some((r) => r === "terms" || r === "title-case");
}

const fold = (words) => words.join(" ").toLowerCase().replace(/[:;,.]+$/, "");

/**
 * The short title after a change of the title. When it is the start of the old title (case ignored), it
 * becomes the same start of the new title. Else it does not change.
 */
export function newShortTitle(oldTitle, newTitle, shortTitle) {
  const short = String(shortTitle ?? "");
  if (!short.trim() || segments(short).some((s) => s.tag)) return short;
  const words = (t) => plainText(safeFix(t)).split(/\s+/).filter(Boolean);
  const shortWords = words(short);
  const n = shortWords.length;
  const oldWords = words(oldTitle).slice(0, n);
  const newWords = words(newTitle).slice(0, n);
  if (fold(oldWords) !== fold(shortWords) || fold(newWords) !== fold(oldWords)) return short;
  // The punctuation after the start of the title is not part of the short title; "U.S." keeps its dot.
  return /\.$/.test(shortWords.at(-1)) ? newWords.join(" ") : newWords.join(" ").replace(/[:;,.]+$/, "");
}

function splitExt(name) {
  const m = name.match(/^(.*)\.([^.]+)$/);
  return m ? [m[1], m[2]] : [name, ""];
}

/**
 * The row of one file: {id, parentID, from, to}, or null. template: the name that Zotero's template gives.
 * A name that Zotero made unique ("T 2.pdf", "T-1.pdf") is right.
 */
export function planFile({ id, libraryID, key, parentID, current, template, ignored }) {
  const from = String(current ?? "").normalize("NFC");
  const to = String(template ?? "").normalize("NFC");
  if (!from || from === to) return null;
  const [base, ext] = splitExt(from);
  const [wanted, wantedExt] = splitExt(to);
  if (!wanted.trim()) return null;
  if (ext === wantedExt && base.startsWith(wanted) && /^[ -]\d{1,2}$/.test(base.slice(wanted.length))) return null;
  if (ignored.has(ignoreKey({ libraryID, key, kind: "file", value: from }))) return null;
  return { id, parentID, from: String(current), to: String(template) };
}
