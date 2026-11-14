import { test } from "node:test";
import assert from "node:assert/strict";
import { expandHome, joinPath } from "../content/lib/paths.mjs";

test("expandHome replaces a leading ~ with the home folder", () => {
  assert.equal(expandHome("~/quarterdeck/powerslave", "/Users/t"), "/Users/t/quarterdeck/powerslave");
  assert.equal(expandHome("~", "/Users/t"), "/Users/t");
  assert.equal(expandHome("/abs/path/", "/Users/t"), "/abs/path");
});

test("joinPath joins a root and relative paths with several parts", () => {
  assert.equal(joinPath("/v", "sub-sub/literature/", "x.md"), "/v/sub-sub/literature/x.md");
  assert.equal(joinPath("/v/", "/a//b"), "/v/a/b");
});
