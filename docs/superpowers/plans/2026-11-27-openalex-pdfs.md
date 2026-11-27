# PDFs from OpenAlex Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Goal: gam adds OpenAlex to Zotero's Find Full Text (setting) and gives a command "Find PDF in OpenAlex" that can also use the OpenAlex copy with an API key kept in Zotero's login store.

Architecture: pure rules in content/lib/openalex.mjs; the key store in content/openalex-key.mjs; the resolver sync and the command in content/find-pdf.mjs; wiring in gam.mjs, ui/menu.mjs, preferences.xhtml with a pane script, bootstrap.js. Zotero does the downloads (addFileFromURLs, HTTP.download, Attachments.importFromFile).

Tech Stack: Zotero 10 bootstrap plugin, ES modules, `node --test`, no dependencies.

Spec: docs/superpowers/specs/2026-11-27-openalex-pdfs-design.md

## Global Constraints

- Resolver entry name: `OpenAlex (gam)`. Pref of the list: `extensions.zotero.findPDFs.resolvers` (Zotero.Prefs name `findPDFs.resolvers`), default `[]`.
- Selector: `.locations{.is_oa === true}{.pdf_url ^= "http"}`; url `https://api.openalex.org/works/doi:{doi}?select=locations`; mappings `{"url": "pdf_url", "pageURL": "landing_page_url"}`; `"automatic": true`.
- gam setting: `extensions.gam.openAlexPDFs`, default false.
- Key: login store, origin `chrome://gam`, realm `OpenAlex API key`, user `API key`, value encrypted with `Zotero.OSKeyStore.encrypt`. Never stored without encryption. Never in a URL, a pref, a notice or a debug line.
- Key sent only as header `Authorization: Bearer <key>`.
- Lookup URL of the command: `https://api.openalex.org/works/doi:<encodeURIComponent(doi)>?select=id,locations,has_content,content_urls`.
- No email to OpenAlex. No title or PMID lookup.
- Text in STE. No emojis. Commits: Tiago Jacinto, no Claude lines.
- Do not read or copy the code of the old OpenAlex plugin into gam (keep gam's code its own).

## Review Focus

1. A DOI with "/", "<", "#" or "?" (old Wiley and SICI DOIs): the lookup URL must encode it (test in Task 1).
2. The user's own entries in the resolver list (a single object, other names, odd spacing): they stay, in order (Task 1).
3. A PDF that arrives for an item while the run goes (Find Full Text at the same time): gam checks again just before each item (Task 3).
4. A key with spaces or a new line from a paste: trimmed; an empty field removes the key (Task 2).
5. An item that goes to the trash or a read-only library during the run: skipped, not an error (Task 3).

---

### Task 1: Pure rules (content/lib/openalex.mjs)

Files: create content/lib/openalex.mjs, test/openalex.test.mjs.

Interfaces, produces:
- `RESOLVER_NAME = "OpenAlex (gam)"`, `RESOLVER` (the entry object).
- `nextResolvers(raw: string|undefined|null, on: boolean) -> {value: string|null, changed: boolean} | {error: string}`. value null means clear the pref. A single object with `method` counts as a list of one. Invalid JSON or a value that is not a list or such an object gives `{error}`.
- `workURL(doi: string) -> string`.
- `openLinks(work) -> {url, pageURL?}[]`: locations with `is_oa === true` and a `pdf_url` that starts with "http", in order, no repeated url.
- `hostedLink(work) -> string|null`: `content_urls.pdf` when `has_content.pdf === true`.
- `failure(status: number) -> "key"|"budget"|"missing"|"offline"|"error"`: 401 and 403 key, 429 budget, 404 missing, 0 offline.
- `looksLikePDF(bytes: Uint8Array) -> boolean`: "%PDF-" in the first 1024 bytes.
- `summary({attached, hosted, notFound, skipped, errors}) -> string` (lines for notify).

- [ ] Step 1: Tests. `nextResolvers(undefined, true)` gives a list with RESOLVER; `nextResolvers('[{"name":"X",...}]', true)` keeps X first then gam; off removes only gam's entry; off on `[gam]` gives `{value: null, changed: true}`; on when the same entry is there gives `changed: false`; an older gam entry (other url) is replaced, `changed: true`; `"{bad"` gives `{error}`; a single object is kept. `workURL("10.1002/(SICI)1097-4571(199806)49:8<693::AID-ASI4>3.0.CO;2-0")` has no raw "<", "#" or "?" after `doi:`. openLinks on the fixture test/fixtures/openalex-work.json (the answer for 10.1371/journal.pone.0000308, saved on 2026-11-27) gives exactly the PMC pdf link. hostedLink false when has_content.pdf is false. looksLikePDF true for "%PDF-1.7", true with 10 bytes before it, false for "<html". failure(401), (403), (429), (404), (0), (500).
- [ ] Step 2: `node --test test/openalex.test.mjs`. Expected: FAIL, module not found.
- [ ] Step 3: Write the module.
- [ ] Step 4: Same command. Expected: PASS. Then `npm test`: all pass.
- [ ] Step 5: Commit "OpenAlex: pure rules for the resolver entry and the lookup".

### Task 2: The key store (content/openalex-key.mjs)

Files: create content/openalex-key.mjs, test/openalex-key.test.mjs.

Interfaces, produces: `getKey({Zotero, Services}) -> Promise<string>` ("" when none or when it cannot be decrypted), `setKey({Zotero, Services, LoginInfo}, key) -> Promise<"saved"|"removed"|"unchanged">`. LoginInfo is the nsLoginInfo constructor (tests pass a fake). Uses `Services.logins.findLogins(origin, null, realm)`, `addLoginAsync`, `modifyLogin`, `removeLogin`, `Zotero.OSKeyStore.encrypt/decrypt/isEncrypted`.

- [ ] Step 1: Tests with a fake login store and a fake OSKeyStore (encrypt adds a prefix). Save then get gives the key; the stored password is not the key; "  k \n" is saved as "k"; "" removes; a second save modifies (one login only); encrypt throws: setKey rejects and nothing is stored; a stored value that is not encrypted: getKey gives "" (call: gam never wrote it).
- [ ] Step 2: Run, expect FAIL.
- [ ] Step 3: Write the module.
- [ ] Step 4: Run, PASS; `npm test`.
- [ ] Step 5: Commit "OpenAlex: the API key in Zotero's login store, encrypted".

### Task 3: Resolver sync and the command (content/find-pdf.mjs)

Files: create content/find-pdf.mjs, test/find-pdf.test.mjs.

Interfaces:
- Consumes Task 1 and Task 2.
- Produces `syncResolver(Gam, on: boolean) -> boolean` (true when written). Uses `Zotero.Prefs.get/set/clear("findPDFs.resolvers")`. On `{error}`: no write, `notify` once: "gam cannot change the PDF resolvers: the setting findPDFs.resolvers is not valid JSON."
- Produces `findPDFs(Gam, items, deps?) -> Promise<summary counts>`. deps (for tests) default to Zotero: `request` (Zotero.HTTP.request), `download` (Zotero.HTTP.download), `addFileFromURLs`, `importFromFile`, `getKey`, `readHead(path)` (IOUtils.read maxBytes 1024), `tempPath()`, `remove(path)` (only gam's temp file).
- Eligible: regular item, canChange, DOI from field or Extra (Zotero.Utilities.cleanDOI), no PDF or EPUB attachment. Checked once at the start for the counts and again before each item (Review Focus 3, 5).
- For each item: request workURL with `responseType: "json"`, headers with the key when there is one, `successCodes: false`; status by `failure`. missing: notFound. key, budget, offline: stop the run, notice with the reason. Then addFileFromURLs(item, openLinks(work)) when there are links. When no attachment and key and hostedLink: download to tempPath with the header; status not 200, or not looksLikePDF: remove the temp file, count notFound (or stop for key and budget); else importFromFile({file, parentItemID, fileBaseName: Zotero.Attachments.getFileBaseNameFromItem(item), contentType: "application/pdf", moveFile: true}), count hosted.
- One run at a time: a second call while one runs gives notice "Find PDF in OpenAlex runs already." and returns null.
- At the end: notify(summary(...)).

- [ ] Step 1: Tests with fakes: sync adds, keeps others, removes, clears when empty (Prefs.clear called, not set "[]"), invalid JSON no write and one notice; command: items without DOI and with a PDF are skipped and counted; open link attached, no download; no open link and key and hosted: download with header, import called; no key: no download; download with "<html": no import, temp removed; 401 stops after the first item and later items get no request; 429 same with the budget text; the key is in no URL given to request or download (assert on every call); a PDF that appears before item 2 is processed: item 2 skipped; second call during a run returns null.
- [ ] Step 2: Run, expect FAIL.
- [ ] Step 3: Write the module.
- [ ] Step 4: Run, PASS; `npm test`.
- [ ] Step 5: Commit "Find PDF in OpenAlex and the OpenAlex entry in Find Full Text".

### Task 4: Wiring, settings, menu, README

Files: modify prefs.js, bootstrap.js, content/gam.mjs, content/ui/menu.mjs, content/preferences.xhtml, locale/en-US/gam.ftl, README.md, test/menu.test.mjs, test/preferences.test.mjs; create content/preferences.js.

- prefs.js: `pref("extensions.gam.openAlexPDFs", false);`.
- gam.mjs: `prefs.openAlexPDFs()`; at startup `syncResolver(this, this.prefs.openAlexPDFs())`; a pref observer that calls it again; in shutdown `syncResolver(this, false)` (shutdown does not run at app quit, so the entry stays between sessions); `actions.findPDFs`.
- menu.mjs: item entry `gam-menu-find-pdf`, visible when a selected regular item can change and has a DOI and no PDF or EPUB (helper from find-pdf.mjs).
- bootstrap.js: register the pane with `scripts: ["chrome://" + pkg + "/content/preferences.js"]`.
- preferences.js (pane script): finds the package from its own URL (`Components.stack.filename`), imports openalex-key.mjs, fills the password field at load, saves on the "change" event, shows "Saved", "Removed" or the error in a status line with role="status".
- preferences.xhtml: group "PDFs": checkbox `extensions.gam.openAlexPDFs`, help text, label + `<html:input type="password" id="gam-pref-openalex-key" aria-labelledby=...>` without a preference attribute, help text, status line.
- gam.ftl: the new labels. README: a "PDFs from OpenAlex" part and the two settings rows.

- [ ] Step 1: Tests: the menu entry shows for an item with DOI and no PDF, hides with a PDF or without DOI; the pane test keeps passing (labels); a new pane test: the password field has no preference attribute and the pane script name is in bootstrap.js.
- [ ] Step 2: Run, expect FAIL.
- [ ] Step 3: Write the code.
- [ ] Step 4: `npm test`: all pass.
- [ ] Step 5: Commit "OpenAlex: settings, menu and README".

### Task 5: Check in a test Zotero

Not a code task. In the test profile (scratchpad z62, port 23997) with the build of the branch:
- Setting on: prefs.js has the entry; setting off: the entry goes; another entry put by hand stays.
- Find Full Text on an item with a DOI and no PDF: the debug log has "via OpenAlex (gam)".
- The command on 3 items (one with an open PDF, one without DOI, one with a PDF): one attached, two skipped, one notice.
- The key field: a fake key is saved, survives a restart, is not in prefs.js and not in the debug log; the command with the fake key stops with "OpenAlex refused the API key".
- With the user's real key (only if the user gives one): an OpenAlex copy is attached.
- Keyboard only in the pane; light and dark.
Record what was not possible.
