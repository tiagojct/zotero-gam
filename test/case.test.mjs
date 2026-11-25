import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTerms, termsFor } from "../content/lib/terms.mjs";
import { acronyms, titleLanguage, buildEvidence, names, caseProposal } from "../content/lib/case.mjs";

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
  ["Severe asthma in sub-saharan africa", "Severe asthma in sub-Saharan Africa", "terms"],
  ["Sub-saharan africa and severe asthma", "Sub-Saharan Africa and severe asthma", "terms"],
  ["Health in Africa. Sub-Saharan Africa and the Burden of Severe Asthma Today",
    "Health in Africa. Sub-Saharan Africa and the burden of severe asthma today", "title-case"],
  ["Role of Ca<sup>2+</sup> Signaling in Severe Asthma Outcomes", "Role of Ca<sup>2+</sup> signaling in severe asthma outcomes", "title-case"],
  ["A China-United States Comparison of Asthma Mortality Trends", "A China-United States comparison of asthma mortality trends", "title-case"],
  ["The EU-Latin America Partnership for Global Health Research", "The EU-Latin America partnership for global health research", "title-case"],
  ["Efficient Quasi-Monte Carlo Methods for Lung Function Models", "Efficient quasi-Monte Carlo methods for lung function models", "title-case"],
  // Names that are also common words: a title in Title Case keeps the capitals that it has.
  ["US Food and Drug Administration Approval Summary: Osimertinib for Adjuvant Treatment",
    "US Food and Drug Administration approval summary: osimertinib for adjuvant treatment", "title-case"],
  ["Prevalence of Asthma Symptoms in Children in Chile", "Prevalence of asthma symptoms in children in Chile", "title-case"],
  ["Malaria Control in Mali and Senegal: A Cohort Study", "Malaria control in Mali and Senegal: a cohort study", "title-case"],
  ["Aspergillus niger Keratitis Among Farmers in Northern Nigeria", "Aspergillus niger keratitis among farmers in northern Nigeria", "title-case"],
  ["Isolation of <i>A. niger</i> From Spoiled Food and Fresh Water in Nigeria", "Isolation of <i>A. niger</i> from spoiled food and fresh water in Nigeria", "title-case"],
  ["Pathogenic Infection of turkey Flocks in Central Turkey Farms", "Pathogenic infection of turkey flocks in central Turkey farms", "title-case"],
  ["Malignant Pleural Effusion of mali Phytoplasma Origin Today", "Malignant pleural effusion of mali phytoplasma origin today", "title-case"],
  ["Allergic Contact Dermatitis to Nail Polish Among Adolescent Patients",
    "Allergic contact dermatitis to nail polish among adolescent patients", "title-case"],
  ["ASPERGILLUS NIGER KERATITIS IN FARMERS OF INDIA", "Aspergillus niger keratitis in farmers of India", "title-case"],
  ["RETAIL TURKEY MEAT IN MARCH AND POLISH FARMS", "Retail turkey meat in march and polish farms", "title-case"],
  ["US FOOD AND DRUG ADMINISTRATION APPROVAL SUMMARY TODAY", "Us Food and Drug Administration approval summary today", "title-case"],
  ["Responses in Guinea-Pig Trachea Smooth Muscle Preparations", "Responses in guinea-pig trachea smooth muscle preparations", "title-case"],
  ["GUINEA PIG TRACHEA SMOOTH MUSCLE IN JORDAN", "Guinea pig trachea smooth muscle in Jordan", "title-case"],
  ["Translation and Validation of the Arabic Version of the Asthma Control Test",
    "Translation and validation of the Arabic version of the asthma control test", "title-case"],
  ["Severe Asthma Outcomes in Turkey, Jordan, Chad and Guinea in August",
    "Severe asthma outcomes in Turkey, Jordan, Chad and Guinea in August", "title-case"],
  ["Airway Smooth Muscle of Guinea Pigs During Severe Asthma Attacks",
    "Airway smooth muscle of guinea pigs during severe asthma attacks", "title-case"],
  ["Renal Function Outcomes After gum arabic Supplementation in Adults",
    "Renal function outcomes after gum arabic supplementation in adults", "title-case"],
  ["PREVALENCE OF ASTHMA SYMPTOMS IN CHILDREN IN CHILE", "Prevalence of asthma symptoms in children in Chile", "title-case"],
  ["The IMF-World Bank Annual Meetings and Global Health Policy",
    "The IMF-World Bank annual meetings and global health policy", "title-case"],
  ["Care of trisomy 21-down syndrome adults", "Care of trisomy 21-Down syndrome adults", "terms"],
  ["Care of non-down syndrome adults", "Care of non-Down syndrome adults", "terms"],
  ["Role of <i>Na</i><sup>+</sup> Signaling in Severe Asthma Outcomes", "Role of <i>Na</i><sup>+</sup> signaling in severe asthma outcomes", "title-case"],
  ["Care in non-european union countries and non-alzheimer dementia",
    "Care in non-European Union countries and non-Alzheimer dementia", "terms"],
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

test("a short title in capitals is a suggestion: it can be acronyms", () => {
  assert.deepEqual(propose("WHO AND CDC"), { title: "WHO AND CDC", reasons: [], suggestion: "Who and cdc" });
  assert.equal(propose("HIV TB COVID-19").reasons.length, 0);
  assert.equal(propose("USE OF COVID-19 TESTS IN ALL SCHOOLS").title, "Use of COVID-19 tests in all schools");
  assert.equal(propose("Black death rates in the United States").reasons.length, 0);
  assert.equal(propose("Long-term Effects of Covid-19 Infection in Younger Adults").title, "Long-term effects of COVID-19 infection in younger adults");
});

test("a tag without a pair gives a suggestion", () => {
  assert.equal(propose("The <i> tag").suggestion, "The tag");
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

// The words of these titles are also names of countries.
const commonWords = [
  "Sensitivity to gum arabic in chronic kidney disease",
  "Sensible timing of food and drug administration in hospital",
  "Sense of red chile and gastric cancer",
  "Sensing phytoplasma mali in apple trees",
  "Sensible use of tinta-da-china",
  "Sense of a step-down syndrome after sedation",
  "Sensible use of a real-world bank of exercises",
  "Efeito do extrato de pau-brasil e da tinta-da-china nos ratos",
  "Sensitization to aspergillus niger in severe asthma",
  "Como os médicos irão usar a inteligência artificial",
  "Asma grave na população suíça e na população argentina",
  "Crianças sírias e a população síria em Portugal",
  "Estudo da população sérvia, estónia e letónia",
  "As mulheres filipinas e os cuidados de saúde",
  "A cuba de fermentação e a malta da universidade",
  "Os países do equador e a saúde da mulher índia",
];
for (const title of commonWords) {
  test(`caseProposal leaves the common words of ${JSON.stringify(title)}`, () => {
    assert.deepEqual(propose(title, { lang: title.startsWith("Sens") ? "en" : "pt" }), { title, reasons: [], suggestion: null });
  });
}

test("a Portuguese name after a hyphen keeps its capital", () => {
  assert.equal(propose("Cooperação Portugal-Brasil em Saúde Pública e Educação Médica", { lang: "pt" }).title,
    "Cooperação Portugal-Brasil em saúde pública e educação médica");
  assert.equal(propose("A cooperação portugal-brasil em saúde", { lang: "pt" }).title, "A cooperação Portugal-Brasil em saúde");
});

test("a Portuguese title in Title Case keeps the capitals of names that are also common words", () => {
  assert.equal(propose("Cuidados de Saúde Primários na Argentina, na Suíça e no Irão", { lang: "pt" }).title,
    "Cuidados de saúde primários na Argentina, na Suíça e no Irão");
  assert.equal(propose("Como os Médicos Irão Usar a Inteligência Artificial na Prática", { lang: "pt" }).title,
    "Como os médicos irão usar a inteligência artificial na prática");
  assert.equal(propose("Asma Grave na População Suíça e na População Argentina Adulta", { lang: "pt" }).title,
    "Asma grave na população suíça e na população argentina adulta");
  assert.equal(propose("Produção e Consumo de Carne de Peru nas Famílias Portuguesas", { lang: "pt" }).title,
    "Produção e consumo de carne de peru nas famílias portuguesas");
  // The term of the user wins.
  assert.equal(propose("Effects of Gum Arabic Supplementation on Renal Function", { user: "arabic" }).title,
    "Effects of gum arabic supplementation on renal function");
});

test("a name of the abstract wins over the same word in capitals", () => {
  const title = "PREVALENCE OF ASTHMA SYMPTOMS IN CHILDREN IN OHIO";
  assert.equal(caseProposal({ title, lang: "en", terms: termsFor("en", []), names: new Set(["ohio"]), acronyms: new Set(["OHIO"]) }).title,
    "Prevalence of asthma symptoms in children in Ohio");
});

test("a title in capitals does not keep a short word that is also an acronym", () => {
  assert.deepEqual([...acronyms("The OR was 1.4, AS and NO in AI", buildEvidence([]))], ["AI"]);
});

test("a title in capitals keeps the acronyms that the abstract has", () => {
  const ev = buildEvidence(["the results of a study"]);
  const found = acronyms("RESULTS: FEV1 and COPD. The COPD Assessment Test (CAT). A cat of mine. ROLE OF. I", ev);
  assert.deepEqual([...found].sort(), ["COPD", "FEV1", "ROLE"]);
  assert.deepEqual([...acronyms(null, ev)], []);
  const title = "RESULTS OF FEV1 IN ADULTS WITH COPD AND ASTHMA";
  assert.equal(caseProposal({ title, lang: "en", terms: termsFor("en", []), names: new Set(), acronyms: found }).title,
    "Results of FEV1 in adults with COPD and asthma");
});
