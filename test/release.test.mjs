import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (f) => JSON.parse(fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8"));
const manifest = read("manifest.json");
const updates = read("updates.json");
const REPO = "https://github.com/tiagojct/zotero-gam";
const link = (v) => `${REPO}/releases/download/v${v}/gam-${v}.xpi`;

test("updates.json lists the manifest version, so Zotero finds the release", () => {
  const list = updates.addons?.[manifest.applications.zotero.id]?.updates;
  assert.ok(Array.isArray(list), "no update list for the plugin id");
  assert.ok(list.some((u) => u.version === manifest.version), `updates.json has no entry for ${manifest.version}`);
});

test("each update entry links to its own release file and needs Zotero 10", () => {
  for (const u of updates.addons[manifest.applications.zotero.id].updates) {
    assert.equal(u.update_link, link(u.version));
    assert.equal(u.applications?.zotero?.strict_min_version, "10.0");
  }
});

test("the manifest reads updates.json from main of the public repo", () => {
  assert.equal(manifest.applications.zotero.update_url, "https://raw.githubusercontent.com/tiagojct/zotero-gam/main/updates.json");
});
