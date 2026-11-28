# Progress window for Find PDF in OpenAlex

Date: 2026-11-28. Status: approved by the user on 2026-11-28. Target version: 0.7.1.

Lines with "(call)" are decisions of the writer, not of the user.

## Intent

The user tested 0.7.0 and asked for "a progress bar of sorts" while Find PDF in OpenAlex runs.

## Approaches

- A. Zotero's progress queue window (Zotero.ProgressQueues), the window of Find Full Text: a row for each
  item with its status, a bar, Cancel. Chosen by the user on 2026-11-28.
- B. A corner notice with a bar and "3 of 10". No Cancel, no result for each item.
- C. A window of gam. More code, no gain over A.

## Design

- The run opens the window with one row for each item that it tries. Items that it leaves out are not
  rows, as in Find Full Text; the summary notice counts them.
- Row text: "Looking up", then "PDF attached", "PDF attached (OpenAlex copy)", "No open PDF",
  "Error: see the debug output", or "Not done" when the run stops early. Status codes of Zotero:
  processing, succeeded, failed (call: "No open PDF" is failed, as Zotero's own "No files found").
- Cancel stops the run before the next item (call: the current item ends). The other rows show
  "Not done"; the notice starts with "Find PDF in OpenAlex was cancelled."
- A stop for the key, the budget or offline: the other rows show "Not done", the status line of the window
  shows the reason.
- The window title: Zotero reads it with Zotero.getString, which refuses a text that is not in its string
  list (checked in Zotero 10.0.9). gam gives the key "pane.items.menu.findAvailableFile" ("Find Full Text")
  and then sets the title of the open window to "Find PDF in OpenAlex" (call). Columns: Zotero's "Item"
  and "Full Text".
- One queue with the id "gam-openalex", made once and used again; each run clears the old rows.
- No window when no item is tried: only the notice, as now.
- The summary notice stays at the end.
