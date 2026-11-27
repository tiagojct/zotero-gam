import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const pane = read("content/preferences.xhtml");

test("each text field of the settings has the name of its label", () => {
  const inputs = [...pane.matchAll(/<html:input [^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 8);
  for (const input of inputs) {
    const id = input.match(/aria-labelledby="([^"]+)"/)?.[1];
    assert.ok(id, input);
    assert.match(pane, new RegExp(`<label id="${id}" data-l10n-id="`));
  }
});

test("each setting of the pane has a default, and each label is in the Fluent file", () => {
  const prefs = read("prefs.js");
  for (const [, name] of pane.matchAll(/preference="([^"]+)"/g)) assert.ok(prefs.includes(`pref("${name}"`), name);
  const ftl = read("locale/en-US/gam.ftl");
  for (const [, id] of pane.matchAll(/data-l10n-id="([^"]+)"/g)) assert.match(ftl, new RegExp(`^${id} =`, "m"));
});

test("the OpenAlex key field is a password field without a pref, and bootstrap loads the pane script", () => {
  const field = pane.match(/<html:input [^>]*id="gam-pref-openalex-key"[^>]*>/)?.[0];
  assert.ok(field);
  assert.match(field, /type="password"/);
  assert.doesNotMatch(field, /preference=/);
  assert.match(pane, /preference="extensions\.gam\.openAlexPDFs"/);
  assert.match(pane, /role="status"/);
  assert.match(read("bootstrap.js"), /scripts: \[`chrome:\/\/\$\{pkg\}\/content\/preferences\.js`\]/);
  assert.ok(fs.existsSync(new URL("../content/preferences.js", import.meta.url)));
});
