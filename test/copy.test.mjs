import { test } from "node:test";
import assert from "node:assert/strict";
import { wikilink, pandocCite } from "../content/lib/copy.mjs";

test("wikilink", () => {
  assert.equal(wikilink("cai2026"), "[[cai2026]]");
});

test("pandocCite: a plain key is [@key]", () => {
  for (const key of ["cai2026", "doe_2020", "smith-jones2020", "a.b", "x:y", "gonçalves2020", "_x", "2020a", "a/b"]) {
    assert.equal(pandocCite(key), `[@${key}]`, key);
  }
});

test("pandocCite: a key that Pandoc would cut short gets braces", () => {
  for (const key of ["doe2020.", "a--b", "-x", "a..b", "a#", "xy-"]) {
    assert.equal(pandocCite(key), `[@{${key}}]`, key);
  }
});

test("pandocCite: no key, or a key that braces cannot hold, gives null", () => {
  for (const key of ["", null, undefined, "a b", "a}b", "a{b", "a\nb"]) assert.equal(pandocCite(key), null, String(key));
});
