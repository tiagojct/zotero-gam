// PDFs from OpenAlex: gam's entry in Zotero's PDF resolvers, and the command "Find PDF in OpenAlex".
// Zotero does each download and makes each attachment.

import { nextResolvers, workURL, openLinks, hostedLink, failure, looksLikePDF, summary } from "./lib/openalex.mjs";
import { getKey } from "./openalex-key.mjs";
import { notify } from "./notify.mjs";
import { canChange } from "./ui/common.mjs";

const RESOLVERS_PREF = "findPDFs.resolvers";
const FILE_TYPES = new Set(["application/pdf", "application/epub+zip"]);

/**
 * Add gam's entry to findPDFs.resolvers (on) or remove it (off). Other entries stay. An empty list clears
 * the pref: Zotero drops a user pref with the value of the default. Returns true when the pref changed.
 */
export function syncResolver(Gam, on) {
  const Zotero = Gam.Zotero;
  const next = nextResolvers(Zotero.Prefs.get(RESOLVERS_PREF), on);
  if (next.error) {
    Gam.log(`findPDFs.resolvers: ${next.error}`);
    notify(Zotero, `gam cannot change the PDF resolvers: the setting ${RESOLVERS_PREF} is not valid JSON.`, false);
    return false;
  }
  if (!next.changed) return false;
  if (next.value === null) Zotero.Prefs.clear(RESOLVERS_PREF);
  else Zotero.Prefs.set(RESOLVERS_PREF, next.value);
  return true;
}

/** The DOI of an item, from the field or from Extra, or "". */
export function doiOf(Zotero, item) {
  let value = "";
  try {
    value = item.getField("DOI") || "";
  } catch {}
  if (!value) {
    let extra = "";
    try {
      extra = item.getField("extra") || "";
    } catch {}
    value = /^DOI:\s*(\S+)/im.exec(extra)?.[1] || "";
  }
  return (value && Zotero.Utilities.cleanDOI(value)) || "";
}

function hasFile(Zotero, item) {
  return (item.getAttachments?.() || []).some((id) => {
    const att = Zotero.Items.get(id);
    return att && !att.isInTrash?.() && FILE_TYPES.has(att.attachmentContentType);
  });
}

/** True for a regular item that gam can change, with a DOI and no PDF or EPUB. */
export function canFind(Zotero, item) {
  return !!item?.isRegularItem?.() && canChange(item) && item.library?.libraryType !== "feed"
    && !!doiOf(Zotero, item) && !hasFile(Zotero, item);
}

const STOP_TEXT = {
  key: "OpenAlex refused the API key. Check it in Settings > gam.",
  denied: "OpenAlex refused the request.",
  budget: "The daily OpenAlex budget is used, or the requests were too fast. Try again later.",
  offline: "Zotero is offline, or OpenAlex cannot be reached.",
  cancelled: "Find PDF in OpenAlex was cancelled.",
};

// Row status codes of Zotero.ProgressQueue.
const ROW = { processing: 2, failed: 3, succeeded: 4 };
const QUEUE_ID = "gam-openalex";
const TITLE = "Find PDF in OpenAlex";

/**
 * Zotero's progress queue window (as for Find Full Text): a row for each item, a bar and Cancel.
 * Zotero reads the title and the columns as keys of its own strings, so gam gives Zotero's keys and then
 * sets the title of the window.
 */
export function zoteroProgress(Zotero, items) {
  let queue = Zotero.ProgressQueues.get(QUEUE_ID);
  if (!queue) {
    queue = Zotero.ProgressQueues.create({
      id: QUEUE_ID, title: "pane.items.menu.findAvailableFile", columns: ["general.item", "attachment.fullText"],
    });
  }
  let cancelled = false;
  const onCancel = () => { cancelled = true; };
  queue.addListener("cancel", onCancel);
  // getRows gives Zotero's own list: copy it before rows go.
  for (const row of [...queue.getRows()]) queue.deleteRow(row.id);
  for (const item of items) queue.addRow(item);
  const dialog = queue.getDialog();
  dialog.showMinimizeButton(false);
  // "" and not null: Zotero's setStatus fails on null. An empty status shows Zotero's "Processing".
  dialog.setStatus("");
  dialog.open();
  const setTitle = () => {
    for (const win of Services.wm.getEnumerator(null)) {
      if (String(win.location?.href).endsWith("progressQueueDialog.xhtml") && win.arguments?.[0]?.progressQueue === queue) {
        win.document.title = TITLE;
      }
    }
  };
  // The window sets its own title when it loads.
  for (const ms of [0, 300, 1000]) Zotero.Promise.delay(ms).then(setTitle).catch(() => {});
  return {
    update: (id, code, text) => queue.updateRow(id, code, text),
    cancelled: () => cancelled,
    finish: (text) => {
      queue.removeListener("cancel", onCancel);
      dialog.setStatus(String(text).split("\n").join(" "));
    },
  };
}

function defaultDeps(Zotero) {
  let n = 0;
  return {
    request: (url, opts) => Zotero.HTTP.request("GET", url, opts),
    download: (url, path, opts) => Zotero.HTTP.download(url, path, opts),
    addFileFromURLs: (item, links) => Zotero.Attachments.addFileFromURLs(item, links),
    importFromFile: (options) => Zotero.Attachments.importFromFile(options),
    getKey: () => getKey({ Zotero, Services }),
    readHead: (path) => IOUtils.read(path, { maxBytes: 1024 }),
    tempPath: () => PathUtils.join(Zotero.getTempDirectory().path, `gam-openalex-${Date.now()}-${++n}.pdf`),
    remove: (path) => IOUtils.remove(path, { ignoreAbsent: true }),
    progress: (items) => zoteroProgress(Zotero, items),
  };
}

const isOffline = (e) => e?.status === 0 || e?.name === "BrowserOfflineException"
  || /offline/i.test(String(e?.message || ""));

let running = false;

const ROW_RESULT = {
  attached: [ROW.succeeded, "PDF attached"],
  hosted: [ROW.succeeded, "PDF attached (OpenAlex copy)"],
  notFound: [ROW.failed, "No open PDF"],
  errors: [ROW.failed, "Error: see the debug output"],
};

const notDone = (progress, items) => items.forEach((item) => progress.update(item.id, ROW.failed, "Not done"));

/** The progress window, or one that does nothing when the window cannot open: the run goes on. */
function makeProgress(Zotero, deps, items) {
  const quiet = { update() {}, cancelled: () => false, finish() {} };
  try {
    const progress = deps.progress?.(items);
    if (!progress) return quiet;
    const guard = (fn, fallback) => (...args) => {
      try {
        return fn(...args);
      } catch (e) {
        Zotero.logError(e);
        return fallback;
      }
    };
    return { update: guard(progress.update), cancelled: guard(progress.cancelled, false), finish: progress.finish };
  } catch (e) {
    Zotero.logError(e);
    return quiet;
  }
}

/**
 * Find PDF in OpenAlex for items. Returns the counts {attached, hosted, notFound, skipped, errors, stopped},
 * or null when a run goes already.
 */
export async function findPDFs(Gam, items, deps = defaultDeps(Gam.Zotero)) {
  const Zotero = Gam.Zotero;
  if (running) {
    notify(Zotero, "Find PDF in OpenAlex runs already.", false);
    return null;
  }
  running = true;
  let progress = null;
  const counts = { attached: 0, hosted: 0, notFound: 0, skipped: 0, errors: 0, stopped: null };
  try {
    const todo = items.filter((item) => canFind(Zotero, item));
    counts.skipped = items.length - todo.length;
    const key = todo.length ? await deps.getKey() : "";
    const headers = key ? { Authorization: `Bearer ${key}` } : {};
    if (todo.length) progress = makeProgress(Zotero, deps, todo);
    for (const [i, item] of todo.entries()) {
      if (i > 0 && progress.cancelled()) {
        counts.stopped = "cancelled";
        notDone(progress, todo.slice(i));
        break;
      }
      // A PDF can come while the run goes (Find Full Text), or the item can go to the trash.
      if (!canFind(Zotero, item)) {
        counts.skipped += 1;
        progress.update(item.id, ROW.failed, "Left out");
        continue;
      }
      progress.update(item.id, ROW.processing, "Looking up");
      const result = await findOne(Zotero, item, { key, headers, deps });
      if (result.stop) {
        counts.stopped = result.stop;
        notDone(progress, todo.slice(i));
        break;
      }
      counts[result.count] += 1;
      if (result.hosted) counts.hosted += 1;
      progress.update(item.id, ...ROW_RESULT[result.hosted ? "hosted" : result.count]);
    }
  } finally {
    running = false;
  }
  const text = summary(counts);
  const notice = counts.stopped ? `${STOP_TEXT[counts.stopped]}\n${text}` : text;
  try {
    progress?.finish(notice);
  } catch (e) {
    Zotero.logError(e);
  }
  notify(Zotero, notice, !counts.stopped && !counts.errors);
  return counts;
}

/** One item: {count: "attached"|"notFound"|"errors", hosted?} or {stop: reason}. */
async function findOne(Zotero, item, { key, headers, deps }) {
  const stopFor = (status) => {
    const kind = failure(status);
    if (kind === "key") return { stop: key ? "key" : "denied" };
    if (kind === "budget" || kind === "offline") return { stop: kind };
    return null;
  };
  let answer;
  try {
    answer = await deps.request(workURL(doiOf(Zotero, item)), {
      responseType: "json", headers, successCodes: false, timeout: 15000, errorDelayMax: 0, noRetryOnThrottle: true,
    });
  } catch (e) {
    if (isOffline(e)) return { stop: "offline" };
    Zotero.logError(e);
    return { count: "errors" };
  }
  if (answer.status !== 200) {
    const stop = stopFor(answer.status);
    if (stop) return stop;
    return { count: failure(answer.status) === "missing" ? "notFound" : "errors" };
  }
  const work = answer.response;
  const links = openLinks(work);
  if (links.length) {
    try {
      if (await deps.addFileFromURLs(item, links)) return { count: "attached" };
    } catch (e) {
      Zotero.logError(e);
    }
  }
  const hosted = key && hostedLink(work);
  if (!hosted) return { count: "notFound" };
  const path = deps.tempPath();
  let imported = false;
  try {
    const response = await deps.download(hosted, path, { headers, successCodes: false, timeout: 60000, errorDelayMax: 0 });
    if (response.status !== 200) {
      // The lookup with the same key worked: a 403 here is about this work, not the key.
      if (response.status === 401) return { stop: "key" };
      if (failure(response.status) === "budget") return { stop: "budget" };
      return { count: "notFound" };
    }
    if (!looksLikePDF(await deps.readHead(path))) return { count: "notFound" };
    await deps.importFromFile({
      file: path, parentItemID: item.id, fileBaseName: Zotero.Attachments.getFileBaseNameFromItem(item),
      contentType: "application/pdf", moveFile: true,
    });
    imported = true;
    return { count: "attached", hosted: true };
  } catch (e) {
    if (isOffline(e)) return { stop: "offline" };
    Zotero.logError(e);
    return { count: "errors" };
  } finally {
    // importFromFile moves the file into storage; else the temp file is gam's own and goes.
    if (!imported) await deps.remove(path).catch(() => {});
  }
}
