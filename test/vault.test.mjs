import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { installFakeIO, tempVault } from "./helpers/fake-io.mjs";

installFakeIO();
const { checkVault, createFile, listMarkdown } = await import("../content/vault.mjs");

test("checkVault: null for a readable folder, a message for a missing or unreadable one", async () => {
  const v = tempVault();
  fs.mkdirSync(path.join(v, ".obsidian"));
  assert.equal(await checkVault(v), null);
  assert.equal(await checkVault(v + "-none"), `Vault folder not found: ${v}-none`);
  fs.chmodSync(v, 0o000);
  try {
    assert.equal(await checkVault(v), `Vault folder not readable: ${v}`);
  } finally {
    fs.chmodSync(v, 0o755);
  }
});

test("checkVault: asks for a vault folder when none is set", async () => {
  assert.equal(await checkVault(""), "Set the vault folder in Settings > gam.");
});

test("checkVault: refuses a folder that is not an Obsidian vault", async () => {
  const v = tempVault();
  assert.equal(await checkVault(v), `Not an Obsidian vault (no .obsidian folder): ${v}`);
  fs.writeFileSync(path.join(v, ".obsidian"), "");
  assert.equal(await checkVault(v), `Not an Obsidian vault (no .obsidian folder): ${v}`);
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
  const files = (await listMarkdown(v, ["archive"])).filter((f) => !f.excluded).map((f) => f.path).sort();
  assert.deepEqual(files, ["a.md", "x/d.md"]);
});

test("listMarkdown does not follow symbolic links to folders", async () => {
  const v = tempVault();
  fs.mkdirSync(path.join(v, "a"));
  fs.writeFileSync(path.join(v, "a", "n.md"), "t");
  fs.symlinkSync(v, path.join(v, "a", "loop"));
  const files = (await listMarkdown(v, [])).map((f) => f.path);
  assert.deepEqual(files, ["a/n.md"]);
});

test("listMarkdown lists files in excluded folders as excluded, without their text", async () => {
  const v = tempVault();
  fs.mkdirSync(path.join(v, "archive"));
  fs.writeFileSync(path.join(v, "archive", "old.md"), "[[x]]");
  assert.deepEqual(await listMarkdown(v, ["archive"]), [{ path: "archive/old.md", text: "", excluded: true }]);
});

test("listMarkdown gives a stamp and does not read a file that isCurrent accepts", async () => {
  const v = tempVault();
  fs.writeFileSync(path.join(v, "a.md"), "one");
  fs.writeFileSync(path.join(v, "b.md"), "two");
  const [first] = (await listMarkdown(v, [])).filter((f) => f.path === "a.md");
  assert.equal(first.text, "one");
  assert.equal(typeof first.stamp, "string");
  const read = IOUtils.readUTF8;
  const reads = [];
  IOUtils.readUTF8 = async (p) => { reads.push(path.basename(p)); return read(p); };
  try {
    const files = await listMarkdown(v, [], { isCurrent: (rel, stamp) => rel === "a.md" && stamp === first.stamp });
    assert.deepEqual(files.find((f) => f.path === "a.md"), { path: "a.md", stamp: first.stamp, text: null });
    assert.equal(files.find((f) => f.path === "b.md").text, "two");
    assert.deepEqual(reads, ["b.md"]);
  } finally {
    IOUtils.readUTF8 = read;
  }
});

test("listMarkdown: the stamp changes when the file changes", async () => {
  const v = tempVault();
  const p = path.join(v, "a.md");
  fs.writeFileSync(p, "one");
  fs.utimesSync(p, 1000, 1000);
  const s1 = (await listMarkdown(v, []))[0].stamp;
  fs.writeFileSync(p, "two");
  fs.utimesSync(p, 1000, 1000);
  assert.equal((await listMarkdown(v, []))[0].stamp, s1, "same size and time");
  fs.writeFileSync(p, "three");
  fs.utimesSync(p, 1000, 1000);
  assert.notEqual((await listMarkdown(v, []))[0].stamp, s1, "other size");
  fs.writeFileSync(p, "one");
  fs.utimesSync(p, 2000, 2000);
  assert.notEqual((await listMarkdown(v, []))[0].stamp, s1, "other time");
});
