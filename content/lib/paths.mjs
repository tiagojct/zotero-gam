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
