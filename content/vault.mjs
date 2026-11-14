// File access to the vault. Uses IOUtils and PathUtils (available in system modules).

/** True when root is an existing folder. */
export async function vaultExists(root) {
  try {
    return (await IOUtils.stat(root)).type === "directory";
  } catch {
    return false;
  }
}

/**
 * All .md files under root, as [{path, text}] with path relative to root and "/".
 * Hidden folders and the folders in exclude (paths relative to root) are skipped.
 */
export async function listMarkdown(root, exclude = []) {
  const skip = exclude.map((e) => e.trim().replace(/^\/+|\/+$/g, "")).filter(Boolean);
  const out = [];
  const prefix = root.endsWith("/") ? root : root + "/";

  async function walk(dir) {
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
        if (skip.some((s) => rel === s || rel.startsWith(s + "/"))) return;
        await walk(abs);
      } else if (name.endsWith(".md")) {
        try {
          out.push({ path: rel, text: await IOUtils.readUTF8(abs) });
        } catch {
          // Not readable as UTF-8: leave it out.
        }
      }
    }));
  }

  await walk(root);
  return out;
}

/** Write a new file. Throws "exists" when the file exists; never overwrites. */
export async function createFile(absPath, text) {
  if (await IOUtils.exists(absPath)) {
    const err = new Error(`A note with this name exists: ${absPath}. Nothing was written.`);
    err.name = "exists";
    throw err;
  }
  await IOUtils.makeDirectory(PathUtils.parent(absPath), { ignoreExisting: true, createAncestors: true });
  await IOUtils.writeUTF8(absPath, text, { mode: "create", tmpPath: absPath + ".gam-tmp" });
}
