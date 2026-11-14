import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { installFakeIO, tempVault } from "./helpers/fake-io.mjs";

installFakeIO();
const { checkVault, createFile, listMarkdown } = await import("../content/vault.mjs");

test("checkVault: null for a readable folder, a message for a missing or unreadable one", async () => {
  const v = tempVault();
  assert.equal(await checkVault(v), null);
  assert.equal(await checkVault(v + "-none"), `Vault folder not found: ${v}-none`);
  fs.chmodSync(v, 0o000);
  try {
    assert.equal(await checkVault(v), `Vault folder not readable: ${v}`);
  } finally {
    fs.chmodSync(v, 0o755);
  }
});

test("createFile writes a new file and never overwrites", async () => {
  const v = tempVault();
  const p = path.join(v, "sub", "a.md");
  await createFile(p, "one");
  assert.equal(fs.readFileSync(p, "utf8"), "one");
  await assert.rejects(createFile(p, "two"), (e) => e.name === "exists");
  assert.equal(fs.readFileSync(p, "utf8"), "one");
  assert.deepEqual(fs.readdirSync(path.dirname(p)), ["a.md"]);
});

test("listMarkdown skips hidden and excluded folders", async () => {
  const v = tempVault();
  for (const f of ["a.md", "archive/b.md", ".obsidian/c.md", "x/d.md", "x/e.txt"]) {
    fs.mkdirSync(path.join(v, path.dirname(f)), { recursive: true });
    fs.writeFileSync(path.join(v, f), "t");
  }
  const files = (await listMarkdown(v, ["archive"])).map((f) => f.path).sort();
  assert.deepEqual(files, ["a.md", "x/d.md"]);
});
