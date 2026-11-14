// The literature note that "Create note" writes, in the Sub-Sub format.
// Pure module: no Zotero or browser globals.

import { yearOf } from "./citekey.mjs";

export function yamlString(s) {
  return JSON.stringify(String(s ?? "").replace(/\r?\n/g, " "));
}

function authorName(c) {
  if (c.lastName) return c.firstName ? `${c.lastName}, ${c.firstName}` : c.lastName;
  return c.name ?? "";
}

/** data is the Zotero item JSON (item.toJSON()). */
export function noteFromItem(data, { citekey, itemKey, today }) {
  const authors = (data.creators ?? []).filter((c) => c.creatorType === "author").map(authorName).filter(Boolean);
  const year = yearOf(data);
  const venue = data.publicationTitle || data.bookTitle || data.publisher || "";
  const lines = ["---", `title: ${yamlString(data.title ?? "")}`];
  if (authors.length) {
    lines.push("authors:", ...authors.map((a) => `  - ${yamlString(a)}`));
  } else {
    lines.push("authors: []");
  }
  if (year) lines.push(`year: ${year}`);
  lines.push(`citekey: ${citekey}`, `item-type: ${data.itemType ?? ""}`);
  if (venue) lines.push(`venue: ${yamlString(venue)}`);
  if (data.DOI) lines.push(`doi: ${yamlString(data.DOI)}`);
  lines.push(
    `zotero: zotero://select/library/items/${itemKey}`,
    "status: to-read",
    "tags: []",
    `created: ${today}`,
    "---",
    "",
    "## Summary",
    "",
    "## Key points",
    "",
  );
  return lines.join("\n");
}
