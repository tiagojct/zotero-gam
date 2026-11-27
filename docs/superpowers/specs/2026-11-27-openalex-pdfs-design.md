# PDFs from OpenAlex in gam

Date: 2026-11-27. Status: draft, for approval. Target version: 0.7.0.

Lines with "(call)" are decisions of the writer, not of the user.

## Intent

The user wants to remove the plugin Zotero OpenAlex PDF Finder (openalex-pdf@littview.com 0.4.1, MIT) and
get open-access PDFs from OpenAlex through gam, with the option of an OpenAlex API key.

## What exists today (Zotero 10.0.9, OpenAlex docs read on 2026-11-27)

- Find Full Text of Zotero tries the DOI page, the URL, Zotero's open-access lookup and PMC. It also reads
  custom resolvers from the hidden pref `extensions.zotero.findPDFs.resolvers` (JSON, default `[]`), for
  items with a DOI. A resolver with `"automatic": true` is also used when Zotero saves an item from the browser.
- OpenAlex: one work by DOI (`/works/doi:<doi>`) is free, with or without a key. A free key raises the daily
  budget from $0.10 to $1. The copies that OpenAlex keeps (`content_urls.pdf`, content.openalex.org) need
  a key and cost $0.01 each (about 100 a day with a free key). The key goes as `?api_key=` or as the header
  `Authorization: Bearer`. Over the budget, OpenAlex answers 429. It does not charge.
- A resolver line cannot add a key to a download link. So the OpenAlex copies need gam code.
- Tested with Zotero's own jspath (resource/jspath.js) on a real answer: the selector
  `.locations{.is_oa === true}{.pdf_url ^= "http"}` gives only the open locations with a PDF link.
  `.locations{.pdf_url}` also gives locations with a null link, which makes Zotero open landing pages.

## Goals

- Find Full Text, and items saved from the browser, also try the open PDF links of OpenAlex (setting).
- A command that also gets the copy that OpenAlex keeps, when there is a key.
- The key is not in prefs.js, in Config Editor or in the debug log.

## Non-goals

- Lookup by title or PMID for items without a DOI (call; the old plugin did it).
- The OpenAlex work ID in Extra. A contact email.
- A download from a source other than OpenAlex. Zotero's own Find Full Text stays as it is.

## Anti-goals

- The daily budget is used without a command of the user: OpenAlex copies only come from the command.
- gam changes or removes a resolver that is not its own.
- A file that is not a PDF is attached.

## Approaches

- A. The resolver line set once by hand. No code; set again on each new profile.
- B1. A gam setting for the resolver line, with the key in its URL. The key adds almost nothing (lookups
  are free) and is in plain text in prefs.js and in the log.
- B2. The resolver line without a key, a command for the OpenAlex copies, the key in Zotero's login store.
  Chosen by the user on 2026-11-27.

## The resolver line

- Setting "Look for PDFs in OpenAlex" (off by default). On: gam adds its entry to the list in
  `findPDFs.resolvers`. Off: gam removes it. Other entries stay, in their order.
- gam's entry has the name "OpenAlex (gam)". gam knows its entry only by this name.

      {"name": "OpenAlex (gam)", "method": "GET",
       "url": "https://api.openalex.org/works/doi:{doi}?select=locations",
       "mode": "json", "selector": ".locations{.is_oa === true}{.pdf_url ^= \"http\"}",
       "mappings": {"url": "pdf_url", "pageURL": "landing_page_url"}, "automatic": true}

- At startup, gam makes the pref agree with the setting: it adds, replaces (an older form of its entry) or
  removes its entry. When gam is turned off or removed, its entry goes (call).
- When the list becomes empty, gam clears the pref (Zotero.Prefs.clear) and does not write `[]`: a user pref
  with the value of the default is dropped by Zotero.
- When the pref is not valid JSON, gam does not write it, and gives one notice (call).
- No key in this line. The pure logic (add, replace, remove, parse) goes in content/lib/ with Node tests.

## The command

- Item menu > "Find PDF in OpenAlex". Shown for regular items. It works on the selected items that have a
  DOI (field or Extra) and no PDF or EPUB attachment; it says how many it left out and why.
- For each item, one at a time (call):
  1. Ask OpenAlex for the work by DOI (`select=id,locations,has_content,content_urls`), with the key as a
     header when there is one.
  2. Give the open PDF links (same rule as the selector) to `Zotero.Attachments.addFileFromURLs`. Zotero
     downloads, checks the file type, names the file and makes the attachment.
  3. When no file was attached, there is a key, and `has_content.pdf` is true: gam downloads
     `content_urls.pdf` with the key as a header (not in the URL), checks that the bytes start with
     `%PDF`, imports the file as a child of the item, and calls Zotero's rename from the parent.
- One run at a time. A second run while one runs gives a notice.
- At the end, one notice: attached (and how many from OpenAlex copies), not found, errors.
- 401 or 403: stop, notice "OpenAlex refused the API key". 429: stop, notice that the daily OpenAlex budget
  is used or that the requests were too fast. Offline: stop, notice.
- Feed and read-only libraries are left out, as in the other commands.

## The key

- Settings > gam, group "PDFs": the checkbox of the resolver line, and a password field "OpenAlex API key
  (optional)". Text: the key is used only by Find PDF in OpenAlex, for the copies that OpenAlex keeps.
- The key is kept in Zotero's login store (Services.logins), as Zotero keeps its sync key, not in a pref.
  An empty field removes it.
- The key is never written to the debug log or a notice.

## Removal of the old plugin

- After the test in a test profile and in the user's Zotero, the user removes Zotero OpenAlex PDF Finder in
  Tools > Plugins. Its profile has no openalexpdf prefs (checked on 2026-11-27), so no key is left behind.

## Left to the builder

Module names, wording, the login store calls of Zotero 10, how the item menu shows the command.

## Acceptance

- Node tests: add, replace and remove gam's entry with other entries present; empty list clears the pref;
  invalid JSON is not written; the link filter (null links, closed locations); the order of the steps;
  401, 403 and 429 stop the run; a file that is not a PDF is not attached; the key is not in any URL.
- In a test Zotero: Find Full Text on an item with a DOI and no PDF uses "OpenAlex (gam)" (debug log);
  the command attaches a PDF from an open link; with a key, a PDF from the OpenAlex copy; the key field
  survives a restart; prefs.js and the debug log do not contain the key; setting off removes the entry.
