import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter, firstSection } from "../content/lib/frontmatter.mjs";

test("reads scalars, quoted strings and lists", () => {
  const { data, body } = parseFrontmatter('---\ntitle: "A: b"\nyear: 2025\ntags:\n  - topic/ai\n  - topic/ed\nstatus: to-read\n---\n\n## Summary\n\nText.\n');
  assert.deepEqual(data, { title: "A: b", year: "2025", tags: ["topic/ai", "topic/ed"], status: "to-read" });
  assert.match(body, /^## Summary/m);
});

test("empty list and inline list", () => {
  assert.deepEqual(parseFrontmatter("---\ntags: []\na: [x, y]\n---\n").data, { tags: [], a: ["x", "y"] });
});

test("no frontmatter gives empty data", () => {
  assert.deepEqual(parseFrontmatter("# Note\n").data, {});
});

test("BOM and CRLF", () => {
  assert.equal(parseFrontmatter("﻿---\r\nstatus: read\r\n---\r\nx").data.status, "read");
});

test("broken YAML does not throw", () => {
  assert.doesNotThrow(() => parseFrontmatter('---\ntitle: "open\n  : :\n---\n'));
});

test("unclosed frontmatter gives empty data", () => {
  assert.deepEqual(parseFrontmatter("---\nstatus: read\nno end").data, {});
});

test("escaped quotes in double-quoted strings", () => {
  assert.equal(parseFrontmatter('---\ntitle: "He said \\"no\\""\n---\n').data.title, 'He said "no"');
});

test("single-quoted strings with doubled quotes", () => {
  assert.equal(parseFrontmatter("---\ntitle: 'It''s'\n---\n").data.title, "It's");
});

test("quoted list items", () => {
  assert.deepEqual(parseFrontmatter('---\nauthors:\n  - "Silva, A."\n---\n').data.authors, ["Silva, A."]);
});

test("firstSection returns the first lines under the heading", () => {
  const body = "## Summary (from abstract)\n\nLine 1.\nLine 2.\nLine 3.\n\n## Key points\n- a\n";
  assert.equal(firstSection(body, "## Summary", 2), "Line 1.\nLine 2.");
  assert.equal(firstSection(body, "## Missing", 2), "");
});

test("firstSection stops at the next heading", () => {
  assert.equal(firstSection("## Summary\nA.\n## Key points\nB.\n", "## Summary", 5), "A.");
});
