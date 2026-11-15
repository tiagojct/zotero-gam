import { test } from "node:test";
import assert from "node:assert/strict";
import { statusTone, TONE_COLORS } from "../content/lib/status.mjs";

test("statusTone groups the statuses of the notes", () => {
  assert.equal(statusTone("to-read"), "todo");
  assert.equal(statusTone("To read"), "todo");
  assert.equal(statusTone("reading"), "active");
  assert.equal(statusTone("read"), "done");
  assert.equal(statusTone("unspecified"), "none");
  assert.equal(statusTone("no status"), "none");
  assert.equal(statusTone(""), "none");
  assert.equal(statusTone(null), "none");
});

test("each tone has a light and a dark colour", () => {
  for (const tone of ["todo", "active", "done", "none"]) {
    assert.match(TONE_COLORS[tone][0], /^#[0-9a-f]{6}$/);
    assert.match(TONE_COLORS[tone][1], /^#[0-9a-f]{6}$/);
  }
});
