import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTerms, termsFor } from "../content/lib/terms.mjs";
import { titleLanguage, buildEvidence, names, caseProposal } from "../content/lib/case.mjs";

const propose = (title, { lang = "en", user = "", names: n = [] } = {}) =>
  caseProposal({ title, lang, terms: lang ? termsFor(lang, parseTerms(user)) : [], names: new Set(n) });

const languages = [
  ["Inteligência artificial nas organizações de saúde", "en", "pt"],
  ["Que número é este?: um guia sobre estatísticas", "en", "pt"],
  ["Inovação pedagógica", "en", "pt"],
  ["Redação de documentos académicos e científicos", "en", "pt"],
  ["Resolução do conselho de ministros n.º 2/2026", "en", "pt"],
  ["Asthma", "en", "en"], ["Asthma", "", "en"], ["Asma", "pt", "pt"], ["Asma", "pt-PT", "pt"],
  ["Asthma in São Paulo", "", "en"],
  ["De novo mutations", "", "en"],
  ["The role of the family", "pt", "en"],
  ["Einführung in die Medizin und die Pflege", "", null],
  ["La santé des femmes et les politiques", "en", null],
  ["El uso de la espirometría en los adultos", "en", null],
  ["Anything", "de", null], ["Anything", "fr-FR", null],
  ["Anything", "en-GB", "en"], ["Anything", "eng", "en"],
  ["", "", "en"],
];
for (const [title, field, lang] of languages) {
  test(`titleLanguage ${JSON.stringify(title)} (${field})`, () => assert.equal(titleLanguage(title, field), lang));
}

const changes = [
  ["Prevalence of asthma in portuguese adults", "Prevalence of asthma in Portuguese adults", "terms"],
  ["European respiratory society/american thoracic society technical statement",
    "European Respiratory Society/American Thoracic Society technical statement", "terms"],
  ["Forgetting in early modern europe’s cities", "Forgetting in early modern Europe’s cities", "terms"],
  ["<i>portuguese</i> adults in africa", "<i>Portuguese</i> adults in Africa", "terms"],
  ["The Role of Artificial Intelligence in Evidence-Based Medicine",
    "The role of artificial intelligence in evidence-based medicine", "title-case"],
  ["Managing Chronic Disease in Portugal: A Review of mHealth Tools",
    "Managing chronic disease in Portugal: a review of mHealth tools", "title-case"],
  ["The Great Debate? Yes, the Great Debate Continues Today",
    "The great debate? Yes, the great debate continues today", "title-case"],
  ["Vitamin D Supplementation for COPD Patients Under Treatment",
    "Vitamin D supplementation for COPD patients under treatment", "title-case"],
  ["Chronic Hepatitis A Infection in Younger Adult Patients",
    "Chronic hepatitis A infection in younger adult patients", "title-case"],
  ["Asthma Outcomes in the U.S. Medicare Population During Winter",
    "Asthma outcomes in the U.S. medicare population during winter", "title-case"],
  ["USE OF FENO IN SEVERE ASTHMA", "Use of feno in severe asthma", "title-case"],
  ["ASTHMA IN PORTUGAL. A NEW STUDY", "Asthma in Portugal. A new study", "title-case"],
  ["<i>Fluent Confident Wrong</i> Models in Higher Education",
    "<i>Fluent confident wrong</i> models in higher education", "title-case"],
  ['The <span class="nocase">Great Big</span> Study of Severe Asthma Outcomes Today',
    'The <span class="nocase">Great Big</span> study of severe asthma outcomes today', "title-case"],
  ["Asia and the ASIA Trial of Severe Asthma Patients Today",
    "Asia and the ASIA trial of severe asthma patients today", "title-case"],
];
for (const [from, to, reason] of changes) {
  test(`caseProposal changes ${JSON.stringify(from)}`, () => {
    assert.deepEqual(propose(from), { title: to, reasons: [reason], suggestion: null });
    assert.deepEqual(propose(to), { title: to, reasons: [], suggestion: null });
  });
}

for (const title of ["COVID-19", "JAMA", "1984", "", "Piranesi", "Herman Melville and the wake", "How chatbots will reshape medicine",
  "ISO/IEC/IEEE 12207", "The EUROPE trial", "Digital Health", "A may and march review", "¿?", "<i></i>"]) {
  test(`caseProposal leaves ${JSON.stringify(title)}`, () =>
    assert.deepEqual(propose(title), { title, reasons: [], suggestion: null }));
}

test("a term only adds capitals in a title that is not Title Case", () => {
  assert.equal(propose("New MHealth tools for adults", { user: "mHealth" }).title, "New MHealth tools for adults");
  assert.equal(propose("New mhealth tools for adults", { user: "mHealth" }).title, "New mHealth tools for adults");
  assert.equal(propose("A portuguese study", { user: "portuguese" }).title, "A portuguese study");
});

test("a term does not give the title a lower-case first letter", () => {
  assert.equal(propose("MHealth Tools for Severe Asthma Patients Everywhere", { user: "mHealth" }).title,
    "MHealth tools for severe asthma patients everywhere");
});

test("terms are whole words, with Unicode letters", () => {
  assert.equal(propose("The africanização of a word").title, "The africanização of a word");
  assert.equal(propose("A delphié study", { user: "Delphi" }).title, "A delphié study");
});

test("the longest term wins", () => {
  assert.equal(propose("The new york heart association classes", { user: "New York Heart Association\nNew York" }).title,
    "The New York Heart Association classes");
});

test("a term of the user with characters of a regular expression", () => {
  assert.equal(propose("Using c++ (and r) today", { user: "C++\nR" }).title, "Using C++ (and R) today");
});

test("words of the abstract give a suggestion, not a change", () => {
  assert.deepEqual(propose("Key competencies – a delphi study", { names: ["delphi"] }),
    { title: "Key competencies – a delphi study", reasons: [], suggestion: "Key competencies – a Delphi study" });
  assert.deepEqual(propose('Key <span class="nocase">melville</span> of melville’s study', { names: ["melville"] }).suggestion,
    'Key <span class="nocase">melville</span> of Melville’s study');
  // In a title that has both, the suggestion is on top of the change.
  assert.deepEqual(propose("A portuguese helsinki study", { names: ["helsinki"] }),
    { title: "A Portuguese helsinki study", reasons: ["terms"], suggestion: "A Portuguese Helsinki study" });
});

test("a word of the abstract keeps its capital in Title Case", () => {
  assert.deepEqual(propose("Misconception of Dalton Law in Respiratory Physiology Teaching", { names: ["dalton"] }),
    { title: "Misconception of Dalton law in respiratory physiology teaching", reasons: ["title-case"], suggestion: null });
  assert.equal(propose("THE LAW OF DALTON IN PHYSIOLOGY", { names: ["dalton"] }).title, "The law of Dalton in physiology");
});

test("Portuguese titles have Portuguese terms", () => {
  assert.equal(propose("Inovação Pedagógica Digital na Medicina Portuguesa Moderna em Portugal", { lang: "pt" }).title,
    "Inovação pedagógica digital na medicina portuguesa moderna em Portugal");
});

test("a title of another language does not change", () => {
  const title = "Einführung in die Medizin und die Pflege*";
  assert.deepEqual(propose(title, { lang: null, names: ["pflege"] }), { title, reasons: [], suggestion: null });
});

test("a final footnote mark gives a suggestion", () => {
  assert.equal(propose("Allergic rhinitis and its impact (ARIA 2008*").suggestion, "Allergic rhinitis and its impact (ARIA 2008");
  assert.equal(propose("Allergic rhinitis †").suggestion, "Allergic rhinitis");
  assert.equal(propose("<i>Allergic rhinitis*</i>").suggestion, "<i>Allergic rhinitis</i>");
  assert.equal(propose("*").suggestion, null);
});

test("names: a capital in the middle of a sentence, never in lower case in the library", () => {
  const ev = buildEvidence(["artificial intelligence", "a method", null]);
  assert.deepEqual([...names("We used the Delphi method and Artificial Intelligence.", ev)], ["delphi"]);
  assert.deepEqual([...names("Delphi. The Delphi.", buildEvidence(["a delphi panel"]))], []);
  // In lower case in its own abstract only.
  assert.deepEqual([...names("The Delphi method. A delphi panel.", buildEvidence([]))], []);
  // After a full stop or at the start: no evidence. After "/" or "-": evidence.
  assert.deepEqual([...names("Melville wrote. Essex sank.", ev)], []);
  assert.deepEqual([...names("the von-Bertalanffy model", ev)], ["bertalanffy"]);
  assert.deepEqual([...names("", ev)], []);
  assert.deepEqual([...names(null, ev)], []);
});
