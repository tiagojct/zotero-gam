// Imports the PDF and EPUB files of a folder. Zotero makes the copy, looks up the parent and gives the name.
// gam then moves the file to another folder: it never deletes or overwrites a file. Uses IOUtils and PathUtils.

import { joinPath } from "./lib/paths.mjs";

/** The time between two scans. A file must be the same in two scans: one that still arrives is not imported. */
export const SCAN_MS = 30000;
const HEADER_BYTES = 1024;
// A notice has one line for each problem: not more than this.
const MAX_LINES = 5;

const TYPES = [
  { ext: /\.pdf$/i, name: "a PDF", starts: (text) => text.includes("%PDF-") },
  { ext: /\.epub$/i, name: "an EPUB", starts: (text) => text.startsWith("PK") },
];
const typeOf = (path) => TYPES.find((t) => t.ext.test(path));
const plural = (n) => (n === 1 ? "1 file" : `${n} files`);
const fold = (path) => path.normalize("NFC").toLowerCase();
const digest = (path) => IOUtils.computeHexDigest(path, "sha256");

/** {path, name, stamp} of a file that can be imported, or null. */
async function candidate(path) {
  const name = PathUtils.filename(path);
  if (name.startsWith(".") || !typeOf(name)) return null;
  try {
    const { type, size, lastModified } = await IOUtils.stat(path);
    if (type !== "regular" || !size || (await IOUtils.getFile(path)).isSymlink()) return null;
    return { path, name, size, stamp: `${size}/${lastModified}` };
  } catch {
    return null;
  }
}

/** Move a file into a folder, under its name or with -2, -3 and so on. It never overwrites. */
async function moveInto(path, folder) {
  await IOUtils.makeDirectory(folder);
  const [, base, ext] = PathUtils.filename(path).match(/^(.*?)(\.[^.]*)$/);
  for (let n = 1; ; n += 1) {
    const to = joinPath(folder, n === 1 ? `${base}${ext}` : `${base}-${n}${ext}`);
    if (await IOUtils.exists(to)) continue;
    try {
      await IOUtils.move(path, to, { noOverwrite: true });
      return;
    } catch (e) {
      // Another program made the same name in between: try the next one. Other errors end it: a move to
      // another volume that fails halfway leaves a copy under the name.
      if (e.name !== "NoModificationAllowedError") throw e;
    }
  }
}

/**
 * enabled(), folder(), done(): the settings (done: "" for the subfolder "imported"). check(folder, done):
 * a message when the folders are not allowed, else null.
 * start(): scan each SCAN_MS. changed(): a setting changed. stop(): end.
 */
export function makeFolderImport({ Zotero, enabled, folder, done, check, notify, setTimeout, clearTimeout }) {
  // The files of the last scan, and the ones that are done or failed (path to stamp).
  let seen = new Map();
  const handled = new Map();
  // Problems that the user knows.
  const told = new Set();
  let timer = null;
  let stopped = false;
  let round = 0;

  const tell = (problems) => {
    const fresh = problems.filter((p) => !told.has(p));
    for (const p of fresh) told.add(p);
    return fresh;
  };

  async function problemOf(dir, target) {
    const message = check(dir, target);
    if (message) return message;
    try {
      if ((await IOUtils.stat(dir)).type === "directory") return null;
    } catch {
      // Not there.
    }
    return `Import folder not found: ${dir}`;
  }

  /** The files that are the same as in the last scan. */
  async function ready(paths) {
    const now = new Map();
    const out = [];
    for (const path of [...paths].sort()) {
      const file = await candidate(path);
      if (!file) continue;
      now.set(path, file.stamp);
      if (seen.get(path) === file.stamp && handled.get(path) !== file.stamp) out.push(file);
    }
    seen = now;
    return out;
  }

  /** The files in the library: bySize, size to [{path, hash}]; linked, the paths of linked files. */
  async function libraryFiles() {
    const bySize = new Map();
    const linked = new Set();
    for (const item of await Zotero.Items.getAll(Zotero.Libraries.userLibraryID, false, false)) {
      // getAll leaves out items in the trash, but not the files of a parent in the trash.
      if (!item.isAttachment() || item.isInTrash()) continue;
      if (item.isImportedAttachment()) {
        const path = await item.getFilePathAsync();
        if (path) await addFile(bySize, path);
      } else if (item.isLinkedFileAttachment()) {
        const path = item.getFilePath();
        if (path) linked.add(fold(path));
      }
    }
    return { bySize, linked };
  }

  async function addFile(bySize, path) {
    try {
      const { size } = await IOUtils.stat(path);
      bySize.set(size, [...(bySize.get(size) || []), { path, hash: null }]);
    } catch {
      // A file that cannot be read is not the same as another one.
    }
  }

  async function inLibrary(bySize, file, hash) {
    for (const entry of bySize.get(file.size) || []) {
      try {
        entry.hash ??= await digest(entry.path);
      } catch {
        continue;
      }
      if (entry.hash === hash) return true;
    }
    return false;
  }

  /** Import one file. active(): false when the watch or its settings ended. Returns {item} or {known: true}, with problem when there is one; or only {problem}. */
  async function importOne(file, target, library, active) {
    let hash;
    try {
      // Reading also brings a file that is only in iCloud to this computer.
      const head = new TextDecoder("latin1").decode(await IOUtils.read(file.path, { maxBytes: HEADER_BYTES }));
      const type = typeOf(file.name);
      if (!type.starts(head)) {
        handled.set(file.path, file.stamp);
        return { problem: `"${file.name}" is not ${type.name}. gam did not import it.` };
      }
      hash = await digest(file.path);
    } catch (e) {
      return { problem: `gam cannot read "${file.name}" (${e.message || e}). It tries again.` };
    }
    const same = async () => (await candidate(file.path))?.stamp === file.stamp;
    const { bySize, linked } = await library();
    if (linked.has(fold(file.path))) {
      handled.set(file.path, file.stamp);
      return { problem: `"${file.name}" is a linked file in Zotero. gam leaves it in the folder.` };
    }
    if (!(await same()) || !active()) return {};
    handled.set(file.path, file.stamp);
    let result = { known: true };
    if (!(await inLibrary(bySize, file, hash))) {
      if (!active()) {
        handled.delete(file.path);
        return {};
      }
      let copy;
      try {
        const item = await Zotero.Attachments.importFromFile({ file: file.path, libraryID: Zotero.Libraries.userLibraryID });
        copy = await item.getFilePathAsync();
        if (!copy || await digest(copy) !== hash) {
          return { item, problem: `The copy of "${file.name}" in Zotero is not the same. The file stays in the folder: check it.` };
        }
        result = { item };
      } catch (e) {
        return { problem: `gam could not import "${file.name}" (${e.message || e}).` };
      }
      await addFile(bySize, copy);
    }
    // A version that came in between is not in Zotero: a later scan imports it.
    if (!(await same())) return result.item ? result : {};
    try {
      await moveInto(file.path, target);
      handled.delete(file.path);
    } catch (e) {
      result.problem = `"${file.name}" is in Zotero, but gam could not move it to ${target} (${e.message || e}).`;
    }
    return result;
  }

  async function scan() {
    const dir = enabled() ? folder() : "";
    if (!dir) {
      seen = new Map();
      return;
    }
    const thisRound = round;
    const target = done() || joinPath(dir, "imported");
    const problem = await problemOf(dir, target);
    if (problem) {
      seen = new Map();
      for (const p of tell([problem])) notify(p, false);
      return;
    }
    let children;
    try {
      children = await IOUtils.getChildren(dir);
    } catch (e) {
      seen = new Map();
      for (const p of tell([`gam cannot read the import folder ${dir} (${e.message || e}).`])) notify(p, false);
      return;
    }
    const files = await ready(children);
    if (!files.length) return;
    // An item that is made while Zotero loads the library is not complete.
    await Zotero.Libraries.userLibrary.waitForDataLoad("item");
    let all = null;
    const library = () => (all ??= libraryFiles());
    const items = [];
    const names = [];
    const known = [];
    const problems = [];
    const active = () => !stopped && round === thisRound && enabled();
    for (const file of files) {
      if (!active()) break;
      const r = await importOne(file, target, library, active);
      if (r.item) {
        items.push(r.item);
        names.push(file.name);
      }
      if (r.known && !r.problem) known.push(file.name);
      if (r.problem) problems.push(r.problem);
    }
    // Not awaited: without a network, the lookup does not end.
    if (items.length) {
      (async () => Zotero.RecognizeDocument.autoRecognizeItems(items))().catch((e) => Zotero.logError(e));
    }
    const fresh = tell(problems);
    const where = PathUtils.filename(dir);
    const lines = [
      ...(names.length ? [`${names.length === 1 ? `"${names[0]}"` : plural(names.length)} imported from ${where}.`] : []),
      ...(known.length ? [`${known.length === 1 ? `"${known[0]}" was` : `${plural(known.length)} were`} already in Zotero.`] : []),
      ...fresh.slice(0, MAX_LINES),
      ...(fresh.length > MAX_LINES ? [`${fresh.length - MAX_LINES} more problems.`] : []),
    ];
    if (lines.length) notify(lines.join("\n"), !fresh.length);
  }

  async function run() {
    timer = null;
    try {
      await scan();
    } catch (e) {
      Zotero.logError(e);
    }
    if (!stopped) timer = setTimeout(run, SCAN_MS);
  }

  return {
    start() {
      timer = setTimeout(run, SCAN_MS);
    },
    changed() {
      round += 1;
      seen = new Map();
      told.clear();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
    },
  };
}
