import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  RESOLVER, RESOLVER_NAME, nextResolvers, workURL, openLinks, hostedLink, failure, looksLikePDF, summary,
} from "../content/lib/openalex.mjs";

const work = JSON.parse(fs.readFileSync(new URL("./fixtures/openalex-work.json", import.meta.url), "utf8"));
const other = { name: "X", method: "GET", url: "https://x.example/{doi}", mode: "html", selector: "a" };
const parse = (r) => JSON.parse(r.value);

test("the resolver entry has the name, selector and automatic flag of the design", () => {
  assert.equal(RESOLVER.name, RESOLVER_NAME);
  assert.equal(RESOLVER_NAME, "OpenAlex (gam)");
  assert.equal(RESOLVER.url, "https://api.openalex.org/works/doi:{doi}?select=locations");
  assert.equal(RESOLVER.selector, '.locations{.is_oa === true}{.pdf_url ^= "http"}');
  assert.deepEqual(RESOLVER.mappings, { url: "pdf_url", pageURL: "landing_page_url" });
  assert.equal(RESOLVER.automatic, true);
});

test("on adds gam's entry to an empty or missing list", () => {
  for (const raw of [undefined, null, "", "[]"]) {
    const r = nextResolvers(raw, true);
    assert.equal(r.changed, true, String(raw));
    assert.deepEqual(parse(r), [RESOLVER]);
  }
});

test("on keeps the other entries first, in their order", () => {
  const r = nextResolvers(JSON.stringify([other, { ...other, name: "Y" }]), true);
  assert.deepEqual(parse(r).map((e) => e.name), ["X", "Y", RESOLVER_NAME]);
});

test("off removes only gam's entry", () => {
  const r = nextResolvers(JSON.stringify([other, RESOLVER]), false);
  assert.equal(r.changed, true);
  assert.deepEqual(parse(r), [other]);
});

test("off on a list with only gam's entry clears the pref", () => {
  assert.deepEqual(nextResolvers(JSON.stringify([RESOLVER]), false), { value: null, changed: true });
});

test("nothing changes when the entry is already as it must be, or absent when off", () => {
  assert.equal(nextResolvers(JSON.stringify([other, RESOLVER]), true).changed, false);
  assert.equal(nextResolvers(JSON.stringify([other]), false).changed, false);
  assert.equal(nextResolvers(undefined, false).changed, false);
  assert.equal(nextResolvers("[]", false).changed, false);
});

test("an older form of gam's entry is replaced", () => {
  const old = { ...RESOLVER, url: "https://api.openalex.org/works/doi:{doi}" };
  const r = nextResolvers(JSON.stringify([old, other]), true);
  assert.equal(r.changed, true);
  assert.deepEqual(parse(r), [other, RESOLVER]);
});

test("a single object counts as a list of one", () => {
  const r = nextResolvers(JSON.stringify(other), true);
  assert.deepEqual(parse(r), [other, RESOLVER]);
});

test("a value that is not valid JSON or not a list gives an error and no value", () => {
  for (const raw of ["{bad", "42", '"text"', '{"name":"no method"}']) {
    const r = nextResolvers(raw, true);
    assert.ok(r.error, raw);
    assert.equal("value" in r, false, raw);
  }
});

test("the lookup URL encodes the DOI", () => {
  const doi = "10.1002/(SICI)1097-4571(199806)49:8<693::AID-ASI4>3.0.CO;2-0#x?y";
  const url = workURL(doi);
  const after = url.slice(url.indexOf("doi:") + 4, url.indexOf("?select="));
  assert.doesNotMatch(after, /[<>#?]/);
  assert.equal(decodeURIComponent(after), doi);
  assert.match(url, /\?select=id,locations,has_content,content_urls$/);
  assert.ok(url.startsWith("https://api.openalex.org/works/doi:"));
});

test("open links are the open locations with a PDF link, once each", () => {
  assert.deepEqual(openLinks(work), [{
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1817752/pdf/",
    pageURL: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1817752/",
  }]);
  const dup = { locations: [
    { is_oa: true, pdf_url: "https://a/x.pdf" }, { is_oa: true, pdf_url: "https://a/x.pdf", landing_page_url: "https://a" },
    { is_oa: false, pdf_url: "https://closed/x.pdf" }, { is_oa: true, pdf_url: "ftp://a/x.pdf" }, null,
  ] };
  assert.deepEqual(openLinks(dup), [{ url: "https://a/x.pdf" }]);
  assert.deepEqual(openLinks({}), []);
  assert.deepEqual(openLinks(null), []);
});

test("the hosted link is there only when OpenAlex has the PDF", () => {
  assert.equal(hostedLink(work), "https://content.openalex.org/works/W2046766973.pdf");
  assert.equal(hostedLink({ ...work, has_content: { pdf: false } }), null);
  assert.equal(hostedLink({ has_content: { pdf: true }, content_urls: { pdf: null } }), null);
  assert.equal(hostedLink(null), null);
});

test("failure gives the kind of each status", () => {
  assert.equal(failure(401), "key");
  assert.equal(failure(403), "key");
  assert.equal(failure(429), "budget");
  assert.equal(failure(404), "missing");
  assert.equal(failure(0), "offline");
  assert.equal(failure(500), "error");
});

test("a PDF starts with %PDF- in its first 1024 bytes", () => {
  const bytes = (s) => new TextEncoder().encode(s);
  assert.equal(looksLikePDF(bytes("%PDF-1.7\n")), true);
  assert.equal(looksLikePDF(bytes("\n\n\r\n  junk%PDF-1.4")), true);
  assert.equal(looksLikePDF(bytes("<html><body>")), false);
  assert.equal(looksLikePDF(bytes(" ".repeat(1030) + "%PDF-1.4")), false);
  assert.equal(looksLikePDF(new Uint8Array()), false);
});

test("the summary has one line for each count that is not zero", () => {
  assert.equal(summary({ attached: 2, hosted: 1, notFound: 1, skipped: 0, errors: 0 }),
    "Find PDF in OpenAlex: 2 PDFs attached (1 from OpenAlex copies).\n1 item without an open PDF.");
  assert.equal(summary({ attached: 1, hosted: 0, notFound: 0, skipped: 2, errors: 1 }),
    "Find PDF in OpenAlex: 1 PDF attached.\n2 items left out (no DOI, or a PDF already).\n1 error: see the debug output.");
  assert.equal(summary({ attached: 0, hosted: 0, notFound: 0, skipped: 0, errors: 0 }),
    "Find PDF in OpenAlex: no PDF attached.");
});
