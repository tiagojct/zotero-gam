import { test } from "node:test";
import assert from "node:assert/strict";
import { makeOrphanWatch } from "../content/orphans.mjs";

const FAILED = 3;
const SUCCEEDED = 4;

function setup({ enabled = true, queue = true } = {}) {
  let on = enabled;
  const listeners = new Set();
  const timers = new Map();
  const notices = [];
  const errors = [];
  const items = new Map();
  const rows = [];
  let n = 0;
  const q = {
    addListener: (name, fn) => { assert.equal(name, "rowupdated"); listeners.add(fn); },
    removeListener: (name, fn) => listeners.delete(fn),
    getRows: () => rows,
  };
  const Zotero = {
    ProgressQueues: { get: () => (queue ? q : undefined) },
    ProgressQueue: { ROW_QUEUED: 1, ROW_PROCESSING: 2, ROW_FAILED: FAILED, ROW_SUCCEEDED: SUCCEEDED },
    RecognizeDocument: { canRecognize: (i) => i.pdf && !i.parentID },
    Items: { get: (ids) => ids.map((id) => items.get(id)) },
    logError: (e) => errors.push(e.message),
  };
  const add = (id, o = {}) => {
    const item = { id, pdf: true, parentID: null, attachmentFilename: `scan-${id}.pdf`, isRegularItem: () => false, isAttachment: () => true,
      isInTrash: () => false, library: { editable: true, libraryType: "user" }, getField: () => "", ...o };
    items.set(id, item);
    return item;
  };
  const watch = makeOrphanWatch({
    Zotero, enabled: () => on, notify: (text) => notices.push(text),
    setTimeout: (fn, ms) => { timers.set(++n, { fn, ms }); return n; },
    clearTimeout: (id) => timers.delete(id),
  });
  // Run the timers of ms milliseconds.
  const fire = (ms) => {
    for (const [id, t] of [...timers]) {
      if (t.ms !== ms) continue;
      timers.delete(id);
      t.fn();
    }
  };
  const update = (id, status) => {
    const row = rows.find((r) => r.id === id);
    if (row) row.status = status;
    for (const fn of [...listeners]) fn({ id, status, message: "" });
  };
  const queued = (id, status = 1) => rows.push({ id, status });
  return { watch, setEnabled: (v) => { on = v; }, add, fire, update, queued, notices, errors, listeners, timers, items, rows };
}

test("a lookup that fails gives one notice", () => {
  const s = setup();
  s.add(1);
  s.watch.add([1]);
  s.queued(1);
  s.update(1, 2);
  s.fire(2000);
  assert.deepEqual(s.notices, []);
  s.update(1, FAILED);
  s.fire(2000);
  assert.deepEqual(s.notices, ["1 file has no parent item: \"scan-1.pdf\".\nTools > Clean library…"]);
  s.fire(60000);
  s.fire(2000);
  assert.equal(s.notices.length, 1);
});

test("a lookup that makes a parent gives no notice", () => {
  const s = setup();
  const item = s.add(1);
  s.watch.add([1]);
  s.queued(1);
  item.parentID = 9;
  s.update(1, SUCCEEDED);
  s.fire(2000);
  s.fire(60000);
  s.fire(2000);
  assert.deepEqual(s.notices, []);
});

test("without a lookup, the notice comes after 60 s", () => {
  const s = setup();
  s.add(1);
  s.watch.add([1]);
  s.fire(2000);
  assert.deepEqual(s.notices, []);
  s.fire(60000);
  s.fire(2000);
  assert.equal(s.notices.length, 1);
});

test("a lookup that is not finished after 60 s is waited for", () => {
  const s = setup();
  s.add(1);
  s.watch.add([1]);
  s.queued(1);
  s.fire(60000);
  s.fire(2000);
  assert.deepEqual(s.notices, []);
  s.update(1, FAILED);
  s.fire(2000);
  assert.equal(s.notices.length, 1);
});

test("a lookup that the user cancels after 60 s is seen at the next check", () => {
  const s = setup();
  s.add(1);
  s.watch.add([1]);
  s.queued(1, 2);
  s.fire(60000);
  s.rows.length = 0;
  s.fire(60000);
  s.fire(2000);
  assert.equal(s.notices.length, 1);
});

test("failures that come together give one notice, with three names at most", () => {
  const s = setup();
  for (const id of [1, 2, 3, 4]) s.add(id);
  s.watch.add([1, 2, 3, 4]);
  for (const id of [1, 2, 3, 4]) { s.queued(id); s.update(id, FAILED); }
  s.fire(2000);
  assert.deepEqual(s.notices, ["4 files have no parent item: \"scan-1.pdf\", \"scan-2.pdf\", \"scan-3.pdf\" and 1 more.\nTools > Clean library…"]);
});

test("no notice for a file in the trash, in a feed, in a read-only library, deleted, or with a parent by hand", () => {
  const s = setup();
  const list = [s.add(1), s.add(2), s.add(3), s.add(4), s.add(5)];
  s.watch.add([1, 2, 3, 4, 5]);
  list[0].isInTrash = () => true;
  list[1].library = { editable: true, libraryType: "feed" };
  list[2].library = { editable: false };
  s.items.delete(4);
  list[4].parentID = 9;
  s.fire(60000);
  s.fire(2000);
  assert.deepEqual(s.notices, []);
});

test("items, notes and child files are not watched", () => {
  const s = setup();
  s.add(2, { parentID: 9 });
  s.add(3, { isRegularItem: () => true, isAttachment: () => false });
  s.add(4, { isAttachment: () => false });
  s.watch.add([2, 3, 4, 99]);
  assert.equal(s.timers.size, 0);
});

test("a file that is not a PDF or EPUB gives no notice; the type can come after the add event", () => {
  const s = setup();
  s.add(1, { pdf: false });
  const late = s.add(2, { pdf: false });
  s.watch.add([1, 2]);
  late.pdf = true;
  s.fire(60000);
  s.fire(2000);
  assert.deepEqual(s.notices, ["1 file has no parent item: \"scan-2.pdf\".\nTools > Clean library…"]);
});

test("the setting off: no notice, also when it goes off while gam waits", () => {
  const s = setup({ enabled: false });
  s.add(1);
  s.watch.add([1]);
  assert.equal(s.timers.size, 0);
  s.setEnabled(true);
  s.watch.add([1]);
  s.setEnabled(false);
  s.fire(60000);
  s.fire(2000);
  assert.deepEqual(s.notices, []);
});

test("a lookup of an old file (not new) gives no notice", () => {
  const s = setup();
  s.add(1);
  s.queued(1);
  s.update(1, FAILED);
  s.fire(2000);
  assert.deepEqual(s.notices, []);
});

test("stop removes the listener and the timers", () => {
  const s = setup();
  s.add(1);
  s.watch.add([1]);
  assert.equal(s.listeners.size, 1);
  s.watch.stop();
  assert.equal(s.listeners.size, 0);
  assert.equal(s.timers.size, 0);
  s.watch.add([1]);
  assert.equal(s.timers.size, 0);
});

test("without the queue of Zotero, the 60 s check works", () => {
  const s = setup({ queue: false });
  s.add(1);
  s.watch.add([1]);
  s.fire(60000);
  s.fire(2000);
  assert.equal(s.notices.length, 1);
  s.watch.stop();
});
