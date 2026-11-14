// File access to the vault. Uses IOUtils and PathUtils (available in system modules).

/** null when root is a folder that can be read, else the message for the user. */
export async function checkVault(root) {
  if (!root) return "Set the vault folder in Settings > gam.";
  try {
    if ((await IOUtils.stat(root)).type !== "directory") return `Vault folder not found: ${root}`;
  } catch {
    return `Vault folder not found: ${root}`;
  }
  try {
    await IOUtils.getChildren(root);
  } catch {
    return `Vault folder not readable: ${root}`;
  }
  return null;
}

/** True when path is a symbolic link (IOUtils.stat follows links). IOUtils.getFile returns a Promise. */
async function isSymlink(path) {
  try {
    return (await IOUtils.getFile(path)).isSymlink();
  } catch {
    return false;
  }
}

/**
 * All .md files under root, as [{path, text}] with path relative to root and "/".
 * Hidden folders and symbolic links to folders are skipped. Files in the folders of exclude
 * (paths relative to root) are listed as {path, text: "", excluded: true}, without reading them.
 */
export async function listMarkdown(root, exclude = []) {
  const skip = exclude.map((e) => e.trim().replace(/^\/+|\/+$/g, "")).filter(Boolean);
  const out = [];
  const prefix = root.endsWith("/") ? root : root + "/";

  async function walk(dir, excluded) {
    let children;
    try {
      children = await IOUtils.getChildren(dir);
    } catch {
      return;
    }
    await Promise.all(children.map(async (abs) => {
      const name = PathUtils.filename(abs);
      if (name.startsWith(".")) return;
      const rel = abs.startsWith(prefix) ? abs.slice(prefix.length) : name;
      let info;
      try {
        info = await IOUtils.stat(abs);
      } catch {
        return;
      }
      if (info.type === "directory") {
        if (await isSymlink(abs)) return;
        await walk(abs, excluded || skip.some((s) => rel === s || rel.startsWith(s + "/")));
      } else if (name.endsWith(".md")) {
        if (excluded) {
          out.push({ path: rel, text: "", excluded: true });
          return;
        }
        try {
          out.push({ path: rel, text: await IOUtils.readUTF8(abs) });
        } catch {
          // Not readable as UTF-8: leave it out.
        }
      }
    }));
  }

  await walk(root, false);
  return out;
}

/**
 * Write a new file. Throws an error named "exists" when the file exists; never overwrites.
 * mode "create" opens the file with O_EXCL, so the check and the write are one step.
 * The note is small, so one write call needs no temporary file.
 */
export async function createFile(absPath, text) {
  const exists = () => Object.assign(
    new Error(`A note with this name exists: ${absPath}. Nothing was written.`), { name: "exists" });
  if (await IOUtils.exists(absPath)) throw exists();
  await IOUtils.makeDirectory(PathUtils.parent(absPath), { ignoreExisting: true, createAncestors: true });
  try {
    await IOUtils.writeUTF8(absPath, text, { mode: "create" });
  } catch (e) {
    if (await IOUtils.exists(absPath)) throw exists();
    throw e;
  }
}
