// Which radios the data marks checked, against Chrome
// (test/fixtures/radio.json, recorded by ren-html's scripts/radio-oracle.mjs
// with ren-html's copy): for each case a page renders (two checked in a
// group, in a form or none, names that differ, no name, two forms, a form
// attribute, a radio checked, unchecked or renamed later, a checked one
// coming in, a form owner changing as a form goes or an id changes or comes
// in), the radios marked checked are the ones Chrome checks: the last
// checked of each group (its name and form owner), but where KNOWN says why
// not.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Root, $dispose } from 'ren-core';
import { $flush } from 'rrx-core';
import { $tree } from 'ren-json';
import { radioCase } from './fixtures/radio-view.jsx';

/** @typedef {import('./fixtures/radio-view.jsx').Case & { chrome: boolean[] }} Row */
const oracle = /** @type {{ recorded: string, cases: Row[] }} */ (JSON.parse(readFileSync(new URL('./fixtures/radio.json', import.meta.url), 'utf8')));

/** Cases whose data cannot mark what the page checks, and why. */
const ORDER = 'the data reads the view as it is, not the order its radios were checked in (the last checked in the tree is the one kept)';
const AROUND =
  'the data reads the view as it is, the radio in the group of the form its form attribute names; the page, building the tree, grouped it first with the form around it, whose checked radios it met there';
const OWNER =
  'the data reads the view as it is, not the order the page met it in: as a radio\'s form owner changed (a form gone, an id changed or come in), the page unchecked the other checked radio of its new group, and the radio that stayed has since been unchecked or gone';
const KNOWN = /** @type {Record<string, string>} */ ({
  'the first checked later': ORDER,
  'the first checked later, in a form': ORDER,
  'a checked radio comes in before the checked one': ORDER,
  'a form attribute leaves the form around it': AROUND,
  'nested forms, a form attribute names the outer one': AROUND,
  'the named form removed, then the radio naming it unchecked': OWNER,
  'the named form removed, then the radio after it unchecked': OWNER,
  'the named form removed, then the radio naming it removed': OWNER,
  "the named form's id changes away, then the radio naming it removed": OWNER,
  "a form's id changes to the one named, then the radio naming it removed": OWNER,
  'an element of the named id comes in before the form, then the radio naming it removed': OWNER,
});

/** The radios in the data, in order. @param {any} node @param {any[]} [out] @returns {any[]} */
const radios = (node, out = []) => {
  if (Array.isArray(node)) for (const n of node) radios(n, out);
  else if (node !== null && typeof node === 'object') {
    if (node.role === 'radio') out.push(node);
    radios(node.children ?? [], out);
  }
  return out;
};

describe(`ren json radios, as ${oracle.recorded} checks them`, () => {
  it('marks checked the radios Chrome checks: the last checked of each group', () => {
    oracle.cases.forEach((c, i) => {
      const host = $tree();
      const { View, apply } = radioCase(c);
      const root = Root({ id: `c${i}`, target: null, renderer: host, storage: null, locks: null, retire: false, sweep: false, children: View });
      for (const step of c.steps ?? []) {
        apply(step);
        $flush(root);
      }
      const marks = radios(host.json()).map(r => r.checked === true);
      if (KNOWN[c.name] === undefined) assert.deepEqual(marks, c.chrome, c.name);
      else assert.notDeepEqual(marks, c.chrome, `${c.name}: marked as checked now (${KNOWN[c.name]} no longer)`);
      $dispose(root);
    });
    for (const name in KNOWN) assert.ok(oracle.cases.some(c => c.name === name), `${name}: a case the table has`);
  });
});
