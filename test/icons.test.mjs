import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const DRAWINGS = [["gam.svg", 16, "context-fill"], ["gam-16-light.svg", 16, "#2b6a8f"], ["gam-16-dark.svg", 16, "#7db3d1"],
  ["gam-20-light.svg", 20, "#2b6a8f"], ["gam-20-dark.svg", 20, "#7db3d1"]];
for (const [name, size, line] of DRAWINGS) {
  test(`${name} is ${size} px, in ${line}`, () => {
    const svg = read(`content/icons/${name}`);
    assert.ok(svg.includes(`width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"`));
    const colours = new Set([...svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]));
    assert.deepEqual([...colours].sort(), [line, "none"].sort());
  });
}

test("the drawings of one size are the same", () => {
  const paths = (n) => [...read(`content/icons/${n}`).matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join("|");
  assert.equal(new Set(["gam.svg", "gam-16-light.svg", "gam-16-dark.svg"].map(paths)).size, 1);
  assert.equal(paths("gam-20-light.svg"), paths("gam-20-dark.svg"));
});

test("each icon that the code and the manifest name is there", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const named = [...Object.values(manifest.icons),
    ...[read("bootstrap.js"), read("content/ui/pane.mjs")].flatMap((t) => [...t.matchAll(/content\/icons\/[\w-]+\.svg/g)].map((m) => m[0]))];
  assert.ok(named.length >= 3);
  for (const p of named) assert.match(read(p), /^<svg /, p);
});

test("the side bar has the 20 px icon, and the section header the 16 px one", () => {
  const pane = read("content/ui/pane.mjs");
  assert.match(pane, /header: \{ l10nID: "gam-pane-header", icon: icon\(16, "light"\), darkIcon: icon\(16, "dark"\) \}/);
  assert.match(pane, /sidenav: \{ l10nID: "gam-pane-sidenav", icon: icon\(20, "light"\), darkIcon: icon\(20, "dark"\) \}/);
  assert.match(pane, /`\$\{Gam\.rootURI\}content\/icons\/gam-\$\{size\}-\$\{theme\}\.svg`/);
});
