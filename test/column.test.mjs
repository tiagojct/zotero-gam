import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndex } from "../content/lib/index.mjs";
import { registerColumn } from "../content/ui/column.mjs";

function setup() {
  const columns = {};
  const unregistered = [];
  let refreshed = 0;
  const Zotero = {
    ItemTreeManager: {
      registerColumn: (opt) => { columns[opt.dataKey] = opt; return `gam-${opt.dataKey}`; },
      unregisterColumn: (k) => unregistered.push(k),
      refreshColumns: () => { refreshed += 1; },
    },
  };
  const index = buildIndex([
    { path: "lit/cai2026.md", text: "---\ncitekey: cai2026\nstatus: read\n---\n" },
    { path: "lit/doe2020.md", text: "---\ncitekey: doe2020\n---\n" },
    ...Array.from({ length: 12 }, (_, i) => ({ path: `r/n${i}.md`, text: "See [[doe2020]]." })),
    { path: "r/one.md", text: "[[cai2026]]" },
    { path: "r/two.md", text: "[@cai2026]" },
  ], { literatureFolder: "lit" });
  const Gam = {
    Zotero, id: "gam@x", onRefresh: [], cleanups: [], log() {},
    state: { index, links: new Map() },
    prefs: { vaultName: () => "v" },
    itemInfo: (i) => ({ citekey: i.citekey || null, itemKey: i.key, doi: "" }),
  };
  const dataKeys = registerColumn(Gam);
  return { Gam, columns, dataKeys, unregistered, refreshed: () => refreshed };
}
const regular = (citekey) => ({ citekey, key: "KEY00000", isRegularItem: () => true });
const doc = { createElement: () => ({ style: {}, className: "", textContent: "" }) };

test("both columns are registered, refreshed together and removed together", () => {
  const s = setup();
  assert.deepEqual(s.dataKeys, ["gam-gamNote", "gam-gamCited"]);
  s.Gam.onRefresh[0]({ columnChanged: false });
  assert.equal(s.refreshed(), 0);
  s.Gam.onRefresh[0]({ columnChanged: true });
  assert.equal(s.refreshed(), 1);
  s.Gam.cleanups[0]();
  assert.deepEqual(s.unregistered, s.dataKeys);
});

test("Cited in: data sorts as text in the order of the counts, and the cell shows the count", () => {
  const { columns } = setup();
  const col = columns.gamCited;
  const keys = ["doe2020", "cai2026", "nobody2000"];
  const data = keys.map((k) => col.dataProvider(regular(k)));
  assert.deepEqual([...data].sort(), [data[2], data[1], data[0]]);
  const text = (d) => col.renderCell(0, d, { className: "c" }, false, doc).textContent;
  assert.deepEqual(data.map(text), ["12", "2", "0"]);
});

test("Cited in: no data for an item that is not regular or when there is no index", () => {
  const { columns, Gam } = setup();
  assert.equal(columns.gamCited.dataProvider({ isRegularItem: () => false }), "");
  Gam.state.index = null;
  assert.equal(columns.gamCited.dataProvider(regular("doe2020")), "");
});

test("Cited in: the first click gives the most cited items first, and the column state is kept", () => {
  const { columns } = setup();
  assert.equal(columns.gamCited.sortReverse, true);
  assert.deepEqual(columns.gamCited.zoteroPersist, ["width", "hidden", "sortDirection"]);
});
