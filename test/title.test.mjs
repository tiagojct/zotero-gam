import { test } from "node:test";
import assert from "node:assert/strict";
import { safeFix, segments, plainText } from "../content/lib/title.mjs";

const cases = [
  ["  A\u00a0 title\u200b  here ", "A title here"],
  ["Cafe\u0301 study", "Caf\u00e9 study"],
  ["Soft\u00adware", "Software"],
  ["A title.", "A title"],
  ["Identifying bias in research:", "Identifying bias in research"],
  ["A title ;", "A title"],
  ["A title,", "A title"],
  ["A title..", "A title"],
  ["Wait...", "Wait..."], ["Wait…", "Wait…"],
  ["Smith et al.", "Smith et al."], ["Made by Acme Inc.", "Made by Acme Inc."],
  ["Trade in the U.S.", "Trade in the U.S."], ["Vitamin D.", "Vitamin D."],
  ["Is it true?.", "Is it true?"],
  ["<p>The fallacy</p>", "The fallacy"], ["<p>The fallacy", "The fallacy"],
  ["Line one<br/>line two", "Line one line two"],
  ["R &amp; D &lt;i&gt;x&lt;/i&gt;", "R & D <i>x</i>"], ["AT&T results", "AT&T results"],
  ["It&#8217;s &#x41;", "It’s A"], ["&unknown; stays", "&unknown; stays"],
  ["FEV<sub>1</sub> and <i>E. coli</i>", "FEV<sub>1</sub> and <i>E. coli</i>"],
  ["<i>A title.</i>", "<i>A title</i>"],
  ["<b>Bold", "Bold"], ["Bold</b> word", "Bold word"],
  ["<em>Deep</em> learning", "Deep learning"],
  ["<i>one <b>two</i> three</b>", "<i>one two</i> three"],
  ['<span class="nocase">eGFR</span> use', '<span class="nocase">eGFR</span> use'],
  ['<span style="font-variant: small-caps;">Ab</span>', '<span style="font-variant: small-caps;">Ab</span>'],
  ['<span class="x">word</span>', "word"],
  ['<span class="x">a <span class="nocase">b</span></span>', 'a <span class="nocase">b</span>'],
  ["Results with p < 0.05 and FEV1 <80% > 2", "Results with p < 0.05 and FEV1 <80% > 2"],
  ["Types: List<String> and <think> tokens", "Types: List<String> and <think> tokens"],
  ["If a <b and c> d", "If a <b and c> d"],
  ["(ARIA 2008*", "(ARIA 2008*"], ["One – two — “three”", "One – two — “three”"],
  ["", ""], ["...", "..."], [".", "."], ["<p></p>", "<p></p>"],
];

for (const [from, to] of cases) {
  test(`safeFix ${JSON.stringify(from)}`, () => {
    assert.equal(safeFix(from), to);
    assert.equal(safeFix(to), to);
  });
}

test("safeFix takes an empty value as an empty title", () => {
  assert.equal(safeFix(null), "");
  assert.equal(safeFix(undefined), "");
});

test("segments splits text and tags, and marks the text of a nocase span", () => {
  const title = 'A <i>b</i> <span class="nocase">C <b>d</b></span> e < f';
  const s = segments(title);
  assert.equal(s.map((x) => x.text).join(""), title);
  assert.deepEqual(s.filter((x) => !x.tag).map((x) => [x.text, x.nocase]),
    [["A ", false], ["b", false], [" ", false], ["C ", true], ["d", true], [" e < f", false]]);
  assert.deepEqual(segments(""), []);
});

test("plainText is the title without the tags", () => {
  assert.equal(plainText("FEV<sub>1</sub> < 2"), "FEV1 < 2");
});
