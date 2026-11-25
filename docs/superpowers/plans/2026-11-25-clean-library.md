# Clean library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** gam 0.5.0 cleans titles, filenames and files without a parent, so that the user can remove Linter.

**Architecture:** Pure rules in content/lib/ decide what a title or filename becomes. content/clean.mjs reads Zotero, plans, and writes; content/orphans.mjs watches new files without a parent. One new dialog shows the plan and returns the choices; it writes nothing.

**Tech Stack:** JavaScript ES modules, Zotero 10.0.9 plugin API, XUL dialog, `node --test`. No dependencies.

**Spec:** docs/superpowers/specs/2026-11-25-clean-library-design.md

## Global Constraints

- Do not read or copy Linter: no code, rule names, setting names, labels or data. Call Zotero functions, do not copy them.
- Pure logic in content/lib/ (no Zotero or browser globals). Node tests import it. No dependencies.
- Feed and read-only libraries, and items in the trash, are left out. gam never changes an existing vault file.
- New settings are off by default: `cleanNew` false, `orphanNotice` false, `termsFile` "".
- At most 20 new items in an automatic batch; more gives one notice and no write.
- No case change without the window. Safe fixes only on new items, only with `cleanNew` on.
- Text in the interface: plain English, no emojis. Commits: git identity Tiago Jacinto, no Claude lines. Commit on a branch, never push.
- Never use `git checkout` or `git restore` on changed files. `npm test` passes after each task (250 tests today).
- Read the skill zotero-plugin-dev before Tasks 5 to 8.

## Review Focus

- A title with `<` as text ("p < 0.05", "FEV1 <80%"): it stays, it is not removed as a tag. (Task 1)
- A title that is one word, an acronym, or has no letters ("COVID-19", "JAMA", "1984", ""): no change, no error. (Task 2)
- A new item of the browser that Zotero still saves, or that the user edits in the 2 s: gam does not write over the newer value. (Task 5)
- The ignore file is damaged or cannot be written: the window still opens, says so, and the damaged file is not overwritten. (Task 4)
- A filename that Zotero made unique ("… 2.pdf", "…-1.pdf"): it is not a row each time. (Task 3)

## Files

| File | Responsibility |
|---|---|
| content/lib/title.mjs | safe fixes; split a title into text and tag segments |
| content/lib/terms.mjs | built-in terms, parse the user's file, terms of a language |
| content/lib/case.mjs | language of a title, Title Case, terms, abstract evidence |
| content/lib/plan-clean.mjs | rows: titles, shortTitle, filenames, ignored values |
| content/clean-store.mjs | gam-ignored.json, gam-clean.jsonl, terms file (IOUtils) |
| content/queue.mjs | `exclusive`, moved out of keys.mjs |
| content/clean.mjs | Zotero: automatic titles, plan of the window, apply |
| content/orphans.mjs | notice for a new PDF or EPUB without a parent |
| content/clean.xhtml, clean.js, ui/clean-dialog.mjs | the window (styles go in preview.css) |

Modify: content/gam.mjs, content/keys.mjs, content/ui/menu.mjs, content/preferences.xhtml, locale/en-US/gam.ftl, prefs.js, README.md, CLAUDE.md (data files), manifest.json, updates.json.

---

### Task 1: Safe title fixes

**Files:** Create content/lib/title.mjs, test/title.test.mjs

**Interfaces:**
- Produces: `segments(title: string): {text: string, tag: boolean, nocase: boolean}[]` (joined text is the title; text in a nocase span has nocase true); `safeFix(title: string): string`; `plainText(title): string` (no tags).

- [ ] **Step 1: Write the failing tests** (table test, `safeFix(a) === b`, and `safeFix(b) === b` for each row)

```js
const cases = [
  ["  A  title​  here ", "A title here"],
  ["Café study", "Café study"],
  ["Soft­ware", "Software"],
  ["A title.", "A title"],
  ["Identifying bias in research:", "Identifying bias in research"],
  ["A title ;", "A title"],
  ["Wait...", "Wait..."], ["Wait…", "Wait…"],
  ["Smith et al.", "Smith et al."], ["Made by Acme Inc.", "Made by Acme Inc."],
  ["Trade in the U.S.", "Trade in the U.S."], ["Vitamin D.", "Vitamin D."],
  ["<p>The fallacy</p>", "The fallacy"], ["<p>The fallacy", "The fallacy"],
  ["R &amp; D &lt;i&gt;x&lt;/i&gt;", "R & D <i>x</i>"], ["AT&T results", "AT&T results"],
  ["FEV<sub>1</sub> and <i>E. coli</i>", "FEV<sub>1</sub> and <i>E. coli</i>"],
  ["<b>Bold", "Bold"],
  ['<span class="nocase">eGFR</span> use', '<span class="nocase">eGFR</span> use'],
  ['<span style="font-variant: small-caps;">Ab</span>', '<span style="font-variant: small-caps;">Ab</span>'],
  ['<span class="x">word</span>', "word"],
  ["Results with p < 0.05 and FEV1 <80% > 2", "Results with p < 0.05 and FEV1 <80% > 2"],
  ["(ARIA 2008*", "(ARIA 2008*"], ["One – two — “three”", "One – two — “three”"],
  ["", ""], ["...", "..."],
];
```

- [ ] **Step 2:** Run `node --test test/title.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement. A tag is `/<\/?[a-z][a-z0-9]*(\s[^<>]*)?\/?>/i`; decode `amp lt gt quot apos nbsp` and numeric entities one time, before the tags. Unpaired allowed tags are removed.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit "Clean library: safe title fixes".

### Task 2: Terms and case proposals

**Files:** Create content/lib/terms.mjs, content/lib/case.mjs, test/terms.test.mjs, test/case.test.mjs

**Interfaces:**
- Consumes: `segments`, `plainText`.
- Produces: `parseTerms(text: string): {term: string, lang: "en"|"pt"|null}[]`; `termsFor(lang: "en"|"pt", user: ReturnType<parseTerms>): string[]` (user's terms win over built-in ones that differ only in case; longest first); `titleLanguage(title: string, field: string): "en"|"pt"|null`; `buildEvidence(abstracts: string[]): {lower: Set<string>}`; `names(abstract: string, evidence): Set<string>` (lower-case words); `caseProposal({title, lang, terms, names}): {title: string, reasons: ("terms"|"title-case")[], suggestion: string|null}` (title is unchanged and reasons empty when there is nothing; suggestion adds the abstract's capitals to title, null when it adds none).

- [ ] **Step 1: Write the failing tests**

```js
// parseTerms
parseTerms("# c\n\nDelphi\npt: Serviço Nacional de Saúde\nen:NHS \n")
  // [{term:"Delphi",lang:null},{term:"Serviço Nacional de Saúde",lang:"pt"},{term:"NHS",lang:"en"}]
// termsFor: "Portuguese" in en, not in pt; "Portugal" in both; none of
// may march august polish turkey jordan chad guinea (any case) is built in;
// "American Thoracic Society" and "European Respiratory Society" are built in (en).
termsFor("en", parseTerms("portuguese")) // has "portuguese", not "Portuguese"

// titleLanguage
["Inteligência artificial nas organizações de saúde", "en"] // "pt"
["Que número é este?: um guia sobre estatísticas", "en"]     // "pt"
["Asthma", "en"] // "en"
["Einführung in die Medizin und die Pflege", ""] // null
["Anything", "de"] // null

// caseProposal: lang en, terms = termsFor("en", []), names = empty set unless given
"Prevalence of asthma in portuguese adults" // title "Prevalence of asthma in Portuguese adults", ["terms"]
"European respiratory society/american thoracic society technical statement"
  // "European Respiratory Society/American Thoracic Society technical statement", ["terms"]
"The Role of Artificial Intelligence in Evidence-Based Medicine"
  // "The role of artificial intelligence in evidence-based medicine", ["title-case"]
"Managing Chronic Disease in Portugal: A Review of mHealth Tools"
  // "Managing chronic disease in Portugal: a review of mHealth tools"
"The Great Debate? Yes, the Great Debate Continues Today"
  // "The great debate? Yes, the great debate continues today"
"Vitamin D Supplementation for COPD Patients Under Treatment" // keeps D, COPD
"USE OF FENO IN SEVERE ASTHMA"  // "Use of feno in severe asthma", ["title-case"]
"<i>Fluent Confident Wrong</i> Models in Higher Education" // tags stay
'The <span class="nocase">Great Big</span> Study of Severe Asthma Outcomes Today' // span text stays
// no change, reasons [], suggestion null: "COVID-19", "JAMA", "1984", "", "Piranesi",
// "Herman Melville and the wake", "How chatbots will reshape medicine"
// names: {delphi} and "Key competencies – a delphi study"
//   title unchanged, reasons [], suggestion "Key competencies – a Delphi study"
// names: {dalton} and "Misconception of Dalton Law in Respiratory Physiology Teaching"
//   title "Misconception of Dalton law in respiratory physiology teaching", suggestion null
// lang pt: "Inovação Pedagógica Digital na Medicina Portuguesa Moderna em Portugal"
//   "Inovação pedagógica digital na medicina portuguesa moderna em Portugal"
// lang null: never a change. Final "*" or "†": suggestion without it, title unchanged.

// names: in the middle of a sentence with a capital, never in lower case in this abstract
// or in any abstract of the library
names("We used the Delphi method and Artificial Intelligence.", buildEvidence(["artificial intelligence", "a method"]))
  // Set {"delphi"}
names("Delphi. The Delphi.", buildEvidence(["a delphi panel"])) // empty
```

- [ ] **Step 2:** Run both tests. Expected: FAIL.
- [ ] **Step 3:** Implement. Middle of a sentence: after a lower-case letter, comma or "(" and a space, or after "/" or "-". Words have 3 letters or more. Title Case: at least 4 content words (4 letters or more, not the first word of a sentence, not an acronym) and 70% or more with a capital. All capitals: 3 words or more and no lower-case letter. Terms match whole words (Unicode), case ignored, and also across a "/" border; a term never changes the first letter of the title to lower case.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Check on real data: a throw-away script in the scratchpad copies ~/Zotero/zotero.sqlite with `cp`, dumps titles, abstracts and languages with python3 to JSON, and runs `caseProposal` on them. Expected (measured 2026-11-25 with this evidence rule, before terms): suggestions for 54 titles or fewer. No title in Titles loses a capital that it should keep: read the list. Remove a built-in term that gives a wrong row. Do not commit library data.
- [ ] **Step 6:** Commit "Clean library: terms and case proposals".

### Task 3: Rows

**Files:** Create content/lib/plan-clean.mjs, test/plan-clean.test.mjs

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: `planTitle({id, libraryID, key, type, title, language, abstract}, {userTerms, evidence, ignored}): {id, kind: "title"|"suggestion", from, to, reasons} | null` (reasons also has "safe"); `needsNotice(row): boolean` (kind "title" with "terms" or "title-case"); `newShortTitle(oldTitle, newTitle, shortTitle): string`; `planFile({id, libraryID, key, parentID, current, template, ignored}): {id, parentID, from, to} | null`; `ignoreKey({libraryID, key, kind: "title"|"suggestion"|"file", value}): string`; `CASE_TYPES: Set<string>` (the list of the spec).

- [ ] **Step 1: Write the failing tests**

```js
// planTitle: "Asthma in portuguese adults." -> kind "title", to "Asthma in Portuguese adults", reasons ["safe","terms"]
// type "statute", "ASTHMA IN THE WORLD." -> to "ASTHMA IN THE WORLD", reasons ["safe"]
// safe fix and abstract word -> kind "title", "to" without the suggestion
// only abstract word -> kind "suggestion", reasons ["abstract"]
// title ignored with the same value -> null; ignored with an older value -> row
// title "" -> null
newShortTitle("Asthma in portuguese adults: a survey", "Asthma in Portuguese adults: a survey", "asthma in Portuguese Adults") // "Asthma in Portuguese adults"
newShortTitle("Asthma: a survey", "Asthma: a survey of adults", "EPI") // "EPI"
newShortTitle("Asthma in adults", "Something else here", "Asthma in") // "Asthma in"  (edited: words differ)
newShortTitle("A  b: c", "A b: c", "") // ""
// planFile: same name -> null; "T 2.pdf" and "T-1.pdf" with template "T.pdf" -> null;
// "T 2020.pdf" with template "T.pdf" -> row; NFC and NFD of one name -> null; "t.pdf" and "T.pdf" -> row
```

- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. A unique suffix is " " or "-" and 1 or 2 digits. **Step 4:** `npm test` passes. **Step 5:** Commit "Clean library: rows".

### Task 4: Data files

**Files:** Create content/clean-store.mjs, test/clean-store.test.mjs (use test/helpers/fake-io.mjs, add to it what is not there)

**Interfaces:**
- Produces: `loadIgnored(dir): Promise<{keys: Set<string>, error: string|null}>`; `saveIgnored(dir, addedKeys: string[]): Promise<string|null>` (reads again, merges, writes atomically; returns an error text or null); `appendLog(dir, {date, libraryID, key, field, old, new}): Promise<void>`; `loadTerms(path, homeDir): Promise<{terms, error: string|null}>` (cached by path, mtime and size). Files: gam-ignored.json `{"version": 1, "keys": [...]}`, gam-clean.jsonl. `dir` is Zotero.DataDirectory.dir.

- [ ] **Step 1: Write the failing tests:** no file gives an empty set and no error; save then load; two saves merge; damaged JSON gives an error, and saveIgnored then returns an error and the file keeps its bytes; a write failure returns an error text; appendLog twice gives two lines that parse; a terms file that changes is read again; a terms file that does not exist gives an error text and []; path "" gives [] and no error; "~/x" uses homeDir.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement with IOUtils (`tmpPath` for the atomic write, `mode: "appendOrCreate"`). **Step 4:** `npm test` passes. **Step 5:** Commit "Clean library: data files".

### Task 5: Automatic titles for new items

**Files:** Create content/queue.mjs, content/clean.mjs, test/clean.test.mjs. Modify content/keys.mjs (import `exclusive`), content/gam.mjs (`queueNewItems`, prefs), prefs.js

**Interfaces:**
- Consumes: Tasks 1 to 4.
- Produces: `exclusive(fn)`; `autoTitles(Gam, ids): Promise<{fixed: number, toCheck: number}>`; `writeTitle(Gam, item, from, to): Promise<"written"|"changed">` (title and shortTitle in one saveTx, then appendLog); `libraryEvidence(Gam, libraryID)` (one SQL query of abstractNote, kept until a new batch or window); `Gam.prefs.cleanNew()`, `orphanNotice()`, `termsFile()`.

- [ ] **Step 1: Write the failing tests** (fake Zotero as in test/keys-zotero.test.mjs: stored values apart from fields)
  - setting off: no write; on: "A title." is saved as "A title", one saveTx, one log line
  - 21 items with a title: no write, one notice with "21 new items"
  - a case proposal: the title does not change, notice "1 new title to check: Tools > Clean library…"; a suggestion or an ignored title gives no notice
  - left out: no title, read-only, feed, trash, attachments and notes
  - the title changes while the terms file loads: gam does not write (`writeTitle` compares with `from` just before setField)
  - appendLog fails: the title is saved, and the error goes to Zotero.logError
  - queueNewItems with both settings on: titles first, then keys; with only one on, only that one runs; shutdown cancels both
  - a new item that autoKeys needs still gets the same key as before (existing tests pass unchanged)
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** Take the compare out of `writeTitle` (from a `cp` copy): the race test fails. Put it back with `cp`. `npm test` passes. **Step 5:** Commit "Clean library: titles of new items".

### Task 6: Plan and apply

**Files:** Modify content/clean.mjs, test/clean.test.mjs

**Interfaces:**
- Produces: `planLibrary(Gam, items, {orphans: Item[]}): Promise<{titles, suggestions, files, orphans, errors: string[]}>` (rows of Task 3 plus `name` text; a file row also has `templateFor(title): string`); `cleanItems(Gam, items, {name, orphans, confirm}): Promise<{titles, files, lookups, errors, cancelled}>`. `confirm(plan)` returns `{titles: [{id, to}], files: [id], lookups: [id], ignored: string[], createParent: id|null} | null`; ignored is returned also on Cancel, as `{cancelled: true, ignored}`.

- [ ] **Step 1: Write the failing tests**
  - order of calls: titles, then renameFileFromParent, then recognizeItems one time with all ids
  - a title or filename that differs from the shown one: skipped, with `"…" changed after the list was made. gam did not change it.`
  - file rows: only getBestAttachment, shouldAutoRenameAttachment true, not isLinkedFileAttachment, and getFilePathAsync gives a path
  - templateFor(title) gives the name for an edited title, and the item is not changed or saved (use `item.clone` as Zotero does)
  - renameFileFromParent that leaves the name the same: an error line
  - one failed write does not stop the others; each write is in the log (field "filename" for files)
  - Cancel: no save, no rename, ignored keys saved; a second call while one runs stops with a notice
  - planLibrary with a library that has nothing to clean: notice "Nothing to clean in <name>."
  - createParent: nothing else is applied, ZoteroPane.selectItem(id), then createParentItemsFromSelected
  - lookups that fail: the files are selected in the library after the lookup (selectItems)
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement; `renameFileFromParent` from chrome://zotero/content/renameFiles.mjs through `ChromeUtils.importESModule`, passed in `Gam.renameFileFromParent` so that tests can fake it. **Step 4:** `npm test` passes. **Step 5:** Commit "Clean library: plan and apply".

### Task 7: Window and menus

**Files:** Create content/clean.xhtml, content/clean.js, content/ui/clean-dialog.mjs, test/clean-dialog.test.mjs. Modify content/preview.css, content/ui/menu.mjs, test/menu.test.mjs, locale/en-US/gam.ftl

**Interfaces:**
- Consumes: the plan and the `confirm` result of Task 6. Produces: `confirmClean(Gam, plan, name)`.

- [ ] **Step 1: Write the failing tests** (DOM fake as in test/preview-dialog.test.mjs)
  - only sections with rows; titles "Titles (n)", "Title suggestions from the abstract (n)", "Filenames (n)", "Files without a parent (n)"
  - ticked at first: titles and lookups; not ticked: suggestions and filenames
  - an edited field ticks its row; an empty or unchanged field (equal to `from`) clears it; Accept returns the edited text, trimmed
  - the filename of an item changes when its title row is ticked, cleared or edited
  - Select all works on its section only; "Ignore all that are not ticked" is in suggestions only
  - Ignore removes the row and its count; ignored keys come back on Accept and on Cancel
  - the button is "Apply n changes" ("Apply 1 change"), disabled at 0; Enter in a field does not accept the window
  - each checkbox, field and button has an accessible name with the item title; the errors show below the list
  - menu: "Clean library…" in Tools, "Clean…" for items (hidden for attachments that are not a file without a parent, notes, read-only libraries); Tools with two libraries selected gives a notice; a feed library gives a notice
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. Title fields are `<input type="text">`. **Step 4:** `npm test` passes. **Step 5:** Commit "Clean library: window and menus".

### Task 8: Files without a parent, settings, docs

**Files:** Create content/orphans.mjs, test/orphans.test.mjs. Modify content/gam.mjs, content/preferences.xhtml, locale/en-US/gam.ftl, README.md, CLAUDE.md

**Interfaces:**
- Produces: `makeOrphanWatch({Zotero, enabled, notify, setTimeout, clearTimeout}): {add(ids), stop()}`. It listens to `rowupdated` of `Zotero.ProgressQueues.get("recognize")` and removes the listener in `stop()`.

- [ ] **Step 1: Write the failing tests:** a PDF with a parent after the lookup: no notice; ROW_FAILED: one notice `1 file has no parent item: "scan-0001.pdf". Tools > Clean library…`; no row in the queue after 60 s: the same notice; a row still queued or in progress at 60 s: wait for its end; three failures in 2 s: one notice with 3 files; moved to the trash: no notice; setting off: no notice; a file in a feed or read-only library: no notice; stop() removes the listener and the timers; a queue that does not exist does not throw.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement and connect it in startup and shutdown. Settings group "Cleaning": "Clean the titles of new items", "Tell me about files without a parent", "Terms file". README: the functions, the settings, the two data files, Linter must be off, and note titles in the vault do not change. **Step 4:** `npm test` passes. **Step 5:** Commit "Clean library: files without a parent, settings, README".

### Task 9: Test in Zotero, version 0.5.0

**Files:** Modify manifest.json, updates.json, the project note (Log and Open tasks, at wrap-up)

- [ ] **Step 1:** Ask the user before this step: the test closes Zotero and changes the profile (development install, CLAUDE.md), and Linter must be off in Tools > Plugins. Work on test items in a test collection, not on real items.
- [ ] **Step 2:** Do each check of the Acceptance section, plus: skip all, empty field, keyboard only, light and dark, 1117 items open the window in less than 5 s, VoiceOver names. Write each result in the report, also the checks not done.
- [ ] **Step 3:** The user goes through the real library in the window. gam writes nothing that they did not apply.
- [ ] **Step 4:** Version 0.5.0 in manifest.json and updates.json, `npm test`, `scripts/build.sh`. Commit "gam 0.5.0: version and updates.json". Tag, push and release only with the release skill and the user's approval.
