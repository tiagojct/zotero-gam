import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { installFakeIO, tempVault } from "./helpers/fake-io.mjs";
import { checkImportFolders } from "../content/lib/paths.mjs";
import { makeFolderImport, SCAN_MS } from "../content/import-folder.mjs";

installFakeIO();

const places = { home: "/Users/t", vault: "/Users/t/vault", dataDir: "/Users/t/Zotero" };
for (const [folder, done, message] of [
  ["/Users/t/in", "/Users/t/in/imported", null],
  ["/Users/t/in", "/Users/t/out", null],
  ["/Users/t/vaulted", "/Users/t/out", null],
  ["in", "/Users/t/out", /full path/],
  ["/Users/t/in", "out", /full path/],
  ["/Users/t/in/../vault", "/Users/t/out", /full path/],
  ["/Users/t", "/Users/t/out", /home folder/],
  ["/users/T", "/Users/t/out", /home folder/],
  ["/Users", "/Users/t/out", /home folder/],
  ["/Users/t/vault/pdf", "/Users/t/out", /vault/],
  ["/Users/t/Vault", "/Users/t/out", /vault/],
  ["/Users/t/in", "/Users/t/vault/x", /vault/],
  ["/Users/t/Zotero/storage", "/Users/t/out", /Zotero data folder/],
  ["/Users/t/in", "/Users/t/Zotero/x", /Zotero data folder/],
  ["/Users/t/in", "/Users/t/in", /another folder/],
  ["/Users/t/in", "/Users/T/IN", /another folder/],
]) {
  test(`checkImportFolders ${folder} ${done}`, () => {
    const m = checkImportFolders(folder, done, places);
    if (message) assert.match(m, message);
    else assert.equal(m, null);
  });
}

test("a folder that holds the vault or the Zotero data folder is refused; no vault is fine", () => {
  assert.match(checkImportFolders("/a/b", "/x", { home: "/h", vault: "/a/b/vault", dataDir: "/z" }), /vault/);
  assert.match(checkImportFolders("/a/b", "/x", { home: "/h", vault: "", dataDir: "/a/b/Zotero" }), /Zotero data folder/);
  assert.equal(checkImportFolders("/a/b", "/x", { home: "/h", vault: "", dataDir: "/z" }), null);
});

const PDF = "%PDF-1.4 ";

function setup({ on = true, done = "", autoRecognize = true } = {}) {
  const root = tempVault();
  const dir = path.join(root, "in");
  fs.mkdirSync(dir);
  fs.mkdirSync(path.join(root, "storage"));
  const s = { root, dir, on, done, folder: dir, notices: [], errors: [], recognized: [], imported: [], items: [], waited: 0 };
  let timer = null;
  let n = 0;
  const addItem = (file, o = {}) => {
    const item = { id: s.items.length + 1, isAttachment: () => true, isLinkedFileAttachment: () => false, isImportedAttachment: () => true, isInTrash: () => false, getFilePathAsync: async () => file, ...o };
    s.items.push(item);
    return item;
  };
  s.addStored = (name, text, o) => {
    const file = path.join(root, "storage", name);
    fs.writeFileSync(file, text);
    return addItem(file, o);
  };
  s.Zotero = {
    Libraries: { userLibraryID: 1, userLibrary: { waitForDataLoad: async (type) => { assert.equal(type, "item"); s.waited += 1; } } },
    Items: { getAll: async (lib, top, deleted) => { assert.deepEqual([lib, top, deleted], [1, false, false]); return s.items; } },
    Attachments: {
      importFromFile: async ({ file, libraryID, ...rest }) => {
        assert.deepEqual([libraryID, rest], [1, {}]);
        if (s.failImport) throw new Error("no space");
        const to = path.join(root, "storage", `${++n}-${path.basename(file)}`);
        fs.writeFileSync(to, s.badCopy ? "other" : fs.readFileSync(file));
        s.imported.push(path.basename(file));
        return addItem(to);
      },
    },
    RecognizeDocument: { autoRecognizeItems: async (items) => { s.recognized.push(items.map((i) => i.id)); if (!autoRecognize) throw new Error("recognizer"); } },
    logError: (e) => s.errors.push(e.message || String(e)),
  };
  s.make = () => makeFolderImport({
    Zotero: s.Zotero, enabled: () => s.on, folder: () => s.folder, done: () => s.done, check: () => s.problem || null,
    notify: (text) => s.notices.push(text),
    setTimeout: (fn, ms) => { assert.equal(ms, SCAN_MS); timer = fn; return 1; }, clearTimeout: () => { timer = null; },
  });
  s.w = s.make();
  s.hasTimer = () => !!timer;
  s.tick = async () => { const fn = timer; timer = null; await fn?.(); };
  s.put = (name, text = PDF + name) => fs.writeFileSync(path.join(dir, name), text);
  s.left = () => fs.readdirSync(dir).filter((x) => fs.statSync(path.join(dir, x)).isFile()).sort();
  s.moved = () => { const d = s.done || path.join(dir, "imported"); return fs.existsSync(d) ? fs.readdirSync(d).sort() : []; };
  return s;
}

test("a file that is the same in two scans is imported, looked up, and moved", async () => {
  const s = setup();
  s.put("a.pdf");
  s.put("b.EPUB", "PK\u0003\u0004 epub");
  s.w.start();
  await s.tick();
  assert.deepEqual([s.imported, s.left()], [[], ["a.pdf", "b.EPUB"]]);
  await s.tick();
  assert.deepEqual(s.imported.sort(), ["a.pdf", "b.EPUB"]);
  assert.deepEqual([s.left(), s.moved()], [[], ["a.pdf", "b.EPUB"]]);
  assert.deepEqual(s.recognized, [[1, 2]]);
  assert.deepEqual(s.notices, ["2 files imported from in."]);
  assert.ok(s.waited > 0);
  await s.tick();
  await s.tick();
  assert.equal(s.imported.length, 2);
  assert.deepEqual(s.errors, []);
});

test("one notice names the file when it is only one", async () => {
  const s = setup();
  s.put("a.pdf");
  s.w.start();
  await s.tick();
  await s.tick();
  assert.deepEqual(s.notices, ["\"a.pdf\" imported from in."]);
});

test("a file that still changes is not imported", async () => {
  const s = setup();
  s.put("a.pdf", PDF);
  s.w.start();
  await s.tick();
  s.put("a.pdf", `${PDF} more`);
  await s.tick();
  assert.deepEqual(s.imported, []);
  await s.tick();
  assert.deepEqual(s.imported, ["a.pdf"]);
});

test("other files, hidden files, empty files, folders and links stay", async () => {
  const s = setup();
  s.put("a.docx");
  s.put(".b.pdf");
  s.put(".c.pdf.icloud");
  s.put("d.pdf", "");
  fs.mkdirSync(path.join(s.dir, "sub.pdf"));
  fs.writeFileSync(path.join(s.root, "real.pdf"), PDF);
  fs.symlinkSync(path.join(s.root, "real.pdf"), path.join(s.dir, "link.pdf"));
  s.w.start();
  for (let i = 0; i < 3; i += 1) await s.tick();
  assert.deepEqual([s.imported, s.notices], [[], []]);
});

test("a file with another content than its name gives one notice and stays", async () => {
  const s = setup();
  s.put("page.pdf", "<html>Sign in</html>");
  s.w.start();
  for (let i = 0; i < 4; i += 1) await s.tick();
  assert.deepEqual([s.imported, s.left()], [[], ["page.pdf"]]);
  assert.equal(s.notices.length, 1);
  assert.match(s.notices[0], /"page\.pdf" is not a PDF/);
});

test("a file that is already in Zotero is not imported again, and is moved", async () => {
  const s = setup();
  s.addStored("other name.pdf", `${PDF}same`);
  s.items.push({ isAttachment: () => false });
  s.addStored("linked.pdf", `${PDF}link`, { isImportedAttachment: () => false });
  s.put("a.pdf", `${PDF}same`);
  s.put("b.pdf", `${PDF}link`);
  s.put("c.pdf", `${PDF}sam2`);
  s.w.start();
  await s.tick();
  await s.tick();
  assert.deepEqual(s.imported.sort(), ["b.pdf", "c.pdf"]);
  assert.deepEqual(s.moved(), ["a.pdf", "b.pdf", "c.pdf"]);
  assert.deepEqual(s.notices, ["2 files imported from in.\n\"a.pdf\" was already in Zotero."]);
});

test("a file whose copy is in the trash, also with its parent, is imported again", async () => {
  const s = setup();
  s.addStored("a.pdf", `${PDF}x`, { isInTrash: () => true });
  s.put("a.pdf", `${PDF}x`);
  s.w.start();
  await s.tick();
  await s.tick();
  assert.deepEqual([s.imported, s.moved()], [["a.pdf"], ["a.pdf"]]);
});

test("a file that is linked in Zotero stays, with one notice", async () => {
  const s = setup();
  s.put("a.pdf");
  s.items.push({ isAttachment: () => true, isImportedAttachment: () => false, isLinkedFileAttachment: () => true, isInTrash: () => false, getFilePath: () => path.join(s.dir, "A.pdf") });
  s.items.push({ isAttachment: () => true, isImportedAttachment: () => false, isLinkedFileAttachment: () => true, isInTrash: () => false, getFilePath: () => false });
  s.w.start();
  for (let i = 0; i < 4; i += 1) await s.tick();
  assert.deepEqual([s.imported, s.left()], [[], ["a.pdf"]]);
  assert.equal(s.notices.length, 1);
  assert.match(s.notices[0], /"a\.pdf" is a linked file in Zotero/);
});

for (const known of [true, false]) {
  test(`a file that changes before the move stays, and its new version is imported (${known ? "known" : "new"})`, async () => {
    const s = setup();
    if (known) s.addStored("k.pdf", `${PDF}v1`);
    s.put("a.pdf", `${PDF}v1`);
    s.w.start();
    await s.tick();
    const real = IOUtils.computeHexDigest;
    // The change comes after the file was read, while the library file is read.
    IOUtils.computeHexDigest = async (p, m) => {
      const h = await real(p, m);
      if (p.includes("storage")) s.put("a.pdf", `${PDF}v2 NEW`);
      return h;
    };
    await s.tick();
    IOUtils.computeHexDigest = real;
    assert.deepEqual([s.left(), s.moved()], [["a.pdf"], []]);
    for (let i = 0; i < 3; i += 1) await s.tick();
    assert.deepEqual(s.moved(), ["a.pdf"]);
    assert.equal(s.imported.length, known ? 1 : 2);
    assert.ok(s.items.length >= 2);
  });
}

test("a move that fails halfway makes one copy at most, and ends", async () => {
  const s = setup();
  s.done = path.join(s.root, "disk");
  s.put("a.pdf");
  const real = IOUtils.move;
  let moves = 0;
  // Another volume: the copy is there, and the source cannot be removed.
  IOUtils.move = async (from, to) => {
    moves += 1;
    if (moves > 50) throw new Error("test stopped a loop");
    fs.copyFileSync(from, to);
    throw Object.assign(new Error("access denied"), { name: "NotAllowedError" });
  };
  s.w.start();
  for (let i = 0; i < 4; i += 1) await s.tick();
  IOUtils.move = real;
  assert.equal(moves, 1);
  assert.equal(s.notices.length, 1);
  assert.match(s.notices[0], /could not move it .*access denied/);
});

test("a name that another program makes in between gets a number", async () => {
  const s = setup();
  s.done = path.join(s.root, "done");
  s.put("a.pdf");
  const real = IOUtils.move;
  let first = true;
  IOUtils.move = async (from, to, o) => {
    if (first) fs.writeFileSync(to, "other");
    first = false;
    return real(from, to, o);
  };
  s.w.start();
  await s.tick();
  await s.tick();
  IOUtils.move = real;
  assert.deepEqual(s.moved(), ["a-2.pdf", "a.pdf"]);
  assert.equal(fs.readFileSync(path.join(s.done, "a.pdf"), "utf8"), "other");
});

for (const how of ["stop", "changed", "off"]) {
  test(`nothing is imported when the watch ends during a slow read (${how})`, async () => {
    const s = setup();
    s.put("a.pdf");
    s.w.start();
    await s.tick();
    const real = IOUtils.computeHexDigest;
    IOUtils.computeHexDigest = async (...a) => {
      if (how === "off") s.on = false;
      else s.w[how]();
      return real(...a);
    };
    await s.tick();
    IOUtils.computeHexDigest = real;
    assert.deepEqual([s.imported, s.left()], [[], ["a.pdf"]]);
  });
}

test("a folder that cannot be listed gives one notice", async () => {
  const s = setup();
  const real = IOUtils.getChildren;
  IOUtils.getChildren = async () => { throw new Error("not permitted"); };
  s.w.start();
  for (let i = 0; i < 3; i += 1) await s.tick();
  IOUtils.getChildren = real;
  assert.equal(s.notices.length, 1);
  assert.match(s.notices[0], /cannot read the import folder.*not permitted/);
  s.put("a.pdf");
  await s.tick();
  await s.tick();
  assert.deepEqual(s.imported, ["a.pdf"]);
});

test("an attachment with a path that is not valid does not stop the import", async () => {
  const s = setup();
  const bad = () => { throw new Error("bad path"); };
  s.items.push({ isAttachment: () => true, isImportedAttachment: () => false, isLinkedFileAttachment: () => true, isInTrash: () => false, getFilePath: bad });
  s.items.push({ isAttachment: () => true, isImportedAttachment: () => true, isInTrash: () => false, getFilePathAsync: async () => bad() });
  s.addStored("k.pdf", `${PDF}same`);
  s.put("a.pdf");
  s.put("b.pdf", `${PDF}same`);
  s.w.start();
  await s.tick();
  await s.tick();
  assert.deepEqual([s.imported, s.moved()], [["a.pdf"], ["a.pdf", "b.pdf"]]);
});

test("the same content two times in the folder is one import", async () => {
  const s = setup();
  s.put("a.pdf", `${PDF}x`);
  s.put("b.pdf", `${PDF}x`);
  s.w.start();
  await s.tick();
  await s.tick();
  assert.equal(s.imported.length, 1);
  assert.deepEqual(s.moved(), ["a.pdf", "b.pdf"]);
});

test("a name that exists in the target folder gets a number; nothing is overwritten", async () => {
  const s = setup({ done: "" });
  s.done = path.join(s.root, "done");
  fs.mkdirSync(s.done);
  fs.writeFileSync(path.join(s.done, "a.pdf"), "old");
  fs.writeFileSync(path.join(s.done, "a-2.pdf"), "old2");
  s.put("a.pdf");
  s.w.start();
  await s.tick();
  await s.tick();
  assert.deepEqual(s.moved(), ["a-2.pdf", "a-3.pdf", "a.pdf"]);
  assert.equal(fs.readFileSync(path.join(s.done, "a.pdf"), "utf8"), "old");
});

test("an import that fails leaves the file, gives one notice, and is tried again when the file changes", async () => {
  const s = setup();
  s.failImport = true;
  s.put("a.pdf");
  s.w.start();
  for (let i = 0; i < 4; i += 1) await s.tick();
  assert.deepEqual([s.left(), s.moved()], [["a.pdf"], []]);
  assert.equal(s.notices.length, 1);
  assert.match(s.notices[0], /"a\.pdf".*no space/);
  s.failImport = false;
  s.put("a.pdf", `${PDF} new content`);
  await s.tick();
  await s.tick();
  assert.deepEqual(s.moved(), ["a.pdf"]);
});

test("a file that cannot be read gives one notice, and is tried again without a change", async () => {
  const s = setup();
  s.put("a.pdf");
  const real = IOUtils.computeHexDigest;
  IOUtils.computeHexDigest = async () => { throw new Error("offline"); };
  const { getAll } = s.Zotero.Items;
  s.Zotero.Items.getAll = async () => { throw new Error("the library is read only when it is necessary"); };
  s.w.start();
  for (let i = 0; i < 4; i += 1) await s.tick();
  IOUtils.computeHexDigest = real;
  s.Zotero.Items.getAll = getAll;
  assert.deepEqual(s.errors, []);
  assert.equal(s.notices.length, 1);
  assert.match(s.notices[0], /cannot read "a\.pdf" \(offline\)/);
  assert.deepEqual([s.imported, s.left()], [[], ["a.pdf"]]);
  await s.tick();
  assert.deepEqual(s.imported, ["a.pdf"]);
});

test("a copy that is not the same leaves the file where it is", async () => {
  const s = setup();
  s.badCopy = true;
  s.put("a.pdf");
  s.w.start();
  for (let i = 0; i < 4; i += 1) await s.tick();
  assert.deepEqual([s.imported, s.left()], [["a.pdf"], ["a.pdf"]]);
  assert.match(s.notices[0], /"a\.pdf".*not the same/);
});

test("a file that cannot be moved is imported only one time, with a notice", async () => {
  const s = setup();
  s.put("a.pdf");
  fs.writeFileSync(path.join(s.root, "block"), "");
  s.done = path.join(s.root, "block", "x");
  s.w.start();
  for (let i = 0; i < 4; i += 1) await s.tick();
  assert.deepEqual(s.imported, ["a.pdf"]);
  assert.equal(s.notices.length, 1);
  assert.match(s.notices[0], /"a\.pdf" is in Zotero, but gam could not move it/);
  // After a restart of Zotero: the content is known.
  s.w.stop();
  s.w = s.make();
  s.w.start();
  for (let i = 0; i < 4; i += 1) await s.tick();
  assert.deepEqual(s.imported, ["a.pdf"]);
});

test("a folder that is missing or not allowed gives one notice, and works when it is right", async () => {
  const s = setup();
  s.folder = path.join(s.root, "nope");
  s.w.start();
  await s.tick();
  await s.tick();
  assert.equal(s.notices.length, 1);
  assert.match(s.notices[0], /Import folder not found: .*nope/);
  s.problem = "Import folder: not here.";
  await s.tick();
  await s.tick();
  assert.equal(s.notices.length, 2);
  s.problem = null;
  s.folder = s.dir;
  s.put("a.pdf");
  await s.tick();
  await s.tick();
  assert.deepEqual(s.imported, ["a.pdf"]);
});

test("off, or without a folder: nothing happens, and it starts when the setting comes on", async () => {
  const s = setup({ on: false });
  s.put("a.pdf");
  s.w.start();
  for (let i = 0; i < 3; i += 1) await s.tick();
  assert.deepEqual([s.imported, s.notices], [[], []]);
  s.on = true;
  s.folder = "";
  for (let i = 0; i < 3; i += 1) await s.tick();
  assert.deepEqual([s.imported, s.notices], [[], []]);
  s.folder = s.dir;
  await s.tick();
  await s.tick();
  assert.deepEqual(s.imported, ["a.pdf"]);
});

test("a folder that changes starts the two scans again", async () => {
  const s = setup();
  s.put("a.pdf");
  s.w.start();
  await s.tick();
  s.w.changed();
  await s.tick();
  assert.deepEqual(s.imported, []);
  await s.tick();
  assert.deepEqual(s.imported, ["a.pdf"]);
});

test("stop ends the watch, also between two files", async () => {
  const s = setup();
  s.put("a.pdf");
  s.put("b.pdf");
  s.w.start();
  await s.tick();
  const old = s.Zotero.Attachments.importFromFile;
  s.Zotero.Attachments.importFromFile = async (o) => { const r = await old(o); s.w.stop(); return r; };
  await s.tick();
  assert.equal(s.imported.length, 1);
  assert.equal(s.left().length, 1);
  assert.equal(s.hasTimer(), false);
});

test("an error of the lookup or of the list is logged, and the watch goes on", async () => {
  const s = setup({ autoRecognize: false });
  s.put("a.pdf");
  s.w.start();
  await s.tick();
  await s.tick();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(s.errors, ["recognizer"]);
  s.Zotero.Items.getAll = async () => { throw new Error("db"); };
  s.put("b.pdf");
  await s.tick();
  await s.tick();
  assert.equal(s.errors.at(-1), "db");
  assert.equal(s.hasTimer(), true);
  assert.deepEqual(s.left(), ["b.pdf"]);
});
