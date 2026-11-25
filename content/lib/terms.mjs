// Words that keep their capitals in titles. Pure module: no Zotero or browser globals.
// A term that is also a common word (may, march, polish, turkey) is not in the lists.

const list = (text) => text.split(/[,\n]/).map((t) => t.trim()).filter(Boolean);

const BUILTIN = {
  en: list(`
    Africa, Asia, Europe, America, Antarctica, Oceania, North America, South America, Latin America, Central America,
    Sub-Saharan Africa, Middle East, Mediterranean, Scandinavia,
    Afghanistan, Albania, Algeria, Angola, Argentina, Armenia, Australia, Austria, Azerbaijan, Bahrain, Bangladesh,
    Belarus, Belgium, Benin, Bolivia, Bosnia and Herzegovina, Botswana, Brazil, Bulgaria, Burkina Faso, Burundi,
    Cambodia, Cameroon, Canada, Cape Verde, Chile, China, Colombia, Costa Rica, Croatia, Cuba, Cyprus, Czech Republic,
    Czechia, Denmark, Dominican Republic, East Timor, Ecuador, Egypt, El Salvador, Equatorial Guinea, Eritrea, Estonia,
    Eswatini, Ethiopia, Finland, France, Gabon, Georgia, Germany, Ghana, Greece, Guatemala, Guinea-Bissau, Haiti,
    Honduras, Hong Kong, Hungary, Iceland, India, Indonesia, Iran, Iraq, Ireland, Israel, Italy, Ivory Coast, Jamaica,
    Japan, Kazakhstan, Kenya, Kosovo, Kuwait, Latvia, Lebanon, Lesotho, Liberia, Libya, Lithuania, Luxembourg,
    Madagascar, Malawi, Malaysia, Mali, Malta, Mauritania, Mauritius, Mexico, Moldova, Mongolia, Montenegro, Morocco,
    Mozambique, Myanmar, Namibia, Nepal, Netherlands, New Zealand, Nicaragua, Niger, Nigeria, North Korea,
    North Macedonia, Norway, Oman, Pakistan, Palestine, Panama, Papua New Guinea, Paraguay, Peru, Philippines, Poland,
    Portugal, Qatar, Romania, Russia, Rwanda, Saudi Arabia, Senegal, Serbia, Sierra Leone, Singapore, Slovakia,
    Slovenia, Somalia, South Africa, South Korea, Spain, Sri Lanka, Sudan, Sweden, Switzerland, Syria, Taiwan,
    Tanzania, Thailand, Timor-Leste, Togo, Tunisia, Uganda, Ukraine, United Arab Emirates, United Kingdom,
    United States, Great Britain, England, Scotland, Wales, Northern Ireland, Uruguay, Uzbekistan, Venezuela, Vietnam,
    Yemen, Zambia, Zimbabwe,
    African, Algerian, American, Americans, Angolan, Argentinian, Asian, Australian, Austrian, Bangladeshi, Belgian,
    Brazilian, British, Bulgarian, Cameroonian, Canadian, Chilean, Chinese, Colombian, Croatian, Cuban, Czech, Danish,
    Dutch, Egyptian, English, Estonian, Ethiopian, European, Europeans, Filipino, Finnish, French, German, Germans,
    Ghanaian, Greek, Hispanic, Hungarian, Icelandic, Indian, Indonesian, Iranian, Iraqi, Irish, Israeli, Italian,
    Japanese, Kenyan, Korean, Kuwaiti, Latvian, Lebanese, Lithuanian, Malaysian, Maltese, Mexican, Moroccan,
    Mozambican, Nepalese, Nigerian, Nordic, Norwegian, Pakistani, Palestinian, Peruvian, Portuguese, Romanian,
    Russian, Rwandan, Saudi, Scandinavian, Scottish, Serbian, Singaporean, Slovak, Slovenian, Spanish, Sudanese,
    Swedish, Swiss, Syrian, Taiwanese, Tanzanian, Thai, Tunisian, Turkish, Ugandan, Ukrainian, Vietnamese, Welsh,
    Arabic, Bengali, Catalan, Galician, Hebrew, Hindi, Mandarin Chinese, Persian, Swahili, Urdu,
    Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday,
    January, February, April, June, July, September, October, November, December,
    Alzheimer, Parkinson, Crohn, Hodgkin, Huntington, Sjögren, Raynaud, Tourette, Asperger, Kawasaki disease,
    Down syndrome, Turner syndrome, Marfan, Bayesian, Bayes, Gaussian, Markov, Monte Carlo, Kaplan-Meier,
    Kaplan–Meier, Cochrane, Likert, Nobel, Declaration of Helsinki, COVID-19, COVID,
    Christian, Christianity, Jewish, Judaism, Muslim, Islam, Islamic, Buddhist, Buddhism, Hindu, Hinduism,
    American Thoracic Society, European Respiratory Society, European Academy of Allergy and Clinical Immunology,
    American Academy of Allergy Asthma and Immunology, British Thoracic Society, Global Initiative for Asthma,
    Global Lung Function Initiative, World Health Organization, World Medical Association, United Nations,
    European Union, European Commission, European Parliament, European Medicines Agency, European Health Data Space,
    Food and Drug Administration, National Institutes of Health, World Bank
  `),
  pt: list(`
    África, América, América do Norte, América do Sul, América Latina, Antártida, Ásia, Europa, Oceânia,
    Afeganistão, África do Sul, Albânia, Alemanha, Angola, Arábia Saudita, Argélia, Argentina, Austrália, Áustria,
    Bélgica, Bolívia, Brasil, Bulgária, Cabo Verde, Canadá, Chile, China, Chipre, Colômbia, Coreia do Norte,
    Coreia do Sul, Croácia, Cuba, Dinamarca, Egito, Equador, Escócia, Eslováquia, Eslovénia, Espanha, Estados Unidos,
    Estónia, Etiópia, Filipinas, Finlândia, França, Grécia, Guiné-Bissau, Guiné Equatorial, Hungria, Índia, Indonésia,
    Inglaterra, Irão, Iraque, Irlanda, Islândia, Israel, Itália, Japão, Letónia, Líbano, Lituânia, Luxemburgo, Malta,
    Marrocos, México, Moçambique, Nigéria, Noruega, Nova Zelândia, País de Gales, Países Baixos, Paquistão, Polónia,
    Portugal, Quénia, Reino Unido, Roménia, Ruanda, Rússia, São Tomé e Príncipe, Senegal, Sérvia, Síria, Suécia, Suíça,
    Tailândia, Tanzânia, Timor-Leste, Tunísia, Turquia, Ucrânia, Uganda, Uruguai, Venezuela, Vietname, Zâmbia, Zimbabué
  `),
};

/** The terms of a file: one in each line, "#" for comments, "en:" or "pt:" before a term for one language. */
export function parseTerms(text) {
  const out = [];
  for (const raw of String(text ?? "").replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.normalize("NFC").replace(/\s+/g, " ").trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(en|pt):\s*(.*)$/i);
    const term = m ? m[2] : line;
    if (term) out.push({ term, lang: m ? m[1].toLowerCase() : null });
  }
  return out;
}

/** The terms of one language, longest first. A term of the user replaces one that differs only in case. */
export function termsFor(lang, user) {
  const terms = new Map();
  const add = (t) => terms.set(t.toLowerCase(), t);
  for (const t of BUILTIN[lang] || []) add(t);
  for (const t of user) {
    if (!t.lang || t.lang === lang) add(t.term);
  }
  return [...terms.values()].sort((a, b) => b.length - a.length);
}
