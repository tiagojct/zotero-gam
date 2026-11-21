// The selection endpoint: request check and answer. Pure module: no Zotero or browser globals.

/** At most this many selected items in one answer. */
export const MAX_ITEMS = 200;

/**
 * Why a request to a gam endpoint is refused, or null when it is allowed.
 * Zotero already drops most browser requests. gam also refuses each request with an Origin
 * header, because only a web page sends one, and only GET (the endpoint reads only).
 */
export function refuseReason({ method, headers = {} }) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  if (method !== "GET") return "gam endpoints accept GET only";
  if ("origin" in h) return "Requests from web pages are refused";
  if (String(h["user-agent"] || "").startsWith("Mozilla/")) return "Requests from browsers are refused";
  return null;
}

/** The library name for the MCP tools: "user" or "group:<groupID>". */
export function libraryName({ type, groupID }) {
  return type === "group" && groupID ? `group:${groupID}` : "user";
}

/**
 * The answer of GET /gam/selection.
 * tab: "library", "reader", "note" or another tab type (null without a main window).
 * items: [{key, library, itemType, title, citekey, doi}] of the selected regular items, notes or files.
 * reader: {key, library} of the file open in the reader tab, or null.
 * collection: {key, name} of the selected collection, or null.
 */
export function selectionAnswer({ version, tab = null, items = [], reader = null, collection = null }) {
  const list = items.slice(0, MAX_ITEMS).map((i) => ({
    key: i.key,
    library: i.library || "user",
    itemType: i.itemType || "",
    title: i.title || "",
    citekey: i.citekey || "",
    doi: i.doi || "",
  }));
  const out = { gam: version, tab, count: items.length, items: list, reader, collection };
  if (items.length > MAX_ITEMS) out.truncated = true;
  if (tab === null) out.note = "Zotero has no main window open.";
  else if (!items.length) out.note = "Nothing is selected in Zotero.";
  return out;
}
