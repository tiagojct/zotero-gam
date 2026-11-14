// obsidian:// links in the attach_note format of zotero-local-mcp.
// Pure module: no Zotero or browser globals.

const URI = /obsidian:\/\/open\?([^"'<>\s#]*)/g;

/** Percent-encode like Python urllib.parse.quote(s, safe=""). */
function quote(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function htmlEscape(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** relPath is the path from the vault root, with or without .md. */
export function buildUri(vault, relPath) {
  const file = String(relPath).normalize("NFC").replace(/\.md$/, "");
  return `obsidian://open?vault=${quote(vault)}&file=${quote(file)}`;
}

/** All obsidian://open links in a note's HTML that name a vault and a file. file ends in .md. */
export function parseUris(html) {
  const out = [];
  const text = String(html ?? "").replace(/&amp;/g, "&");
  for (const m of text.matchAll(URI)) {
    const fields = {};
    for (const part of m[1].split("&")) {
      const i = part.indexOf("=");
      if (i < 0) continue;
      try {
        fields[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1).replace(/\+/g, "%20"));
      } catch {
        // A broken escape: skip this field.
      }
    }
    if (!fields.vault || !fields.file) continue;
    const file = fields.file.normalize("NFC");
    out.push({ vault: fields.vault, file: file.endsWith(".md") ? file : file + ".md" });
  }
  return out;
}

/** The child note HTML that attach_note writes. */
export function childNoteHtml(text, uri, stem) {
  return `<div><p>${htmlEscape(text).replace(/&quot;/g, '"')}</p><p><a href="${htmlEscape(uri)}">Obsidian: ${htmlEscape(stem)}</a></p></div>`;
}
