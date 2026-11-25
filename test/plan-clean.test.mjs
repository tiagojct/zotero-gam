import { test } from "node:test";
import assert from "node:assert/strict";
import { planTitle, needsNotice, newShortTitle, planFile, ignoreKey, CASE_TYPES } from "../content/lib/plan-clean.mjs";
import { buildEvidence } from "../content/lib/case.mjs";
import { parseTerms } from "../content/lib/terms.mjs";

const item = (title, o = {}) => ({ id: 1, libraryID: 1, key: "AAAA1111", type: "journalArticle", title, language: "en", abstract: "", ...o });
const plan = (it, { user = "", ignored = [], abstracts = [] } = {}) =>
  planTitle(it, { userTerms: parseTerms(user), evidence: buildEvidence(abstracts), ignored: new Set(ignored) });

test("a title with a safe fix and a term is one row", () => {
  assert.deepEqual(plan(item("Asthma in portuguese adults.")),
    { id: 1, kind: "title", from: "Asthma in portuguese adults.", to: "Asthma in Portuguese adults", reasons: ["safe", "terms"] });
});

test("the reasons of a row: safe, terms, title-case", () => {
  assert.deepEqual(plan(item("Asthma.")).reasons, ["safe"]);
  assert.deepEqual(plan(item("Asthma in africa")).reasons, ["terms"]);
  assert.deepEqual(plan(item("The Role of Artificial Intelligence in Severe Asthma")).reasons, ["title-case"]);
});

test("a type outside CASE_TYPES gets safe fixes only", () => {
  assert.deepEqual(plan(item("ASTHMA IN THE WORLD.", { type: "statute" })).to, "ASTHMA IN THE WORLD");
  assert.equal(plan(item("Asthma in africa", { type: "film" })), null);
  assert.equal(CASE_TYPES.has("journalArticle"), true);
  assert.equal(CASE_TYPES.size, 16);
});

test("an abstract word alone is a suggestion; with a safe fix or a term the row leaves it out", () => {
  const abstract = "We used the Delphi method.";
  assert.deepEqual(plan(item("A delphi study", { abstract })),
    { id: 1, kind: "suggestion", from: "A delphi study", to: "A Delphi study", reasons: ["abstract"] });
  assert.deepEqual(plan(item("A delphi study.", { abstract })),
    { id: 1, kind: "title", from: "A delphi study.", to: "A delphi study", reasons: ["safe"] });
  assert.equal(plan(item("A delphi study in africa", { abstract })).to, "A delphi study in Africa");
  assert.equal(plan(item("A delphi study", { abstract }), { abstracts: ["a delphi panel"] }), null);
});

test("a title that is right, empty or null gives no row", () => {
  for (const t of ["Asthma in Portugal", "", null, undefined, "   "]) assert.equal(plan(item(t)), null);
});

test("a title of another language gets safe fixes only", () => {
  assert.equal(plan(item("Die Asthma der Kinder in portugal", { language: "de" })), null);
  assert.deepEqual(plan(item("Die Asthma der Kinder in portugal.", { language: "de" })).reasons, ["safe"]);
});

test("an ignored value gives no row; a changed value does", () => {
  const it = item("Asthma in africa");
  const key = ignoreKey({ libraryID: 1, key: "AAAA1111", kind: "title", value: "Asthma in africa" });
  assert.equal(plan(it, { ignored: [key] }), null);
  assert.ok(plan(item("Asthma in east africa"), { ignored: [key] }));
  assert.ok(plan({ ...it, libraryID: 2 }, { ignored: [key] }));
  const s = item("A delphi study", { abstract: "the Delphi method" });
  assert.equal(plan(s, { ignored: [ignoreKey({ ...s, kind: "suggestion", value: s.title })] }), null);
  assert.ok(plan(s, { ignored: [ignoreKey({ ...s, kind: "title", value: s.title })] }), "the kinds are apart");
});

test("needsNotice: a case change from terms or Title Case only", () => {
  assert.equal(needsNotice(plan(item("Asthma in africa"))), true);
  assert.equal(needsNotice(plan(item("Asthma."))), false);
  assert.equal(needsNotice(plan(item("A delphi study", { abstract: "the Delphi method" }))), false);
  assert.equal(needsNotice(null), false);
});

test("newShortTitle follows the start of the title", () => {
  const n = newShortTitle;
  assert.equal(n("Asthma in portuguese adults: a survey", "Asthma in Portuguese adults: a survey", "asthma in Portuguese Adults"), "Asthma in Portuguese adults");
  assert.equal(n("<p>The  fallacy of ai: limits", "The fallacy of AI: limits", "The fallacy of ai"), "The fallacy of AI");
  assert.equal(n("Why europe? a study", "Why Europe? a study", "Why europe?"), "Why Europe?");
  assert.equal(n("U.S. policy in africa", "U.S. policy in Africa", "U.S."), "U.S.");
  assert.equal(n("Africa. A study in africa", "Africa. A study in Africa", "africa"), "Africa");
});

test("newShortTitle leaves a short title that is not the start, or when the words changed", () => {
  const n = newShortTitle;
  assert.equal(n("Asthma: a survey", "Asthma: a survey of adults", "EPI"), "EPI");
  assert.equal(n("Asthma in adults", "Something else here", "Asthma in"), "Asthma in");
  assert.equal(n("A  b: c", "A b: c", ""), "");
  assert.equal(n("Asthma in africa", "Asthma in Africa", "Asthma in"), "Asthma in");
  assert.equal(n("EPI-ASTHMA in africa", "EPI-ASTHMA in Africa", "EPI"), "EPI");
  assert.equal(n("FEV<sub>1</sub> in africa", "FEV<sub>1</sub> in Africa", "FEV<sub>1</sub>"), "FEV<sub>1</sub>");
});

test("planFile gives a row for a name that is not the name of the template", () => {
  const f = (current, template, ignored = []) => planFile({ id: 5, libraryID: 1, key: "BBBB2222", parentID: 1, current, template, ignored: new Set(ignored) });
  assert.deepEqual(f("Specials--x.pdf", "West - 2012 - T.pdf"), { id: 5, parentID: 1, from: "Specials--x.pdf", to: "West - 2012 - T.pdf" });
  assert.equal(f("T.pdf", "T.pdf"), null);
  assert.equal(f("T 2.pdf", "T.pdf"), null);
  assert.equal(f("T-1.pdf", "T.pdf"), null);
  assert.equal(f("Café.pdf", "Café.pdf"), null);
  assert.ok(f("T 2020.pdf", "T.pdf"));
  assert.ok(f("t.pdf", "T.pdf"));
  assert.ok(f("T.epub", "T.pdf"));
  assert.ok(f("T", "T.pdf"));
  assert.equal(f("x.pdf", ".pdf"), null, "no name from the template");
  assert.equal(f("", "T.pdf"), null);
  assert.equal(f("x.pdf", "T.pdf", [ignoreKey({ libraryID: 1, key: "BBBB2222", kind: "file", value: "x.pdf" })]), null);
});
