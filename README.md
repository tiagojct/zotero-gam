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
- Context menu of items: Open note in Obsidian, Create note, Add Zotero link to note, Copy [[citekey]], Copy [@citekey] (a Pandoc citation; a key with characters that Pandoc would cut short is written as `[@{key}]`).
- Context menu of collections: Create notes for collection.
- Tools menu: Refresh gam index.

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

- The vault folder must contain the `.obsidian` folder.
- The literature folder is a folder inside the vault. It cannot be hidden or contain "..".
- gam does not follow links to folders (symbolic links). Notes in a linked folder do not show in Zotero.
- gam reads the vault again when you return to the Zotero window (at most once each 30 seconds) and one second after a setting changes. It reads only the files that changed. Tools > Refresh gam index reads all files again.

## Development

Run the tests with `npm test`. See CLAUDE.md for the development install.

## License

MIT. See LICENSE.
