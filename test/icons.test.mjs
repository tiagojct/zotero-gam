import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

for (const [name, size] of [["gam.svg", 16], ["gam-20.svg", 20]]) {
  test(`${name} is ${size} px and has the colour of Zotero's theme only`, () => {
    const svg = read(`content/icons/${name}`);
    assert.ok(svg.includes(`width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"`));
    for (const [, colour] of svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)) assert.match(colour, /^(?:none|context-fill)$/);
    assert.match(svg, /context-fill/);
  });
}

test("each icon that the code and the manifest name is there", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const named = [...Object.values(manifest.icons),
    ...[read("bootstrap.js"), read("content/ui/pane.mjs")].flatMap((t) => [...t.matchAll(/content\/icons\/[\w-]+\.svg/g)].map((m) => m[0]))];
  assert.ok(named.length >= 4);
  for (const p of named) assert.match(read(p), /^<svg /, p);
});

test("the side bar has the 20 px icon, and the section header the 16 px one", () => {
  const pane = read("content/ui/pane.mjs");
  assert.match(pane, /header: \{ l10nID: "gam-pane-header", icon: [^}]*icons\/gam\.svg"/);
  assert.match(pane, /sidenav: \{ l10nID: "gam-pane-sidenav", icon: [^}]*icons\/gam-20\.svg"/);
});
