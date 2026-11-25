# Clean library in gam

Date: 2026-11-25. Status: approved by the user on 2026-11-25. Target version: 0.5.0.

Lines with "(call)" are decisions of the writer, not of the user.

## Intent

The user wants to remove the Linter plugin (zotero-format-metadata) and get what they need from gam:
clean titles, proper filenames, and a parent item for each PDF that they add.

## What exists today (Zotero 10.0.9, library read on 2026-11-25)

- Zotero looks up a PDF or EPUB when it is added, makes the parent item and renames the file
  (autoRecognizeFiles and autoRenameFiles are on). 0 files are without a parent now. A file that Zotero
  cannot identify stays without one.
- Zotero renames the file of an item when the metadata changes, if the filename came from the old
  metadata. It does not touch a filename that was changed by hand. 56 of 928 PDF and EPUB files with
  a parent do not look like the template (approximate check).
- 1117 items, all with language "en", also at least 7 with a Portuguese title. No Title Case titles.
  At least 28 titles have lost capitals ("american thoracic society"). It is not proved that Linter did it.
- The abstract as evidence proposes a repair for 19 of those 28 titles and a change for 154 titles in
  total. Many of the others are wrong ("artificial Intelligence"): it can propose, not write.

## Goals

- Safe title fixes on new items, without a preview (setting).
- Each case change of a title goes through a preview.
- The same window repairs the titles, filenames and files without a parent that exist.
- A file that Zotero cannot identify is never silent.

## Non-goals

- The other functions of Linter: language, journal names, abbreviations, authors, dates, pages, DOI,
  universities, conferences, duplicates, rich text toolbar.
- Retrieval of metadata and duplicates: zotero-local-mcp does this.
- Changes to the title in a literature note. gam never changes an existing vault file.
- Titles in fields other than title and shortTitle.

## Anti-goals

- A case change that the user did not see. A wrong capital that gam wrote alone.
- A second file renamer or PDF recogniser: gam calls the functions of Zotero.
- A list that shows the same refused rows each time.

## Constraints

- Linter is AGPL-3.0 and gam is MIT. Linter's notice also covers paraphrases of rules, labels and data.
  Do not read or copy its code, rule names, setting names, labels or data. gam's rules come from this
  document. Built-in terms come from public facts (countries, languages, days, months).
- Zotero is AGPL-3.0 too: call its functions, do not copy them.
- Pure logic in content/lib/, with Node tests. No dependencies.
- Feed and read-only libraries, and items in the trash, are left out.
- Linter must be off when gam's setting is on: both would write the same title. README says so.

## Approaches

- A. All automatic, as in Linter. No work for the user. Wrong capitals get in without notice.
- B. Safe fixes automatic on new items, case changes in a preview. Chosen by the user on 2026-11-25:
  it keeps the rule of gam (no unseen change that can be wrong) and also repairs the old titles.
- C. Preview only. Safest, but a bad new title stays until the window is opened.

Parents and filenames: check the gaps and call Zotero. The user was shown this and did not object.

## Titles

Safe fixes (automatic on new items, and in the window):
- NFC; no soft hyphens or zero-width characters; spaces of all kinds become one space; trim.
- Decode HTML entities. Remove HTML tags that Zotero does not use. Keep i, b, sub, sup, and span
  with class nocase or style small-caps, in pairs.
- Remove one final dot, colon, semicolon or comma. Keep "..." and "…", and a dot after an
  abbreviation ("et al.", "Inc.", "U.S.", a single capital).
- Not changed: dashes, curly quotes, brackets, a final "*" or "†" (call; the last two go in the preview).

Case proposals (preview only):
- Types (call): journalArticle, preprint, conferencePaper, bookSection, book, report, thesis,
  magazineArticle, newspaperArticle, encyclopediaArticle, document, manuscript, presentation,
  webpage, blogPost, dataset.
- Language of the title: from the words and letters of the title (English or Portuguese), because the
  language field is "en" everywhere. A language field other than en or pt, or a title that looks like
  neither, gets no case proposal (call). A short title with no signal counts as English.
- Title Case or all capitals: when 70% or more of at least 4 content words have a capital (call), make
  sentence case. Keep the first word, the first word after ". ", "? " or "! ", terms, acronyms, words
  with an inner capital or a digit, text in span nocase, and words that the abstract supports. Lower
  case after a colon, as in the library now (call). In an all-capitals title, only terms and abstract
  words keep capitals.
- Other titles: capitals are never removed. Terms and abstract words get their capitals back.
- Abstract evidence: the word has a capital in the middle of a sentence, and is never in lower case in
  the abstract, or in any abstract of the library. Measured on a copy of the library (2026-11-25): it
  helps the same 19 titles, with 54 proposals in place of 154, and most are right. The built-in terms
  repair the 28 titles as far as their names are in the list (call).
- Terms: a built-in list for English (countries, nationalities, languages, days, months, continents,
  some eponyms and organisations) without words that are also common words (may, march, august,
  polish, turkey, jordan, chad, guinea), and one for Portuguese (names of countries and continents
  only: nationalities, days and months are in lower case). Plus the file of the user: plain text, one
  term in each line with its exact case, "#" for comments, "en:" or "pt:" before a term limits it to
  a language. The file of the user wins. gam reads it again when it changes, and never writes it.
  Longest term first; whole words; case ignored in the match.
- shortTitle: when it is the start of the old title (case ignored), the words that changed in the title
  change in it too. Else it does not change (call). The window shows the new short title.
  (Review, 2026-11-25: the whole start was a case change that the user did not see.)
- Review, 2026-11-25: a tag goes automatically only with its pair, or as a block tag at the start or end
  (text can look like a tag). A fix never takes away a letter or a digit. Tags without a pair, and
  titles of 3 to 5 words in capitals (they can be acronyms), are suggestions.
- Release review, 2026-11-25: a superscript or subscript never goes (10<sup>6</sup> is not 106), and math with
  a structure keeps its tags. In a title in capitals, the acronyms of the abstract stay. After a hyphen, a
  term of more than one word, or a Portuguese one, does not count.

New items: the add events are collected for 2 s, as for automatic keys. At most 20 items in a batch;
more gives one notice and no write (call). A title with a case change from terms or Title Case that remains after the safe
fixes gives one notice: "1 new title to check: Tools > Clean library…". The two settings (keys,
titles) are independent, and run in one queue, with the title first. Synced items count as new (call).

An item can be added empty and filled later (New Item), or be renamed by Zotero's recogniser: gam checks
only items that have a title after the 2 s. Others are found in the window.

## Files

- Rows: the best attachment of each regular item (as Zotero's own "Rename files"), when Zotero's
  shouldAutoRenameAttachment allows it, the file is on disk, and its name is not the name from the
  template. Linked files are left out, also when Zotero's setting allows them (call).
- Rows are found with the saved title. Files that Zotero renames itself after a title change have the
  template name already, so they are never rows: there is no race.
- The new name shown is for the title that Apply will write: the edited title when the title row of the
  item is ticked, else the saved title. It changes when that row changes (call). At the write, gam uses
  renameFileFromParent of Zotero (unique name), after the titles are saved.

## Files without a parent

- Rows: PDF and EPUB attachments at the top level (Zotero.RecognizeDocument.canRecognize).
- Retry lookup: Zotero.RecognizeDocument.recognizeItems on the ticked rows, after Accept.
- Create parent…: closes the window, selects the file and opens Zotero's own dialog.
- Notice: when a new PDF or EPUB still has no parent after Zotero's lookup ends for it, or 60 s after it
  was added when Zotero made no lookup (call). With the setting "Tell me about files without a parent".

## Window

Tools > Clean library… (selected library) and item menu > Clean… (selected items). One dialog, the
style of the preview dialog, sections only when they have rows.

    Clean library: My Library
    Nothing in the library changes until you select Apply.

    Titles (28)                                        [Select all]
    [x] [ Recommendations for a ... American Thoracic Society  ]
        was: Recommendations for a ... american thoracic society
        terms                                              Ignore

    Title suggestions (31)                             [Select all]
    [ ] [ Key digital health ... a Delphi study                ]
        was: Key digital health ... a delphi study         Ignore
    [Ignore all that are not ticked]

    Filenames (41)                                     [Select all]
    [ ] West - 2012 - Respiratory physiology the essentials.pdf
        was: Specials--west_2012_respiratory-physiology-t.pdf  Ignore

    Files without a parent (1)
    [x] scan-0001.pdf   Retry lookup             Create parent…

                                        [Cancel]  [Apply 29 changes]

- The new title is a text field: the user can change it. An edited row is ticked. An empty or
  unchanged field clears the box and writes nothing.
- One title row for each item. Ticked at first: rows in Titles (safe fixes, terms, Title Case). Not
  ticked: Title suggestions (capitals from the abstract only, and a final "*" or "†"), and all filenames
  (a name by hand can be on purpose) (call). An item that has both kinds is in Titles, without the
  suggestion; the suggestion comes the next time the window opens (call). Select all is for its section.
- Suggestions give no notice for a new item. Other case proposals do (call).
- Ignore: the row does not come back while its value is the same. Stored by library, item key, kind
  and current value in gam-ignored.json in the Zotero data folder (call). It also stops the notice.
  It is saved when the window closes, also with Cancel. It changes nothing in the library.
- Apply: titles first, then files, then lookups. Before each write gam checks that the title or
  filename is the one that was shown; if not, it skips the row and says so.
- Each write, also an automatic one, adds a line to gam-clean.jsonl in the Zotero data folder (date,
  item key, field, old, new), so a change can be reversed (call).

## Settings

New group "Cleaning" in the gam settings: Clean the titles of new items (off by default), Tell me
about files without a parent (off by default), Terms file (path, empty).

## Left to the builder

Module names, wording, list sizes, and how the end of Zotero's lookup is seen.

## Acceptance

- Node tests for each safe fix, the Title Case limit, terms, abstract evidence, Portuguese titles, rich
  text, shortTitle, ignored rows, a title that changed after the preview, more than 20 items.
- In Zotero: add a PDF that it can identify and one that it cannot; accept a title and see the file
  renamed; Ignore and open again; keyboard only; light and dark; Cancel changes nothing in the library.
- With Linter off: a new item from the browser gets a clean title.
