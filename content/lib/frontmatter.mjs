// Frontmatter parser for the YAML subset that Sub-Sub writes.
// Pure module: no Zotero or browser globals.

const KEY_LINE = /^([A-Za-z0-9_][A-Za-z0-9_.-]*)\s*:\s*(.*)$/;
const LIST_ITEM = /^\s+-\s*(.*)$/;

function unquote(raw) {
  const s = raw.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    try {
      return JSON.parse(s);
    } catch {
      return s.slice(1, -1);
    }
  }
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  return s;
}

function inlineList(raw) {
  const inner = raw.trim().slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(",").map((part) => unquote(part)).filter((v) => v !== "");
}

/** Split a note into its frontmatter data and its body. Never throws. */
export function parseFrontmatter(text) {
  const src = String(text ?? "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = src.split("\n");
  if (lines[0].trim() !== "---") return { data: {}, body: src };
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end < 0) return { data: {}, body: src };

  const data = {};
  let listKey = null;
  for (const line of lines.slice(1, end)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const item = listKey && line.match(LIST_ITEM);
    if (item) {
      data[listKey].push(unquote(item[1]));
      continue;
    }
    const m = line.match(KEY_LINE);
    if (!m) {
      listKey = null;
      continue;
    }
    const [, key, rawValue] = m;
    const value = rawValue.trim();
    if (value === "") {
      data[key] = [];
      listKey = key;
    } else if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = inlineList(value);
      listKey = null;
    } else {
      data[key] = unquote(value);
      listKey = null;
    }
  }
  return { data, body: lines.slice(end + 1).join("\n") };
}

/** The first maxLines non-empty lines under the first heading that starts with headingPrefix. */
export function firstSection(body, headingPrefix, maxLines) {
  const lines = String(body ?? "").split("\n");
  const start = lines.findIndex((l) => l.startsWith(headingPrefix));
  if (start < 0) return "";
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2} /.test(line)) break;
    if (!line.trim()) continue;
    out.push(line.trim());
    if (out.length >= maxLines) break;
  }
  return out.join("\n");
}
