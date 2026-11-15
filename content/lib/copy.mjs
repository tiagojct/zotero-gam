// The text that "Copy" puts on the clipboard. Pure module: no Zotero or browser globals.

// Pandoc: a key starts with a letter, digit or "_", and has only alphanumerics and single internal
// punctuation characters. Any other key needs curly braces.
const PANDOC_PLAIN = /^[\p{L}\p{N}_](?:[\p{L}\p{N}_]|[:.#$%&+?<>~/-](?=[\p{L}\p{N}_]))*$/u;

/** Obsidian link: [[citekey]]. */
export function wikilink(citekey) {
  return `[[${citekey}]]`;
}

/**
 * Pandoc citation: [@citekey], or [@{citekey}] when the key has characters that Pandoc would
 * read as the end of the key. null when the key is empty or cannot be written in braces.
 */
export function pandocCite(citekey) {
  const key = String(citekey ?? "");
  if (!key || /[\s{}]/.test(key)) return null;
  return PANDOC_PLAIN.test(key) ? `[@${key}]` : `[@{${key}}]`;
}
