import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUri, parseUris, childNoteHtml } from "../content/lib/obsidian.mjs";

test("buildUri encodes the slash and drops .md", () => {
  assert.equal(buildUri("Powerslave", "sub-sub/literature/abdulnour2025.md"),
    "obsidian://open?vault=Powerslave&file=sub-sub%2Fliterature%2Fabdulnour2025");
});

test("buildUri encodes like Python quote(safe='') for parity with attach_note", () => {
  assert.equal(buildUri("v", "a (b)'s!.md"), "obsidian://open?vault=v&file=a%20%28b%29%27s%21");
});

test("parseUris reads attach_note HTML with &amp;", () => {
  const html = '<div><p>s</p><p><a href="obsidian://open?vault=Powerslave&amp;file=sub-sub%2Fliterature%2Fabdulnour2025">Obsidian: abdulnour2025</a></p></div>';
  assert.deepEqual(parseUris(html), [{ vault: "Powerslave", file: "sub-sub/literature/abdulnour2025.md" }]);
});

test("parseUris keeps .md when present, returns NFC, skips links without file", () => {
  const html = 'obsidian://open?file=x%2Fgonc%CC%A7a.md&vault=v obsidian://open?vault=v';
  assert.deepEqual(parseUris(html), [{ vault: "v", file: "x/gonça.md" }]);
});

test("childNoteHtml matches the attach_note format and escapes text", () => {
  assert.equal(childNoteHtml("A < B", "obsidian://open?vault=v&file=x", "x"),
    '<div><p>A &lt; B</p><p><a href="obsidian://open?vault=v&amp;file=x">Obsidian: x</a></p></div>');
});
