// The rules that gam shares with the other tools.
// - Citekeys and citations: test/fixtures/citekey-cases.json is an exact copy of the file in
//   zotero-local-mcp, which runs the same cases on citekey.py and vaultkeys.py.
// - Note format: "Create note" writes the frontmatter fields and the body sections of the Sub-Sub
//   template, in the same order.
// The checks against the other repos run only when the repos are next to this one (not in CI).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baseKey, currentKey, uniqueKey } from "../content/lib/citekey.mjs";
import { noteFromItem } from "../content/lib/template.mjs";
import { extractRefs } from "../content/lib/refs.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "fixtures", "citekey-cases.json");
const CASES = JSON.parse(fs.readFileSync(fixture, "utf8"));
const MCP_FIXTURE = path.join(here, "../../zotero-local-mcp/tests/fixtures/citekey-cases.json");
const SUBSUB_TEMPLATE = path.join(here, "../../../apps/subsub/templates/Zotero agent.md");

for (const c of CASES.base_key) {
  test(`baseKey: ${c.name}`, () => assert.equal(baseKey(c.data), c.expected));
}
for (const c of CASES.current_key) {
  test(`currentKey: ${c.name}`, () => assert.equal(currentKey(c.data), c.expected));
}
for (const c of CASES.cited) {
  test(`cited: ${c.name}`, () => assert.deepEqual([...extractRefs(c.text).citekeys].sort(), c.expected));
}
for (const c of CASES.unique_key) {
  test(`uniqueKey: ${c.name}`, () => assert.equal(uniqueKey(c.base, new Set(c.taken)), c.expected));
}

test("the citekey cases are the same as in zotero-local-mcp", { skip: !fs.existsSync(MCP_FIXTURE) && "zotero-local-mcp not found" }, () => {
  assert.equal(fs.readFileSync(fixture, "utf8"), fs.readFileSync(MCP_FIXTURE, "utf8"),
    "Copy tests/fixtures/citekey-cases.json of zotero-local-mcp to test/fixtures/.");
});

/** The top-level frontmatter keys and the "## " headings of a note text. */
function shape(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(m, "no frontmatter");
  return {
    keys: m[1].split("\n").map((l) => l.match(/^([a-z-]+):/)?.[1]).filter(Boolean),
    headings: m[2].split("\n").filter((l) => l.startsWith("## ")),
  };
}

test("the note has the fields and sections of the Sub-Sub template", { skip: !fs.existsSync(SUBSUB_TEMPLATE) && "Sub-Sub not found" }, () => {
  const fence = fs.readFileSync(SUBSUB_TEMPLATE, "utf8").match(/```markdown\n(---\n[\s\S]*?)```/);
  assert.ok(fence, "no ```markdown template in the Sub-Sub file");
  const item = { title: "T", itemType: "journalArticle", date: "2025", DOI: "10.1/x", publicationTitle: "J",
    creators: [{ creatorType: "author", lastName: "A", firstName: "B" }] };
  const note = noteFromItem(item, { citekey: "a2025", itemKey: "AAAAAAAA", today: "2026-11-20" });
  assert.deepEqual(shape(note), shape(fence[1]));
});
