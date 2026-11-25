// Path helpers for macOS paths. Pure module: no Zotero or browser globals.
// PathUtils.join rejects parts that contain "/", so gam joins paths here.

/** Join a root folder and relative paths, each of which can have several parts. */
export function joinPath(root, ...parts) {
  const rest = parts.flatMap((p) => String(p).split("/")).filter(Boolean);
  const base = String(root).replace(/\/+$/, "");
  return [base, ...rest].join("/");
}

/** Replace a leading ~ with homeDir. */
export function expandHome(path, homeDir) {
  const p = String(path);
  if (p === "~") return joinPath(homeDir);
  if (p.startsWith("~/")) return joinPath(homeDir, p.slice(2));
  return joinPath(p);
}

/**
 * null when value (the literature folder setting, without leading or trailing "/") is a folder
 * inside the vault that the scan reads, else the message for the user.
 */
export function checkLiteratureFolder(value) {
  const parts = String(value ?? "").split("/").filter(Boolean);
  if (!parts.length) return "Set the literature folder in Settings > gam (a folder inside the vault).";
  if (parts.some((p) => p.startsWith(".") || p.includes("\\"))) {
    return `Literature folder not valid: "${value}". Use a folder inside the vault that is not hidden, for example literature.`;
  }
  return null;
}

/**
 * The entry of names that is name: the exact name, else the only name that is the same
 * in another case or Unicode form. null when there is none or more than one.
 */
export function matchName(names, name) {
  if (names.includes(name)) return name;
  const key = (s) => s.normalize("NFC").toLowerCase();
  const same = names.filter((n) => key(n) === key(name));
  return same.length === 1 ? same[0] : null;
}

/**
 * null when gam can import from folder and move the files to done, else the message for the user.
 * home, vault ("" for none) and dataDir: the folders that gam does not import from or move to.
 */
export function checkImportFolders(folder, done, { home, vault, dataDir }) {
  const key = (p) => `${joinPath(p).normalize("NFC").toLowerCase()}/`;
  const meet = (a, b) => key(a).startsWith(key(b)) || key(b).startsWith(key(a));
  const full = (p) => p.startsWith("/") && !p.split("/").includes("..");
  for (const p of [folder, done]) {
    if (!full(p)) return `Import folder: write the full path (it starts with "/" or "~/", without ".."): ${p}`;
    if (key(home).startsWith(key(p))) return `Import folder: the home folder, or a folder that holds it, is not possible: ${p}`;
    if (vault && meet(p, vault)) return `Import folder: not in the vault, and not a folder that holds it: ${p}`;
    if (meet(p, dataDir)) return `Import folder: not in the Zotero data folder, and not a folder that holds it: ${p}`;
  }
  if (key(folder) === key(done)) return `Import folder: choose another folder for the imported files: ${done}`;
  return null;
}
