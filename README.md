# gam

A Zotero 10 plugin that connects Zotero to an Obsidian vault.

A gam is a meeting of two whaling ships at sea to exchange news.

## What it does

- Column "Note": the status of the item's literature note in the vault (for example to-read), with a coloured dot for to-read, reading and read, "missing" when the linked file does not exist, empty when there is no note.
- Column "Cited in": the number of vault notes that cite the item, by citekey (`[[key]]`, `@key`, `[@key]`, `[@{key}]`), Zotero link or DOI. The first click on the header shows the most cited items first.
- Item pane section "Vault": the title, status, tags and summary of the note, and the vault notes that cite the item.
- Create note: writes `<literature folder>/<citekey>.md` with the frontmatter that Sub-Sub uses, and adds a Zotero child note with an obsidian:// link.
- Create notes for collection: for the items of a collection that have no note. It shows a list of the files and citekeys first and writes nothing until you select Create. Clear the box of a note to leave it out. The items are those that the item list shows, so "Show Items from Subcollections" counts.
- Add Zotero link to note: for an item whose literature note is in the vault but has no child note with the obsidian:// link (for example a note that another tool wrote), adds that child note. It also sets the citekey of the note when the item has none and no other item uses it. It writes nothing in the vault.
- Citation keys: gam gives keys in the form jacinto2026, jacinto2026a (the rule of zotero-local-mcp). It never changes a key that exists.
  - Tools > Citation keys…: for the library selected in the left pane. It lists the items without a key with the proposed keys, and the problems: a key that two items share (case ignored), and an item with one key in the field and another in Extra. Nothing is written until you select Assign. gam does not fix the problems.
  - Give new items a citation key (setting, off by default): a new item gets a key 2 seconds after it is added, when it has a year and a creator or a title. An item made with New Item is empty at first, so it gets no automatic key: use Citation keys… when its fields are filled in. When more than 20 items arrive at once (for example, a first sync), gam gives no keys and says so.
  - Key watch: when the key of an item changes (by hand, by a sync, or by another tool) and the vault uses the old key in a literature note or a citation, gam shows a notice with the old key, the new key and the notes. It cannot stop the change.
  - A new key never takes a key of the library, or the citekey or file name of a literature note. For notes, case does not count (smith2020.md and Smith2020.md are the same file on macOS). For library keys it counts, as in Pandoc.
- Context menu of items: Open note in Obsidian, Create note, Add Zotero link to note, Assign citation keys…, Copy [[citekey]], Copy [@citekey] (a Pandoc citation; a key with characters that Pandoc would cut short is written as `[@{key}]`).
- Context menu of collections: Create notes for collection.
- Tools menu: Citation keys…, Refresh gam index.
- Selection endpoint: `GET http://127.0.0.1:23119/gam/selection` gives the items selected in the Zotero window (or the paper open in the reader), with key, library, type, title, citekey and DOI, and the selected collection. zotero-local-mcp reads it for get_selected_items. It reads only. It refuses requests from web pages (an Origin header) and from browsers.

The plugin never changes or overwrites an existing vault file.

## Install

gam needs Zotero 10 on macOS or Linux. It is not tested on Windows, and its vault paths use "/".

1. Download `gam-<version>.xpi` from the latest release.
2. In Zotero, select Tools > Plugins, then drag the file into the window.

## Preferences

Zotero Settings > gam:

| Preference | Default |
|---|---|
| Vault folder | empty: set it before first use |
| Obsidian vault name | empty (the vault folder name) |
| Literature folder | literature |
| Folders that "Cited in" leaves out | archive,.obsidian,.trash |
| Marker tag for the child note | empty |
| Open the new note in Obsidian | on |
| Give new items a citation key | off |

- The vault folder must contain the `.obsidian` folder.
- The literature folder is a folder inside the vault. It cannot be hidden or contain "..".
- gam does not follow links to folders (symbolic links). Notes in a linked folder do not show in Zotero.
- gam reads the vault again when you return to the Zotero window (at most once each 30 seconds) and one second after a setting changes. It reads only the files that changed. Tools > Refresh gam index reads all files again.

## Development

Run the tests with `npm test`. See CLAUDE.md for the development install.

## License

MIT. See LICENSE.
