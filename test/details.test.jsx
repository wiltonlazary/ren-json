// Which details the data shows open, against Chrome
// (test/fixtures/details.json, recorded by ren-html's
// scripts/details-oracle.mjs with ren-html's copy): for each case (open
// details of one name, names that differ, no name, one opened, closed or
// renamed later, an open one coming in, nested) a details' content shows
// only while Chrome leaves it open and every details around it too, and its
// summary while those around it are open: of the open details of a name in
// a tree, the first in the order the page makes them (each child before
// its parent) stays open, but where KNOWN says why not.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Root, $dispose } from 'ren-core';
import { $flush } from 'rrx-core';
import { $tree } from 'ren-json';
import { detailsCase } from './fixtures/details-view.jsx';

/** @typedef {import('./fixtures/details-view.jsx').Case & { chrome: boolean[] }} Row */
/** @typedef {import('./fixtures/details-view.jsx').Node} Node */
const oracle = /** @type {{ recorded: string, cases: Row[] }} */ (JSON.parse(readFileSync(new URL('./fixtures/details.json', import.meta.url), 'utf8')));

/** Cases whose data cannot show what the page leaves open, and why. */
const ORDER = 'the data reads the view as it is, not the order its details were opened or came in (the first open one made is the one kept)';
const KNOWN = /** @type {Record<string, string>} */ ({
  'the second opened later': ORDER,
  'an open one comes in before the open one': ORDER,
});

/** Every text the data shows. @param {any} node @param {Set<string>} [out] */
const texts = (node, out = new Set()) => {
  if (typeof node === 'string') out.add(node);
  else if (Array.isArray(node)) for (const n of node) texts(n, out);
  else if (node !== null && typeof node === 'object') {
    if (typeof node.text === 'string') out.add(node.text);
    texts(node.children ?? [], out);
  }
  return out;
};

/**
 * The texts the page shows when its details are open as `open` says (in
 * document order): a summary while the details around it are open, a
 * details' paragraph while it is open too.
 * @param {Node[]} tree @param {boolean[]} open
 */
const expected = (tree, open) => {
  const out = new Set();
  let at = 0;
  /** @param {Node[]} nodes @param {boolean} shown */
  const walk = (nodes, shown) => {
    for (const n of nodes) {
      if ('div' in n) walk(n.children, shown);
      else {
        const here = open[at++];
        if (shown) out.add(n.id);
        if (shown && here) out.add(`${n.id} inside`);
        walk(n.children ?? [], shown && here);
      }
    }
  };
  walk(tree, true);
  return out;
};

describe(`ren json details, as ${oracle.recorded} opens them`, () => {
  it('shows the content of the details Chrome leaves open: the first open of each name', () => {
    oracle.cases.forEach((c, i) => {
      const host = $tree();
      const { View, apply } = detailsCase(c);
      const root = Root({ id: `c${i}`, target: null, renderer: host, storage: null, locks: null, retire: false, sweep: false, children: View });
      for (const step of c.steps ?? []) {
        apply(step);
        $flush(root);
      }
      const got = [...texts(host.json())].sort();
      const want = [...expected(c.tree, c.chrome)].sort();
      if (KNOWN[c.name] === undefined) assert.deepEqual(got, want, c.name);
      else assert.notDeepEqual(got, want, `${c.name}: shown as Chrome does now (${KNOWN[c.name]} no longer)`);
      $dispose(root);
    });
    for (const name in KNOWN) assert.ok(oracle.cases.some(c => c.name === name), `${name}: a case the table has`);
  });
});
