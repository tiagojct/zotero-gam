import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { installFakeIO } from "./helpers/fake-io.mjs";

installFakeIO();
const { syncResolver, findPDFs, canFind } = await import("../content/find-pdf.mjs");
const { RESOLVER, RESOLVER_NAME } = await import("../content/lib/openalex.mjs");

const work = JSON.parse(fs.readFileSync(new URL("./fixtures/openalex-work.json", import.meta.url), "utf8"));
const KEY = "secret-key-123";

function fakeZotero({ resolvers } = {}) {
  const prefs = new Map(resolvers === undefined ? [] : [["findPDFs.resolvers", resolvers]]);
  const notices = [];
  const items = new Map();
  const Zotero = {
    notices,
    prefs,
    Prefs: {
      get: (name) => (prefs.has(name) ? prefs.get(name) : name === "findPDFs.resolvers" ? "[]" : undefined),
      set: (name, value) => prefs.set(name, value),
      clear: (name) => prefs.delete(name),
    },
    ProgressWindow: class {
      changeHeadline() {}
      addDescription(t) { this.lines = [...(this.lines || []), t]; }
      show() { notices.push(this.lines.join("\n")); }
      startCloseTimer() {}
    },
    Items: { get: (id) => items.get(id) },
    Utilities: { cleanDOI: (s) => (/10\.\d+\/\S+/.exec(String(s || "")) || [null])[0] },
    Attachments: { getFileBaseNameFromItem: () => "Author - 2020 - Title" },
    logError() {},
    debug() {},
  };
  return { Zotero, items };
}

function makeItem(Zotero, items, id, { doi = "", extra = "", files = [], trash = false } = {}) {
  const attIDs = files.map((type, i) => {
    const attID = id * 100 + i;
    items.set(attID, { id: attID, attachmentContentType: type, isInTrash: () => false });
    return attID;
  });
  const item = {
    id, key: `K${id}`, library: { editable: true, libraryType: "user" },
    isRegularItem: () => true, isInTrash: () => trash, isEditable: () => true,
    getField: (f) => (f === "DOI" ? doi : f === "extra" ? extra : ""),
    getAttachments: () => attIDs,
  };
  items.set(id, item);
  return item;
}

function addFile(items, item, type = "application/pdf") {
  const attID = item.id * 100 + 50;
  items.set(attID, { id: attID, attachmentContentType: type, isInTrash: () => false });
  const old = item.getAttachments();
  item.getAttachments = () => [...old, attID];
}

function deps(over = {}) {
  const calls = { request: [], download: [], add: [], import: [], removed: [] };
  const d = {
    calls,
    request: async (url, opts) => { calls.request.push({ url, opts }); return { status: 200, response: work }; },
    download: async (url, path, opts) => { calls.download.push({ url, path, opts }); return { status: 200 }; },
    addFileFromURLs: async (item, links) => { calls.add.push({ item, links }); return null; },
    importFromFile: async (o) => { calls.import.push(o); return { id: 999 }; },
    getKey: async () => "",
    readHead: async () => new TextEncoder().encode("%PDF-1.7"),
    tempPath: () => "/tmp/gam-openalex-test.pdf",
    remove: async (p) => { calls.removed.push(p); },
    ...over,
  };
  return d;
}

const Gam = (Zotero) => ({ Zotero, log() {} });
const noKeyAnywhere = (d) => {
  for (const c of [...d.calls.request, ...d.calls.download]) assert.doesNotMatch(c.url, new RegExp(KEY));
  for (const c of d.calls.add) for (const l of c.links) assert.doesNotMatch(JSON.stringify(l), new RegExp(KEY));
};

test("sync adds gam's entry after the others, and removes only it", () => {
  const other = { name: "X", method: "GET", url: "https://x/{doi}", mode: "html", selector: "a" };
  const { Zotero } = fakeZotero({ resolvers: JSON.stringify([other]) });
  assert.equal(syncResolver(Gam(Zotero), true), true);
  assert.deepEqual(JSON.parse(Zotero.prefs.get("findPDFs.resolvers")).map((e) => e.name), ["X", RESOLVER_NAME]);
  assert.equal(syncResolver(Gam(Zotero), true), false);
  assert.equal(syncResolver(Gam(Zotero), false), true);
  assert.deepEqual(JSON.parse(Zotero.prefs.get("findPDFs.resolvers")), [other]);
});

test("sync clears the pref when the list becomes empty, and does not write []", () => {
  const { Zotero } = fakeZotero();
  syncResolver(Gam(Zotero), true);
  assert.deepEqual(JSON.parse(Zotero.prefs.get("findPDFs.resolvers")), [RESOLVER]);
  syncResolver(Gam(Zotero), false);
  assert.equal(Zotero.prefs.has("findPDFs.resolvers"), false);
  assert.equal(syncResolver(Gam(Zotero), false), false);
});

test("sync does not write a pref that is not valid JSON, and says so", () => {
  const { Zotero } = fakeZotero({ resolvers: "{bad" });
  assert.equal(syncResolver(Gam(Zotero), true), false);
  assert.equal(Zotero.prefs.get("findPDFs.resolvers"), "{bad");
  assert.equal(Zotero.notices.length, 1);
  assert.match(Zotero.notices[0], /findPDFs\.resolvers is not valid JSON/);
});

test("canFind: a DOI (field or Extra) and no PDF or EPUB", () => {
  const { Zotero, items } = fakeZotero();
  assert.equal(canFind(Zotero, makeItem(Zotero, items, 1, { doi: "10.1/a" })), true);
  assert.equal(canFind(Zotero, makeItem(Zotero, items, 2, { extra: "DOI: 10.1/b" })), true);
  assert.equal(canFind(Zotero, makeItem(Zotero, items, 3)), false);
  assert.equal(canFind(Zotero, makeItem(Zotero, items, 4, { doi: "10.1/c", files: ["application/pdf"] })), false);
  assert.equal(canFind(Zotero, makeItem(Zotero, items, 5, { doi: "10.1/d", files: ["application/epub+zip"] })), false);
  assert.equal(canFind(Zotero, makeItem(Zotero, items, 6, { doi: "10.1/e", files: ["text/html"] })), true);
  assert.equal(canFind(Zotero, makeItem(Zotero, items, 7, { doi: "10.1/f", trash: true })), false);
});

test("the open link goes to Zotero, and nothing is downloaded by gam", async () => {
  const { Zotero, items } = fakeZotero();
  const a = makeItem(Zotero, items, 1, { doi: "10.1371/journal.pone.0000308" });
  const d = deps({ addFileFromURLs: async (item, links) => { d.calls.add.push({ item, links }); return { id: 5 }; } });
  const counts = await findPDFs(Gam(Zotero), [a], d);
  assert.equal(d.calls.request.length, 1);
  assert.equal(d.calls.request[0].url,
    "https://api.openalex.org/works/doi:10.1371%2Fjournal.pone.0000308?select=id,locations,has_content,content_urls");
  assert.deepEqual(d.calls.add[0].links.map((l) => l.url), ["https://pmc.ncbi.nlm.nih.gov/articles/PMC1817752/pdf/"]);
  assert.equal(d.calls.download.length, 0);
  assert.equal(counts.attached, 1);
  assert.match(Zotero.notices.at(-1), /1 PDF attached/);
});

test("items without a DOI or with a PDF are left out and counted", async () => {
  const { Zotero, items } = fakeZotero();
  const list = [makeItem(Zotero, items, 1), makeItem(Zotero, items, 2, { doi: "10.1/x", files: ["application/pdf"] })];
  const d = deps();
  const counts = await findPDFs(Gam(Zotero), list, d);
  assert.equal(d.calls.request.length, 0);
  assert.equal(counts.skipped, 2);
  assert.match(Zotero.notices.at(-1), /2 items left out/);
});

test("with a key and no open PDF, gam gets the OpenAlex copy with the key in a header", async () => {
  const { Zotero, items } = fakeZotero();
  const a = makeItem(Zotero, items, 1, { doi: "10.1/a" });
  const d = deps({ getKey: async () => KEY });
  const counts = await findPDFs(Gam(Zotero), [a], d);
  assert.equal(d.calls.request[0].opts.headers.Authorization, `Bearer ${KEY}`);
  assert.equal(d.calls.download.length, 1);
  assert.equal(d.calls.download[0].url, "https://content.openalex.org/works/W2046766973.pdf");
  assert.equal(d.calls.download[0].opts.headers.Authorization, `Bearer ${KEY}`);
  assert.equal(d.calls.import.length, 1);
  assert.deepEqual(d.calls.import[0], {
    file: "/tmp/gam-openalex-test.pdf", parentItemID: 1, fileBaseName: "Author - 2020 - Title",
    contentType: "application/pdf", moveFile: true,
  });
  assert.deepEqual([counts.attached, counts.hosted], [1, 1]);
  noKeyAnywhere(d);
});

test("without a key there is no download and no Authorization header", async () => {
  const { Zotero, items } = fakeZotero();
  const d = deps();
  const counts = await findPDFs(Gam(Zotero), [makeItem(Zotero, items, 1, { doi: "10.1/a" })], d);
  assert.equal(d.calls.download.length, 0);
  assert.equal(d.calls.request[0].opts.headers?.Authorization, undefined);
  assert.equal(counts.notFound, 1);
});

test("a download that is not a PDF is not attached, and the temp file goes", async () => {
  const { Zotero, items } = fakeZotero();
  const d = deps({ getKey: async () => KEY, readHead: async () => new TextEncoder().encode("<html>") });
  const counts = await findPDFs(Gam(Zotero), [makeItem(Zotero, items, 1, { doi: "10.1/a" })], d);
  assert.equal(d.calls.import.length, 0);
  assert.deepEqual(d.calls.removed, ["/tmp/gam-openalex-test.pdf"]);
  assert.equal(counts.notFound, 1);
});

test("a refused key stops the run: later items get no request", async () => {
  const { Zotero, items } = fakeZotero();
  const list = [1, 2, 3].map((id) => makeItem(Zotero, items, id, { doi: `10.1/${id}` }));
  const d = deps({ getKey: async () => KEY, request: async (url, opts) => { d.calls.request.push({ url, opts }); return { status: 401, response: null }; } });
  const counts = await findPDFs(Gam(Zotero), list, d);
  assert.equal(d.calls.request.length, 1);
  assert.equal(counts.stopped, "key");
  assert.match(Zotero.notices.at(-1), /OpenAlex refused the API key/);
  assert.doesNotMatch(Zotero.notices.at(-1), new RegExp(KEY));
});

test("a 429 stops the run with the budget text", async () => {
  const { Zotero, items } = fakeZotero();
  const list = [1, 2].map((id) => makeItem(Zotero, items, id, { doi: `10.1/${id}` }));
  const d = deps({ request: async (url, opts) => { d.calls.request.push({ url, opts }); return { status: 429, response: null }; } });
  const counts = await findPDFs(Gam(Zotero), list, d);
  assert.equal(d.calls.request.length, 1);
  assert.equal(counts.stopped, "budget");
  assert.match(Zotero.notices.at(-1), /daily OpenAlex budget/);
});

test("a 401 of the OpenAlex copy stops the run too", async () => {
  const { Zotero, items } = fakeZotero();
  const list = [1, 2].map((id) => makeItem(Zotero, items, id, { doi: `10.1/${id}` }));
  const d = deps({ getKey: async () => KEY, download: async (url, path, opts) => { d.calls.download.push({ url, path, opts }); return { status: 401 }; } });
  const counts = await findPDFs(Gam(Zotero), list, d);
  assert.equal(d.calls.request.length, 1);
  assert.equal(counts.stopped, "key");
  assert.deepEqual(d.calls.removed, ["/tmp/gam-openalex-test.pdf"]);
});

test("a work that OpenAlex does not know counts as not found, and the run goes on", async () => {
  const { Zotero, items } = fakeZotero();
  const list = [1, 2].map((id) => makeItem(Zotero, items, id, { doi: `10.1/${id}` }));
  const d = deps({ request: async (url, opts) => { d.calls.request.push({ url, opts }); return { status: 404, response: null }; } });
  const counts = await findPDFs(Gam(Zotero), list, d);
  assert.equal(d.calls.request.length, 2);
  assert.equal(counts.notFound, 2);
});

test("a network failure stops the run as offline", async () => {
  const { Zotero, items } = fakeZotero();
  const list = [1, 2].map((id) => makeItem(Zotero, items, id, { doi: `10.1/${id}` }));
  const d = deps({ request: async () => { d.calls.request.push({}); throw Object.assign(new Error("net"), { status: 0 }); } });
  const counts = await findPDFs(Gam(Zotero), list, d);
  assert.equal(d.calls.request.length, 1);
  assert.equal(counts.stopped, "offline");
});

test("an item that gets a PDF during the run is left out", async () => {
  const { Zotero, items } = fakeZotero();
  const a = makeItem(Zotero, items, 1, { doi: "10.1/a" });
  const b = makeItem(Zotero, items, 2, { doi: "10.1/b" });
  const d = deps({ request: async (url, opts) => { d.calls.request.push({ url, opts }); addFile(items, b); return { status: 200, response: work }; } });
  const counts = await findPDFs(Gam(Zotero), [a, b], d);
  assert.equal(d.calls.request.length, 1);
  assert.equal(counts.skipped, 1);
});

test("a second run while one runs gives a notice and does nothing", async () => {
  const { Zotero, items } = fakeZotero();
  let release;
  const gate = new Promise((r) => { release = r; });
  const d = deps({ request: async (url, opts) => { await gate; return { status: 404, response: null }; } });
  const first = findPDFs(Gam(Zotero), [makeItem(Zotero, items, 1, { doi: "10.1/a" })], d);
  const second = await findPDFs(Gam(Zotero), [makeItem(Zotero, items, 2, { doi: "10.1/b" })], deps());
  assert.equal(second, null);
  assert.match(Zotero.notices.at(-1), /runs already/);
  release();
  await first;
  assert.notEqual(await findPDFs(Gam(Zotero), [], deps()), null);
});

test("a 403 of one OpenAlex copy counts as not found, and the run goes on", async () => {
  const { Zotero, items } = fakeZotero();
  const list = [1, 2].map((id) => makeItem(Zotero, items, id, { doi: `10.1/${id}` }));
  const d = deps({ getKey: async () => KEY, download: async (url, path, opts) => { d.calls.download.push({ url, path, opts }); return { status: 403 }; } });
  const counts = await findPDFs(Gam(Zotero), list, d);
  assert.equal(d.calls.request.length, 2);
  assert.equal(counts.stopped, null);
  assert.equal(counts.notFound, 2);
  assert.equal(d.calls.removed.length, 2);
});
