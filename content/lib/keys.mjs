// Citation keys of many items: plans, problems and changes. Pure module: no Zotero or browser globals.

import { baseKey, uniqueKey, currentKey } from "./citekey.mjs";

/** The largest batch of new items that gets keys without a preview. */
export const AUTO_KEY_MAX = 20;

/**
 * entries: [{id, title, json, existingKey, skip}]. skip is a reason when the item must not get a key.
 * taken: the keys in use (library and vault). The function does not change it.
 * Returns rows in the same order: {id, title, status: "assign" | "skip", citekey, reason}.
 * New keys do not collide with taken keys or with each other.
 */
export function planKeys(entries, taken) {
  const used = new Set(taken);
  return entries.map((e) => {
    const row = { id: e.id, title: e.title || "(no title)", status: "skip", citekey: e.existingKey || "", reason: "" };
    if (e.existingKey) return { ...row, reason: "already have a citekey" };
    if (e.skip) return { ...row, reason: e.skip };
    const citekey = uniqueKey(baseKey(e.json), used);
    used.add(citekey);
    return { ...row, status: "assign", citekey };
  });
}

/**
 * holders: [{id, title, native, extra}]: the citationKey field and the Extra text of each item.
 * Returns {missing: [{id, title}], shared: [{key, items: [{id, title, key}]}], twoKeys: [{id, title, native, extra}]}.
 * Keys that differ only in case are shared: their notes have the same file name on macOS.
 */
export function keyReport(holders) {
  const missing = [];
  const twoKeys = [];
  const byKey = new Map();
  for (const h of holders) {
    const key = currentKey({ citationKey: h.native, extra: h.extra });
    if (!key) {
      missing.push({ id: h.id, title: h.title });
      continue;
    }
    const extraKey = currentKey({ extra: h.extra });
    if (h.native && extraKey && extraKey !== h.native) twoKeys.push({ id: h.id, title: h.title, native: h.native, extra: extraKey });
    const fold = key.toLowerCase();
    if (!byKey.has(fold)) byKey.set(fold, []);
    byKey.get(fold).push({ id: h.id, title: h.title, key });
  }
  const shared = [...byKey.values()].filter((items) => items.length > 1).map((items) => ({ key: items[0].key, items }));
  return { missing, shared, twoKeys };
}

/** One line for each problem of a keyReport. */
export function reportLines({ shared, twoKeys }) {
  return [
    ...shared.map((s) => `${s.key} is the key of ${s.items.length} items: ${s.items.map((i) => i.title || "(no title)").join("; ")}`),
    ...twoKeys.map((t) => `${t.title || "(no title)"} has two keys: ${t.native} (field) and ${t.extra} (Extra)`),
  ];
}

/**
 * before, after: Map of item ID to key ("" for none). ids: the items to compare.
 * Returns [{id, from, to}] for each item whose key changed or was removed. A first key is not a change.
 */
export function keyChanges(before, after, ids) {
  const out = [];
  for (const id of ids) {
    const from = before.get(id) || "";
    const to = after.get(id) || "";
    if (from && from !== to) out.push({ id, from, to });
  }
  return out;
}
