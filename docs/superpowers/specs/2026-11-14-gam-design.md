# gam: design

Date: 2026-11-14. Status: approved (scope of v1 includes Create note).

A gam is a meeting of two whaling ships at sea to exchange news. This plugin lets Zotero and the Obsidian vault exchange news.

## Intent

Zotero shows what the vault knows about each item, and the user can create a literature note from Zotero without Claude.

Today the link exists only when Claude makes it (Sub-Sub, or attach_note in tools/zotero-local-mcp). Zotero does not know which items have a note, if the file still exists, the status and tags of the note, or which vault notes cite the item.

## Goals

- Show in the item list if an item has a vault note, and its status.
- Show in the item pane the vault facts about the item and the vault notes that refer to it.
- Create a literature note in the vault from Zotero, in the same format that Sub-Sub writes.
- Open the note in Obsidian from Zotero.

## Non-goals (v1)

- Status changes from Zotero ("mark as read"). Candidate for v2: a write to the one frontmatter line.
- Tag sync between Zotero and the vault. zotero-local-mcp manages the tag vocabulary.
- Export of annotations and highlights.
- LLM features of any kind.

## Anti-goals

- The plugin never changes the body or frontmatter of an existing vault file.
- The plugin never overwrites a file.
- The plugin needs neither Obsidian nor Claude to run.
- The plugin causes no Obsidian Sync conflict (follows from the first two points).

## Constraints

- Zotero 10.0.9 (installed). The bundle has `Zotero.ItemTreeManager.registerColumn`, `Zotero.ItemPaneManager.registerSection` (onRender, onAsyncRender, sidenav) and `Zotero.MenuManager` (target `main/library/item`).
- Vault: ~/quarterdeck/powerslave (has .obsidian/; Obsidian vault name Powerslave). Not in git; Obsidian Sync.
- Literature notes: `sub-sub/literature/<citekey>.md`, 31 files on 2026-11-14.
- File and folder names: lowercase, hyphens, no accents.
- No emojis in files or commits.

## Approaches

| Approach | Trade-off | Decision |
|---|---|---|
| A. The plugin reads the vault files from disk | No dependency; works with Obsidian and Claude closed; the plugin must parse frontmatter | Chosen |
| B. Obsidian Local REST API | Needs Obsidian open and one more Obsidian plugin | Rejected |
| C. zotero-local-mcp writes an index file that the plugin reads | Zotero then depends on a Claude-side job; the index can be old | Rejected |

## Format contract with Sub-Sub

Literature note frontmatter, as Sub-Sub writes it now (example: sub-sub/literature/abdulnour2025.md):

```yaml
---
title: "..."
authors:
  - Surname, Given
year: 2025
citekey: abdulnour2025
item-type: journalArticle
venue: New England Journal of Medicine
doi: 10.1056/...
zotero: zotero://select/library/items/SCC3C8XC
evidence: abstract
status: to-read
tags:
  - topic/...
created: 2026-10-09
---
```

Body sections: `## Summary (from abstract)`, `## Key points`, and more.

Zotero child note, as attach_note writes it:

```html
<div><p>summary</p><p><a href="obsidian://open?vault=Powerslave&file=sub-sub%2Fliterature%2Fabdulnour2025">Obsidian: abdulnour2025</a></p></div>
```

The `file` value is the path from the vault root, URL-encoded with `/` encoded, without `.md`. The note has the marker tag of zotero-local-mcp when one is set.

## Citekey rule

Same as `current_key` in tools/zotero-local-mcp/src/zotero_local_mcp/citekey.py: the native `citationKey` field, else a `Citation Key: ...` line in Extra.

## Features

### 1. Column "Note"

- Value: the `status` of the linked note (for example to-read, read); "no status" when the field is missing.
- A warning mark when the item has an obsidian:// child note but the file does not exist.
- Empty when the item has no note.
- Sortable.

### 2. Item pane section "Vault"

- Title, status and `topic/` tags of the note.
- The first lines of the first `## Summary` section.
- "Cited in": the vault notes that refer to the item. A note refers to an item when it contains `[[citekey]]`, `[[citekey|...]]`, `@citekey`, the `zotero://select/.../items/<key>` URI or the DOI (case-insensitive). The literature note itself is not listed.
- Buttons: Open in Obsidian; Create note (only when no note exists).
- A click on a "Cited in" row opens that note in Obsidian.

### 3. Create note

1. Get the citekey. When the item has none, compute it with the base_key rule of zotero-local-mcp (port to JavaScript), add a suffix a, b, ... on a collision with the library or the vault, and write it to the native `citationKey` field.
2. Refuse when `sub-sub/literature/<citekey>.md` exists.
3. Write the file with the frontmatter above: title, authors, year, citekey, item-type, venue (publicationTitle, else bookTitle, else publisher), doi when present, zotero URI, `status: to-read`, `tags: []`, created (today). Leave out `evidence`; Sub-Sub sets it when it fills the note.
4. Body: `## Summary` and `## Key points`, empty.
5. Add the Zotero child note in the attach_note format, with the text "Literature note in the vault." in place of the summary, and the marker tag when set in the preferences.
6. Add the new note to the index and refresh the row.
7. Open the note in Obsidian (preference, default on).

The plugin writes the file to a temporary name in the same folder and renames it, so Obsidian never reads a half-written file.

### 4. Context menu on items

- Open note in Obsidian.
- Create note.
- Copy `[[citekey]]`.

### 5. Refresh

A Refresh entry in the Tools menu rebuilds the index.

## Index

- The plugin scans the vault at startup, when the Zotero main window gets focus (at most once each 30 s), and on Refresh.
- Literature index: the files in the literature folder, by citekey and by Zotero key (from the `zotero:` field).
- Reference index: all .md files in the vault, except the folders in the exclude list, scanned for the patterns of "Cited in".
- Link index: the obsidian:// links in the Zotero child notes, read through the Zotero API and updated through `Zotero.Notifier` on note changes.
- Expected size: about 2,000 files. Target: a full scan in under one second. The scan is async and does not block the UI.

## Preferences

| Preference | Default |
|---|---|
| Vault folder | ~/quarterdeck/powerslave |
| Obsidian vault name | the vault folder name (powerslave). Existing links use vault=Powerslave; compare without case. |
| Literature folder (in the vault) | sub-sub/literature |
| Folders that "Cited in" leaves out | archive, .obsidian, .trash |
| Marker tag for the child note | empty |
| Open the new note in Obsidian | on |

## Build

- Repo: tools/gam, Quarterdeck type other.
- Plain JavaScript bootstrap plugin: manifest.json, bootstrap.js, modules, a Fluent .ftl locale (English), a preferences pane. No build step for the code.
- Release: an .xpi from a GitHub Actions workflow on a tag.
- Tests: unit tests (Node, no Zotero) for the frontmatter parser, the citekey rule, the reference patterns, the obsidian:// URI builder and parser, and the note template. A manual check in Zotero against the 31 literature notes.

## Left to the builder

- Module layout and names.
- The look of the column mark and of the pane section, inside Zotero's own styles.
- The update URL for the .xpi.
