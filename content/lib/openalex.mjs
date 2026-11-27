// PDFs from OpenAlex: the entry of gam in Zotero's list of PDF resolvers, and the rules of the command
// "Find PDF in OpenAlex". Pure module: no Zotero or browser globals.

export const RESOLVER_NAME = "OpenAlex (gam)";

/**
 * gam's entry in Zotero's pref findPDFs.resolvers. Find Full Text (and a save from the browser, with
 * "automatic") asks OpenAlex for the work and tries its open locations that have a PDF link. A location
 * with a null link would make Zotero open landing pages, so the selector leaves it out.
 */
export const RESOLVER = Object.freeze({
  name: RESOLVER_NAME,
  method: "GET",
  url: "https://api.openalex.org/works/doi:{doi}?select=locations",
  mode: "json",
  selector: '.locations{.is_oa === true}{.pdf_url ^= "http"}',
  mappings: Object.freeze({ url: "pdf_url", pageURL: "landing_page_url" }),
  automatic: true,
});

/** JSON with the keys in order, to compare two entries. */
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * The next value of findPDFs.resolvers. raw: the value now (a string, or empty). on: the setting of gam.
 * Returns {value, changed}: value is the new string, or null to clear the pref (an empty list). Returns
 * {error} when raw is not a list of resolvers: gam then writes nothing. Other entries stay, in their order.
 */
export function nextResolvers(raw, on) {
  let list;
  const text = String(raw ?? "").trim();
  if (!text) {
    list = [];
  } else {
    try {
      list = JSON.parse(text);
    } catch {
      return { error: "not valid JSON" };
    }
    // Zotero also takes one resolver object without a list.
    if (!Array.isArray(list)) {
      if (list && typeof list === "object" && list.method) list = [list];
      else return { error: "not a list of resolvers" };
    }
  }
  const isOurs = (e) => e && typeof e === "object" && e.name === RESOLVER_NAME;
  const ours = list.filter(isOurs);
  const others = list.filter((e) => !isOurs(e));
  const wanted = on ? [RESOLVER] : [];
  if (stable(ours) === stable(wanted)) return { value: text || null, changed: false };
  const next = [...others, ...wanted];
  return { value: next.length ? JSON.stringify(next) : null, changed: true };
}

/** The OpenAlex URL of the work with this DOI, for the command. */
export function workURL(doi) {
  return `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}?select=id,locations,has_content,content_urls`;
}

/** The open PDF links of a work, as Zotero's urlResolvers ({url, pageURL}), in order, each once. */
export function openLinks(work) {
  const seen = new Set();
  const links = [];
  for (const loc of Array.isArray(work?.locations) ? work.locations : []) {
    if (loc?.is_oa !== true || typeof loc.pdf_url !== "string" || !/^https?:\/\//.test(loc.pdf_url)) continue;
    if (seen.has(loc.pdf_url)) continue;
    seen.add(loc.pdf_url);
    links.push(loc.landing_page_url ? { url: loc.pdf_url, pageURL: loc.landing_page_url } : { url: loc.pdf_url });
  }
  return links;
}

/** The link of the PDF that OpenAlex keeps (it needs a key), or null. */
export function hostedLink(work) {
  if (work?.has_content?.pdf !== true) return null;
  const url = work.content_urls?.pdf;
  return typeof url === "string" && /^https:\/\//.test(url) ? url : null;
}

/** The kind of a failed answer: key (refused), budget (429), missing (404), offline (0), error. */
export function failure(status) {
  if (status === 401 || status === 403) return "key";
  if (status === 429) return "budget";
  if (status === 404) return "missing";
  if (status === 0) return "offline";
  return "error";
}

const MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** True when "%PDF-" is in the first 1024 bytes, as PDF readers accept. */
export function looksLikePDF(bytes) {
  const end = Math.min(bytes?.length || 0, 1024) - MAGIC.length;
  for (let i = 0; i <= end; i++) {
    if (MAGIC.every((b, j) => bytes[i + j] === b)) return true;
  }
  return false;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** The notice at the end of a run, one line for each count that is not zero. */
export function summary({ attached = 0, hosted = 0, notFound = 0, skipped = 0, errors = 0 }) {
  const first = attached
    ? `Find PDF in OpenAlex: ${plural(attached, "PDF", "PDFs")} attached${hosted ? ` (${hosted} from OpenAlex copies)` : ""}.`
    : "Find PDF in OpenAlex: no PDF attached.";
  const lines = [first];
  if (notFound) lines.push(`${plural(notFound, "item", "items")} without an open PDF.`);
  if (skipped) lines.push(`${plural(skipped, "item", "items")} left out (no DOI, or a PDF already).`);
  if (errors) lines.push(`${plural(errors, "error", "errors")}: see the debug output.`);
  return lines.join("\n");
}
