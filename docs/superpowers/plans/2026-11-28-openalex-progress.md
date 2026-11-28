# Progress window for Find PDF in OpenAlex Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

Goal: Find PDF in OpenAlex shows Zotero's progress queue window with a row for each item and Cancel.

Architecture: findPDFs gets a progress object from a new dep `progress(items)`; the default wraps
Zotero.ProgressQueues (content/find-pdf.mjs). Tests use a fake.

Spec: docs/superpowers/specs/2026-11-28-openalex-progress-design.md

## Global Constraints

- Queue id "gam-openalex"; title key "pane.items.menu.findAvailableFile"; columns "general.item", "attachment.fullText".
- Window title set to "Find PDF in OpenAlex" after it opens.
- Row texts: "Looking up", "PDF attached", "PDF attached (OpenAlex copy)", "No open PDF", "Error: see the debug output", "Not done".
- Status codes: Zotero.ProgressQueue.ROW_PROCESSING (2), ROW_FAILED (3), ROW_SUCCEEDED (4).
- Cancel notice first line: "Find PDF in OpenAlex was cancelled."

## Review Focus

1. Cancel during the last item: no "Not done" rows, notice still says cancelled only if items were left.
2. A second run reuses the queue: old rows go.
3. No item to try: no window.
4. The window was closed by the user (close button) while running: the run goes on, no error.
5. A stop (key, budget, offline) marks the rest "Not done".

### Task 1: Progress in findPDFs

Files: content/find-pdf.mjs, test/find-pdf.test.mjs.

- [ ] Step 1: Tests with a fake progress ({rows, updates, cancel(), status}): rows are the tried items in order; each item goes "Looking up" then its result text and code; hosted gives "PDF attached (OpenAlex copy)"; a 401 stop marks the rest "Not done" and the status is the reason; cancel after item 1 marks items 2 and 3 "Not done", no request for them, notice starts with the cancel line; cancel during the last item gives no "Not done" and the notice has no cancel line; no item to try: progress not made.
- [ ] Step 2: Run `node --test test/find-pdf.test.mjs`. Expected: the new tests FAIL.
- [ ] Step 3: Implement `progress(items) -> {update(id, code, text), cancelled() -> boolean, finish(statusText)}` dep and the default `zoteroProgress(Zotero, items)` (get or create the queue, delete old rows, add rows, open the dialog, set the title, cancel listener, setStatus at finish).
- [ ] Step 4: `npm test`. Expected: all pass.
- [ ] Step 5: Commit "Find PDF in OpenAlex: progress window with Cancel".

### Task 2: Check in a test Zotero

A small test profile with a few items (DOIs of open and closed works): the window opens with rows, statuses change, Cancel stops, the title is "Find PDF in OpenAlex", a second run clears old rows. README line. Version 0.7.1 with the release skill.
