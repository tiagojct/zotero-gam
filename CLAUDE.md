# gam

Zotero 10 plugin. It shows the Obsidian vault facts of each Zotero item and creates literature notes in the Sub-Sub format.

- Design: docs/superpowers/specs/2026-11-14-gam-design.md
- Plan: docs/superpowers/plans/2026-11-14-gam.md

## Rules

- The plugin never changes or overwrites an existing vault file. It only creates new files.
- Pure logic goes in content/lib/ (no Zotero or browser globals). Node tests import it.
- The note format must stay the same as the format that Sub-Sub and zotero-local-mcp write.

## Commands

- Tests: `npm test` (Node, no dependencies).
- Build the .xpi: `scripts/build.sh` (writes build/gam-<version>.xpi).

## Development install

1. Close Zotero.
2. Write the absolute path of this repo into the file `gam@tiagojct.eu` in `~/Library/Application Support/Zotero/Profiles/<profile>/extensions/`.
3. In `prefs.js` of that profile, remove the lines `extensions.lastAppBuildId` and `extensions.lastAppVersion`.
4. Start Zotero. After a code change, restart Zotero.
