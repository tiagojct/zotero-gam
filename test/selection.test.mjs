import { test } from "node:test";
import assert from "node:assert/strict";
import { refuseReason, libraryName, selectionAnswer, MAX_ITEMS } from "../content/lib/selection.mjs";

test("refuseReason allows a plain GET from a local program", () => {
  assert.equal(refuseReason({ method: "GET", headers: { "User-Agent": "zotero-local-mcp/0.9.0" } }), null);
  assert.equal(refuseReason({ method: "GET" }), null);
});

test("refuseReason refuses web pages, browsers and writes", () => {
  assert.match(refuseReason({ method: "GET", headers: { Origin: "https://evil.example" } }), /web pages/);
  assert.match(refuseReason({ method: "GET", headers: { origin: "null" } }), /web pages/);
  assert.match(refuseReason({ method: "GET", headers: { "user-agent": "Mozilla/5.0" } }), /browsers/);
  assert.match(refuseReason({ method: "POST", headers: {} }), /GET only/);
});

test("libraryName names user and group libraries as the MCP tools do", () => {
  assert.equal(libraryName({ type: "user" }), "user");
  assert.equal(libraryName({ type: "group", groupID: 12345 }), "group:12345");
  assert.equal(libraryName({ type: "group" }), "user");
});

test("selectionAnswer lists the items with defaults for missing fields", () => {
  const a = selectionAnswer({
    version: "0.4.0",
    tab: "library",
    items: [{ key: "AAAA1111", itemType: "journalArticle", title: "T", citekey: "smith2020" }],
    collection: { key: "COLL0001", name: "Thesis" },
  });
  assert.equal(a.gam, "0.4.0");
  assert.equal(a.count, 1);
  assert.deepEqual(a.items[0], {
    key: "AAAA1111", library: "user", itemType: "journalArticle", title: "T", citekey: "smith2020", doi: "",
  });
  assert.deepEqual(a.collection, { key: "COLL0001", name: "Thesis" });
  assert.equal(a.note, undefined);
  assert.equal(a.truncated, undefined);
});

test("selectionAnswer says when nothing is selected or no window is open", () => {
  assert.match(selectionAnswer({ version: "x", tab: "library" }).note, /Nothing is selected/);
  assert.match(selectionAnswer({ version: "x" }).note, /no main window/);
});

test("selectionAnswer cuts a long selection and says so", () => {
  const items = Array.from({ length: MAX_ITEMS + 5 }, (_, n) => ({ key: `K${n}` }));
  const a = selectionAnswer({ version: "x", tab: "library", items });
  assert.equal(a.items.length, MAX_ITEMS);
  assert.equal(a.count, MAX_ITEMS + 5);
  assert.equal(a.truncated, true);
});
