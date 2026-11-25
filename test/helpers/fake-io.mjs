// IOUtils and PathUtils for Node tests, on top of the real file system.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

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
    async read(p, { maxBytes } = {}) {
      const b = fs.readFileSync(p);
      return new Uint8Array(maxBytes ? b.subarray(0, maxBytes) : b);
    },
    async computeHexDigest(p, method) {
      return crypto.createHash(method).update(fs.readFileSync(p)).digest("hex");
    },
    async move(from, to, { noOverwrite = false } = {}) {
      if (noOverwrite && fs.existsSync(to)) throw err("NoModificationAllowedError", `${to} exists`);
      fs.renameSync(from, to);
    },
    async makeDirectory(p) {
      fs.mkdirSync(p, { recursive: true });
    },
    async writeUTF8(p, text, opts = {}) {
      // With tmpPath, the real IOUtils writes there first and then moves the file (an atomic write).
      if (opts.tmpPath) {
        fs.writeFileSync(opts.tmpPath, text);
        fs.renameSync(opts.tmpPath, p);
        return;
      }
      if (opts.mode === "appendOrCreate") {
        fs.appendFileSync(p, text);
        return;
      }
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
