import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTerms, termsFor } from "../content/lib/terms.mjs";

test("parseTerms reads one term in each line, comments and a language prefix", () => {
  assert.deepEqual(parseTerms("﻿# c\r\n\nDelphi\r\npt: Serviço Nacional de Saúde\nen:NHS \n  \nFEV1: the term\n"), [
    { term: "Delphi", lang: null },
    { term: "Serviço Nacional de Saúde", lang: "pt" },
    { term: "NHS", lang: "en" },
    { term: "FEV1: the term", lang: null },
  ]);
  assert.deepEqual(parseTerms(""), []);
  assert.deepEqual(parseTerms(null), []);
  assert.deepEqual(parseTerms("en:\n pt:  "), []);
});

test("parseTerms composes accents (NFC) and spaces", () => {
  assert.deepEqual(parseTerms("Saúde   Pública"), [{ term: "Saúde Pública", lang: null }]);
});

test("termsFor gives the terms of the language, longest first", () => {
  const en = termsFor("en", []);
  const pt = termsFor("pt", []);
  for (const t of ["Portuguese", "Portugal", "European", "Monday", "January", "Africa", "American Thoracic Society", "European Respiratory Society"]) {
    assert.ok(en.includes(t), t);
  }
  assert.ok(pt.includes("Portugal") && pt.includes("Moçambique") && pt.includes("África"));
  for (const t of ["Portuguese", "Portuguesa", "Janeiro", "Segunda-feira"]) assert.ok(!pt.includes(t), t);
  for (const list of [en, pt]) {
    assert.deepEqual(list.map((t) => t.length), list.map((t) => t.length).sort((a, b) => b - a));
    assert.equal(new Set(list.map((t) => t.toLowerCase())).size, list.length);
  }
});

test("no built-in term is also a common word", () => {
  const all = [...termsFor("en", []), ...termsFor("pt", [])].map((t) => t.toLowerCase());
  for (const w of ["may", "march", "august", "polish", "turkey", "jordan", "chad", "guinea", "who", "us", "it", "aids", "black death", "peru"]) {
    if (w === "peru") assert.ok(!termsFor("pt", []).includes("Peru"));
    else assert.ok(!all.includes(w), w);
  }
});

test("the file of the user wins over the built-in terms, and only for its language", () => {
  const en = termsFor("en", parseTerms("portuguese\npt: Delfos\nen: mHealth"));
  assert.ok(en.includes("portuguese") && !en.includes("Portuguese"));
  assert.ok(en.includes("mHealth") && !en.includes("Delfos"));
  const pt = termsFor("pt", parseTerms("portuguese\npt: Delfos\nen: mHealth"));
  assert.ok(pt.includes("Delfos") && !pt.includes("mHealth"));
  // Two terms of the user that differ only in case: the last one.
  assert.deepEqual(termsFor("en", parseTerms("mhealth\nmHealth")).filter((t) => /mhealth/i.test(t)), ["mHealth"]);
});
