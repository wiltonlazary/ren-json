// The roles ren-json gives elements by themselves, against Chrome's
// accessibility tree (test/fixtures/roles.json, recorded by ren-html's
// scripts/roles-oracle.mjs from test/fixtures/roles-view.jsx): each element
// ren-json maps, in the contexts that change its role (a header or footer in
// a sectioning element, an aside in one, a th in its row, a td in a grid, a
// select's size, an input's type and list, an img's empty alt), has the role
// Chrome gives it, ARIA's name for it, or none where Chrome's is generic or
// it ignores the element (ren-json dissolves such a wrapper: that is no
// difference); KNOWN lists the differences ren-json keeps on purpose, and why.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { $json } from 'ren-json';
import { views } from './fixtures/roles-view.jsx';

/** @typedef {{ name: string, chrome: string | null }} Row */
const oracle = /** @type {{ recorded: string, cases: Row[] }} */ (JSON.parse(readFileSync(new URL('./fixtures/roles.json', import.meta.url), 'utf8')));

/** Chrome's names for roles ARIA names otherwise, or none: a wrapper, which ren-json dissolves. No prototype. */
const ARIA = /** @type {Record<string, string | null>} */ (Object.assign(Object.create(null), { image: 'img', generic: null, none: null }));

/** Chrome's own roles, which ARIA has no role for: the role ren-json gives, and why. */
const OWN = 'ARIA has no role for it';
const KNOWN = /** @type {Record<string, string>} */ ({
  summary: `a button, the control it is (Chrome's own DisclosureTriangle: ${OWN})`,
  dl: `a list of its terms and definitions (Chrome's own DescriptionList: ${OWN})`,
  figcaption: `its figure's caption (Chrome's own Figcaption: ${OWN})`,
  'input type color': `a textbox, its value the colour (Chrome's own ColorWell: ${OWN})`,
  'input type date': `a textbox, its value the date (Chrome's own Date: ${OWN})`,
  'input type time': `a textbox, its value the time (Chrome's own InputTime: ${OWN})`,
  'input type datetime-local': `a textbox, its value the date and time (Chrome's own DateTime: ${OWN})`,
  'input type month': `a textbox, its value the month (Chrome's own DateTime: ${OWN})`,
  'input type week': `a textbox, its value the week (Chrome's own DateTime: ${OWN})`,
  // Chrome guesses a table with no caption, header, summary or role is for layout; the data keeps it a table, so its records stay.
  'table without a caption or headers': `a table of rows and cells, its data kept (Chrome's own LayoutTable, a guess that it only lays out: ${OWN})`,
  'td in a table without a caption or headers': `a cell of its table (Chrome's own LayoutTableCell: ${OWN})`,
});

/**
 * The role ren-json gives the probed element: the node named "probe" (a
 * record's cell when it has no role), or the header whose text is "Probe"
 * (a key of its table's records); null when it dissolved, undefined when
 * not in `node`.
 * @param {any} node @param {boolean} [cell] @returns {string | null | undefined}
 */
function roleIn(node, cell = false) {
  if (node === null || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const n of node) {
      const role = roleIn(n, cell);
      if (role !== undefined) return role;
    }
    return undefined;
  }
  if (node.name === 'probe') return node.role ?? (cell ? 'cell' : null);
  if (node.text === 'Probe') return node.role ?? null;
  if (Array.isArray(node.columns) && node.columns.includes('Probe')) return 'columnheader';
  if (node.rows !== undefined && !Array.isArray(node.rows) && Object.hasOwn(node.rows, 'Probe')) return 'rowheader';
  if (node.rows !== undefined) {
    const records = Array.isArray(node.rows) ? node.rows : Object.values(node.rows);
    for (const record of records) {
      const role = roleIn(record !== null && typeof record === 'object' && !Array.isArray(record) && record.role === undefined && record.name === undefined ? Object.values(record) : record, true);
      if (role !== undefined) return role;
    }
  }
  return roleIn(node.children, false);
}

describe(`ren json roles, as ${oracle.recorded} reads them`, () => {
  it('records every view, and only them', () => {
    assert.deepEqual(oracle.cases.map(c => c.name), views.map(([name]) => name));
  });

  it('gives each element the role Chrome gives it, but where KNOWN says why not', async () => {
    const byName = new Map(views);
    for (const c of oracle.cases) {
      const view = /** @type {() => any} */ (byName.get(c.name));
      const got = roleIn(await $json(view)) ?? null;
      const want = c.chrome === null ? null : c.chrome in ARIA ? ARIA[c.chrome] : c.chrome;
      if (KNOWN[c.name] === undefined) assert.equal(got, want, `${c.name}: Chrome reads ${c.chrome}`);
      else assert.notEqual(got, want, `${c.name}: the same as Chrome's now (${KNOWN[c.name]} no longer)`);
    }
    for (const name in KNOWN) assert.ok(oracle.cases.some(c => c.name === name), `${name}: a case the table has`);
  });
});
