# gam

A Zotero 10 plugin that connects Zotero to an Obsidian vault.

A gam is a meeting of two whaling ships at sea to exchange news.

## What it does

- Column "Note": the status of the item's literature note in the vault (for example to-read), "missing" when the linked file does not exist, empty when there is no note.
- Item pane section "Vault": the title, status, tags and summary of the note, and the vault notes that cite the item.
- Create note: writes `<literature folder>/<citekey>.md` with the frontmatter that Sub-Sub uses, and adds a Zotero child note with an obsidian:// link.
- Context menu: Open note in Obsidian, Create note, Copy [[citekey]].
- Tools menu: Refresh gam index.

The plugin never changes or overwrites an existing vault file.

## Install

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

## Development

Run the tests with `npm test`. See CLAUDE.md for the development install.

## License

MIT. See LICENSE.
