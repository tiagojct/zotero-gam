import { test } from "node:test";
import assert from "node:assert/strict";
import { planNote, localDate } from "../content/lib/plan-note.mjs";
import { parseFrontmatter } from "../content/lib/frontmatter.mjs";

const json = { title: "T", itemType: "journalArticle", date: "2026", creators: [{ creatorType: "author", lastName: "Gamtest", firstName: "A." }] };
const base = { json, itemKey: "ABCDEFGH", vaultName: "powerslave", literatureFolder: "sub-sub/literature", today: "2026-11-14" };

test("an existing citekey is kept", () => {
  const p = planNote({ ...base, existingKey: "mykey2026", taken: new Set(["mykey2026"]) });
  assert.equal(p.citekey, "mykey2026");
  assert.equal(p.newKey, false);
  assert.equal(p.relPath, "sub-sub/literature/mykey2026.md");
  assert.equal(parseFrontmatter(p.text).data.citekey, "mykey2026");
});

test("no citekey: the rule makes one, with a suffix on a collision", () => {
  const p = planNote({ ...base, existingKey: null, taken: new Set(["gamtest2026"]) });
  assert.equal(p.citekey, "gamtest2026a");
  assert.equal(p.newKey, true);
});

test("the child note links to the new file in the attach_note format", () => {
  const p = planNote({ ...base, existingKey: "gamtest2026", taken: new Set() });
  assert.equal(p.childHtml,
    '<div><p>Literature note in the vault.</p><p><a href="obsidian://open?vault=powerslave&amp;file=sub-sub%2Fliterature%2Fgamtest2026">Obsidian: gamtest2026</a></p></div>');
});

test("localDate is YYYY-MM-DD in local time", () => {
  assert.equal(localDate(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
});
