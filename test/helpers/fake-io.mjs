// IOUtils and PathUtils for Node tests, on top of the real file system.
import fs from "node:fs";
import path from "node:path";

const err = (name, message) => Object.assign(new Error(message), { name });

export function installFakeIO() {
  globalThis.PathUtils = {
    filename: (p) => path.basename(p),
    parent: (p) => path.dirname(p),
  };
  globalThis.IOUtils = {
    async stat(p) {
      const s = fs.statSync(p);
      return { type: s.isDirectory() ? "directory" : "regular", size: s.size, lastModified: Math.floor(s.mtimeMs) };
    },
    async getChildren(p) {
      return fs.readdirSync(p).map((n) => path.join(p, n));
    },
    async readUTF8(p) {
      return fs.readFileSync(p, "utf8");
    },
    // Like the real IOUtils.getFile: a Promise of an nsIFile.
    async getFile(p) {
      return { isSymlink: () => fs.lstatSync(p).isSymbolicLink() };
    },
    async exists(p) {
      return fs.existsSync(p);
    },
    async makeDirectory(p) {
      fs.mkdirSync(p, { recursive: true });
    },
    async writeUTF8(p, text, opts = {}) {
      if (opts.tmpPath) throw err("NotSupported", "the fake does not support tmpPath");
      try {
        fs.writeFileSync(p, text, { flag: opts.mode === "create" ? "wx" : "w" });
      } catch (e) {
        if (e.code === "EEXIST") throw err("NoModificationAllowedError", `${p} exists`);
        throw e;
      }
    },
  };
}

export function tempVault() {
  return fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || "/tmp"), "gam-test-"));
}
