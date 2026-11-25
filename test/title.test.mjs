import { test } from "node:test";
import assert from "node:assert/strict";
import { safeFix, dropLooseTags, segments, plainText } from "../content/lib/title.mjs";

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
  ["The fallacy</p>", "The fallacy"], ["<jats:p>The fallacy</jats:p>", "The fallacy"],
  ["<p>One</p><p>Two</p>", "One Two"],
  // Text that looks like a tag: it stays (the window can take it away).
  ["Line one<br/>line two", "Line one<br/>line two"],
  ["Pronunciation of <a> and <u> in English", "Pronunciation of <a> and <u> in English"],
  ["Expectation value <p> of momentum", "Expectation value <p> of momentum"],
  ["if a <b > c then", "if a <b > c then"], ["Option<U>", "Option<U>"], ["The <i> tag", "The <i> tag"],
  ["The &lt;p&gt; and &lt;a&gt; elements in HTML", "The <p> and <a> elements in HTML"],
  ["<scp>COPD</scp> in adults", "COPD in adults"], ["Mass <inline-formula><tex-math>x</tex-math></inline-formula> law", "Mass x law"],
  // A superscript or subscript never goes: 10<sup>6</sup> is not 106.
  ['10<sup class="x">6</sup> stem cells', "10<sup>6</sup> stem cells"], ["10<jats:sup>6</jats:sup> cells", "10<sup>6</sup> cells"],
  ["CO<jats:sub>2</jats:sub> and H<sub id='a'>2</sub>O", "CO<sub>2</sub> and H<sub>2</sub>O"],
  ['<i class="x">E. coli</i> and <b id="y">more</b>', "<i>E. coli</i> and <b>more</b>"],
  ["<mml:math><mml:mi>x</mml:mi></mml:math> law", "x law"],
  ["<mml:math><mml:msup><mml:mn>10</mml:mn><mml:mn>6</mml:mn></mml:msup></mml:math> CFU",
    "<mml:math><mml:msup><mml:mn>10</mml:mn><mml:mn>6</mml:mn></mml:msup></mml:math> CFU"],
  ["<mml:math><mml:mfrac><mml:mn>1</mml:mn><mml:mn>2</mml:mn></mml:mfrac></mml:math> dose",
    "<mml:math><mml:mfrac><mml:mn>1</mml:mn><mml:mn>2</mml:mn></mml:mfrac></mml:math> dose"],
  // Entities.
  ["Caf&eacute;", "Café"], ["Symbicort&reg;", "Symbicort®"], ["5&ndash;10 &mdash; IL-1&beta;", "5–10 — IL-1β"],
  ["1990&#150;2000", "1990–2000"], ["Children&#146;s", "Children’s"], ["e&#769;tude", "étude"], ["&Eacute;tude", "Étude"],
  ["x&#13;", "x&#13;"], ["A &fnof;", "A &fnof;"],
  // Final dots of abbreviations.
  ...["Aspergillus spp.", "Candida sp.", "8 a.m. to 5 p.m.", "B.Sc.", "Mr. X vs.", "1st ed.", "In ca.", "Health Dept.", "Acme Lda.",
    "Wait for it. . .", "In Ph.D.", "Smith Jr.", "Am. Assoc.", "See Fig.", "Silva e Cia.", "65 yrs.", "Pills, &c."].map((t) => [t, t]),
  // A final dot after a tag.
  ["Study of <i>Escherichia coli</i>.", "Study of <i>Escherichia coli</i>"], ["In the <b>U.S</b>.", "In the <b>U.S</b>."],
  ["R &amp; D &lt;i&gt;x&lt;/i&gt;", "R & D <i>x</i>"], ["AT&T results", "AT&T results"],
  ["It&#8217;s &#x41;", "It’s A"], ["&unknown; stays", "&unknown; stays"],
  ["FEV<sub>1</sub> and <i>E. coli</i>", "FEV<sub>1</sub> and <i>E. coli</i>"],
  ["<i>A title.</i>", "<i>A title</i>"],
  ["<b>Bold", "<b>Bold"], ["Bold</b> word", "Bold</b> word"],
  ["<em>Deep</em> learning", "Deep learning"],
  ["<i>one <b>two</i> three</b>", "<i>one <b>two</i> three</b>"],
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

test("safeFix keeps every letter and digit of random titles, and is stable", () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const tokens = ["<i>", "</i>", "<b>", "</b>", "<p>", "</p>", "<a>", "<u>", "<br/>", "<span class=\"nocase\">", "</span>", "&amp;", "&eacute;",
    "&reg;", "&#150;", "&lt;", "&gt;", "a", "B", "é", "e\u0301", "1", ".", ":", ";", ",", "…", " ", "  ", "\u00a0", "\u00ad", "<", ">", "spp.", "U.S.", "Word", "-"];
  const bare = (t) => t.replace(/<[^<>]*>/g, "").replace(/[^\p{L}\p{N}]/gu, "");
  for (let i = 0; i < 20000; i += 1) {
    const t = Array.from({ length: 1 + rnd(9) }, () => tokens[rnd(tokens.length)]).join("");
    const once = safeFix(t);
    assert.ok(once || !t.trim(), t);
    if (/&lt;|&gt;/.test(t)) continue;
    assert.equal(safeFix(once), once, t);
    const decoded = t.replace(/&eacute;/g, "é").replace(/&(amp|reg|#150);/g, "").normalize("NFC");
    // A title without letters or digits stays as it is.
    if (bare(decoded)) assert.equal(bare(once), bare(decoded), t);
  }
});

test("dropLooseTags removes the tags that have no pair", () => {
  assert.equal(dropLooseTags("<b>Bold"), "Bold");
  assert.equal(dropLooseTags("Bold</b> word"), "Bold word");
  assert.equal(dropLooseTags("<i>one <b>two</i> three</b>"), "<i>one two</i> three");
  assert.equal(dropLooseTags("Line one<br/>line two"), "Line one line two");
  assert.equal(dropLooseTags("FEV<sub>1</sub> < 2"), "FEV<sub>1</sub> < 2");
  assert.equal(dropLooseTags("List<String>"), "List<String>");
  assert.equal(dropLooseTags("<a>"), "<a>");
  assert.equal(dropLooseTags("10<sup>6 cells"), "10<sup>6 cells");
  const math = "<mml:math><mml:msup><mml:mn>10</mml:mn><mml:mn>6</mml:mn></mml:msup> CFU";
  assert.equal(dropLooseTags(math), math);
});

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
