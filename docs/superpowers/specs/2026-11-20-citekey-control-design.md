# Citation key control in gam

Date: 2026-11-20. Approved in the session of 2026-11-20.

## Intent

Every item that the user cites has a stable citation key, without Better BibTeX. gam gives keys,
reports key problems, and warns when a key that the vault uses changes. zotero-local-mcp stays a
second writer of keys. Both tools follow the same rules, and checks keep them consistent.

## Goals

- New items get a key (setting, off by default).
- A command gives keys to many items, after a preview.
- A report shows duplicate keys and items with two different keys (field and Extra).
- A change of a key that the vault uses is never silent.

## Non-goals

- Export to BibTeX or CSL JSON. First check if the native Zotero export uses the citationKey field.
- Key formats other than the current rule (citekey.mjs / citekey.py).

## Anti-goals

- gam never changes a key that exists. It only gives a key to an item that has none.
- No write without a preview, except the automatic key of a new item (setting on, at most 20 items in one batch).

## Approach

Chosen: gam does the work in Zotero (it sees each local change and the whole vault); zotero-local-mcp
gets the same "taken" rule and refuses to change a cited key. Rejected: one owner of keys (the user
wants both writers for now); Better BibTeX (not used).

## Design

gam
- Pref `extensions.gam.autoKey` (false). The item notifier collects "add" events for 2 s. Then, for each
  regular, editable item that is not in the trash, still has no key, and has a year and a creator or
  a title, gam gives a key. More than 20 items in one batch: no write, one notice.
- One queue for all key writers in gam (automatic keys and Citation keys), so each plans with the
  keys that the one before it wrote. (Review, 2026-11-20: without it two items could get one key.)
- Tools > Citation keys…: for the selected library. The preview dialog lists the items without a key
  with the proposed keys, and below it the problems (shared keys, two keys on one item).
  Item menu > Assign citation keys: the same dialog for the selected items.
- Key watch: a map of item ID to key, read with one SQL query at each scan and after a key write.
  On "modify", gam compares the keys of the changed items. A changed key that the vault uses
  (a literature note or a citation) gives a notice with the old key, the new key and the count.
- "Taken" keys: the keys in all libraries, and the citekey and file name of each literature note
  (also in lower case). Library keys keep their case (Pandoc keys are case-sensitive).

zotero-local-mcp
- Taken keys: the library and the literature notes in `Literature/` of the Sub-Sub folder
  (file stem and frontmatter citekey). Used by set_citekeys and the two import paths.
- set_citekeys(force=True) keeps a key that has a literature note or that a note in the Sub-Sub
  folder cites, and lists it in `kept_cited`. zotero-local-mcp sees only the Sub-Sub folder; gam checks the whole vault.
- A Sub-Sub folder that is set but cannot be read gives an error: an empty set would allow a change.

Shared
- test fixtures: citekey cases plus citation cases (a text and the keys it cites). Both tools must
  find the same keys.
