import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { installFakeIO, tempVault } from "./helpers/fake-io.mjs";

installFakeIO();
const { loadIgnored, saveIgnored, appendLog, loadTerms } = await import("../content/clean-store.mjs");

const file = (dir, name) => path.join(dir, name);

test("no ignore file: an empty set and no error", async () => {
  const r = await loadIgnored(tempVault());
  assert.deepEqual([...r.keys], []);
  assert.equal(r.error, null);
});

test("saveIgnored adds to the keys of the file", async () => {
  const dir = tempVault();
  assert.equal(await saveIgnored(dir, ["b", "a"]), null);
  assert.equal(await saveIgnored(dir, ["c", "a"]), null);
  const r = await loadIgnored(dir);
  assert.deepEqual([...r.keys].sort(), ["a", "b", "c"]);
  const json = JSON.parse(fs.readFileSync(file(dir, "gam-ignored.json"), "utf8"));
  assert.equal(json.version, 1);
  assert.deepEqual(fs.readdirSync(dir), ["gam-ignored.json"], "no temporary file stays");
});

test("saveIgnored with no keys writes no file", async () => {
  const dir = tempVault();
  assert.equal(await saveIgnored(dir, []), null);
  assert.deepEqual(fs.readdirSync(dir), []);
});

for (const damaged of ["{\"version\": 1, \"keys\": [", "[]", "{\"version\": 2, \"keys\": []}", "{\"version\": 1, \"keys\": [1]}", "null", ""]) {
  test(`a damaged ignore file ${JSON.stringify(damaged)} gives an error and keeps its bytes`, async () => {
    const dir = tempVault();
    fs.writeFileSync(file(dir, "gam-ignored.json"), damaged);
    const r = await loadIgnored(dir);
    assert.deepEqual([...r.keys], []);
    assert.match(r.error, /gam-ignored\.json/);
    assert.match(await saveIgnored(dir, ["a"]), /gam-ignored\.json/);
    assert.equal(fs.readFileSync(file(dir, "gam-ignored.json"), "utf8"), damaged);
  });
}

test("saveIgnored gives an error text when it cannot write", async () => {
  assert.match(await saveIgnored(file(tempVault(), "missing"), ["a"]), /gam-ignored\.json/);
});

test("appendLog adds one JSON line for each write", async () => {
  const dir = tempVault();
  await appendLog(dir, { date: "2026-11-25T10:00:00Z", libraryID: 1, key: "AAAA1111", field: "title", old: "a\nb", new: "c" });
  await appendLog(dir, { date: "2026-11-25T10:00:01Z", libraryID: 1, key: "AAAA1111", field: "shortTitle", old: "x", new: "y" });
  const lines = fs.readFileSync(file(dir, "gam-clean.jsonl"), "utf8").trimEnd().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0], { date: "2026-11-25T10:00:00Z", libraryID: 1, key: "AAAA1111", field: "title", old: "a\nb", new: "c" });
});

test("appendLog fails when it cannot write", async () => {
  await assert.rejects(appendLog(file(tempVault(), "missing"), { key: "A" }));
});

test("loadTerms reads the file again when it changes, and not before", async () => {
  const dir = tempVault();
  const p = file(dir, "terms.txt");
  fs.writeFileSync(p, "Delphi\n");
  const a = await loadTerms(p, "/home/x");
  assert.deepEqual(a, { terms: [{ term: "Delphi", lang: null }], error: null });
  assert.equal((await loadTerms(p, "/home/x")).terms, a.terms);
  fs.writeFileSync(p, "Delphi\nHelsinki\n");
  assert.equal((await loadTerms(p, "/home/x")).terms.length, 2);
});

test("loadTerms: no path, a path from the home folder, and errors", async () => {
  const none = await loadTerms("", "/home/x");
  assert.deepEqual(none, { terms: [], error: null });
  assert.deepEqual(await loadTerms("  ", "/home/x"), { terms: [], error: null });
  const home = tempVault();
  fs.writeFileSync(file(home, "t.txt"), "Delphi");
  assert.equal((await loadTerms("~/t.txt", home)).terms.length, 1);
  const missing = await loadTerms("/no/such/terms.txt", "/home/x");
  assert.deepEqual(missing.terms, []);
  assert.match(missing.error, /\/no\/such\/terms\.txt/);
  assert.match((await loadTerms(home, "/home/x")).error, /Terms file/);
});
