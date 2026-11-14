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
4. Start Zotero. Zotero turns off a plugin added this way: turn gam on in Tools > Plugins.
5. After a code change, restart Zotero. Turning the plugin off and on is not enough: Zotero keeps the old modules in memory.
6. For a debug log, start Zotero with `/Applications/Zotero.app/Contents/MacOS/zotero -ZoteroDebugText > log 2>&1`. gam lines start with "gam:".

## Release

1. Change the version in manifest.json.
2. Add the new version to updates.json (version and update_link).
3. Commit, then push a tag `v<version>`. The release workflow checks the tag, runs the tests, builds the .xpi and attaches it to a GitHub release.

Zotero reads update_url (the raw updates.json on main) to find updates. This works only when the repo and its releases are public.
