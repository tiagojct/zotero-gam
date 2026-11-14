import { test } from "node:test";
import assert from "node:assert/strict";
import { expandHome, joinPath, checkLiteratureFolder, matchName } from "../content/lib/paths.mjs";

test("expandHome replaces a leading ~ with the home folder", () => {
  assert.equal(expandHome("~/quarterdeck/powerslave", "/Users/t"), "/Users/t/quarterdeck/powerslave");
  assert.equal(expandHome("~", "/Users/t"), "/Users/t");
  assert.equal(expandHome("/abs/path/", "/Users/t"), "/abs/path");
});

test("joinPath joins a root and relative paths with several parts", () => {
  assert.equal(joinPath("/v", "sub-sub/literature/", "x.md"), "/v/sub-sub/literature/x.md");
  assert.equal(joinPath("/v/", "/a//b"), "/v/a/b");
});

test("checkLiteratureFolder accepts a folder inside the vault", () => {
  for (const ok of ["literature", "sub-sub/literature", "a b/ç"]) assert.equal(checkLiteratureFolder(ok), null, ok);
});

test("checkLiteratureFolder refuses an empty, hidden or parent folder", () => {
  assert.match(checkLiteratureFolder(""), /^Set the literature folder/);
  for (const bad of ["..", "../x", "a/../b", ".", "./x", ".hidden", "a/.lit", "a\\b"]) {
    assert.match(checkLiteratureFolder(bad), /^Literature folder not valid/, bad);
  }
});

test("matchName: the exact name first, then the same name in another case or Unicode form", () => {
  assert.equal(matchName(["Lit", "lit"], "lit"), "lit");
  assert.equal(matchName(["literature"], "Literature"), "literature");
  assert.equal(matchName(["cie\u0302ncia"], "ci\u00eancia"), "cie\u0302ncia");
  assert.equal(matchName(["Lit", "LIT"], "lit"), null);
  assert.equal(matchName(["other"], "lit"), null);
});
