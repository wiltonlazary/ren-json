// Which options a select's data marks selected, against Chrome
// (test/fixtures/select.json, recorded by ren-html's scripts/select-oracle.mjs
// with ren-html's copy): for each case a page renders (a value before or
// after its options, options coming in later, selected options before and
// after the value's match, two selected in a single select, multiple
// selects, optgroups, disabled options, a value matched by text, '' and
// unmatched values, list boxes, options in a div or a nested optgroup,
// multiple set and removed), the options marked are the ones ren-dom's select shows
// in Chrome, but the first option a single select shows by itself, which
// carries no data, and where KNOWN says why not.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Root, $dispose } from 'ren-core';
import { $flush } from 'rrx-core';
import { $tree } from 'ren-json';
import { selectCase } from './fixtures/select-view.jsx';

/** @typedef {import('./fixtures/select-view.jsx').Spec} Spec */
/** @typedef {import('./fixtures/select-view.jsx').Case & { chrome: { index: number, selected: boolean[] } }} Row */
const oracle = /** @type {{ recorded: string, cases: Row[] }} */ (JSON.parse(readFileSync(new URL('./fixtures/select.json', import.meta.url), 'utf8')));

/** Cases whose data cannot mark what the live select shows, and why. */
const KNOWN = /** @type {Record<string, string>} */ ({
  'a selected option comes in before the one selected': 'the data reads the view as it is, not the order its options came in (the last to come in selected is the one shown)',
  'multiple removed, two selected': 'the data reads the view as it is, not that it was multiple (a single select shows its last selected option)',
  'multiple removed from a list box, two selected': 'the data reads the view as it is, not that it was multiple (a single select shows its last selected option)',
  'multiple set, the first picked by itself': 'the data reads the view as it is, not that it was single (the option a drop-down picked by itself, which carries no data)',
});

/**
 * The options of a spec list, as Chrome's select counts them: in a div, and
 * one optgroup deep. @param {Spec[]} list @param {boolean} [grouped] @returns {Spec[]}
 */
const flat = (list, grouped = false) =>
  list.flatMap(o => (o.group !== undefined ? (grouped ? [] : flat(o.options ?? [], true)) : o.wrap === true ? flat(o.options ?? [], grouped) : [o]));

/** The options a node holds, in order: its own and its groups' (a div dissolves), one group deep. @param {any} node @param {boolean} [grouped] @returns {any[]} */
const optionsOf = (node, grouped = false) =>
  (node.children ?? []).flatMap((/** @type {any} */ c) => (c.role === 'option' ? [c] : c.role === 'group' && !grouped ? optionsOf(c, true) : []));

/** The case's options after its steps, its value and multiple. @param {Row} c */
function last(c) {
  let options = c.options;
  /** @type {string | null | undefined} */
  let value = c.value;
  let multiple = c.multiple;
  for (const step of c.steps ?? []) {
    if ('value' in step) value = step.value;
    if (step.options !== undefined) options = step.options;
    if (step.multiple !== undefined) multiple = step.multiple;
  }
  return { options: flat(options), value, multiple };
}

describe(`ren json select, as ${oracle.recorded} selects`, () => {
  it('marks selected the options Chrome shows, but a single select\'s first shown by itself', () => {
    oracle.cases.forEach((c, i) => {
      if (c.steps?.some(s => s.pick !== undefined)) return;
      const host = $tree();
      const { View, apply } = selectCase(c, () => {});
      const root = Root({ id: `c${i}`, target: null, renderer: host, storage: null, locks: null, retire: false, sweep: false, children: View });
      for (const step of c.steps ?? []) {
        apply(step);
        $flush(root);
      }
      const [select] = host.json();
      const marks = optionsOf(select).map(o => o.selected === true);
      const { options, value, multiple } = last(c);
      // By itself: no option selected itself, and no value an option has.
      const alone = multiple !== true && !options.some(o => o.selected === true || o.attribute === true) && !(value != null && options.some(o => (o.value ?? o.text?.replace(/[\t\n\f\r ]+/g, ' ').trim()) === value));
      const want = alone ? c.chrome.selected.map(() => false) : c.chrome.selected;
      if (KNOWN[c.name] === undefined) assert.deepEqual(marks, want, c.name);
      else assert.notDeepEqual(marks, want, `${c.name}: marked as shown now (${KNOWN[c.name]} no longer)`);
      $dispose(root);
    });
    for (const name in KNOWN) assert.ok(oracle.cases.some(c => c.name === name), `${name}: a case the table has`);
  });

  it('keeps an optgroup as a group named by its label', async () => {
    const host = $tree();
    const root = Root({ id: 'groups', target: null, renderer: host, storage: null, locks: null, retire: false, sweep: false, children: () => (
      <select aria-label="Size" value="m">
        <optgroup label="Small"><option value="s">S</option></optgroup>
        <optgroup label="Large" disabled><option value="m">M</option></optgroup>
      </select>
    ) });
    assert.deepEqual(host.json(), [{ role: 'combobox', label: 'Size', value: 'm', children: [
      { role: 'group', label: 'Small', children: [{ role: 'option', value: 's', text: 'S' }] },
      { role: 'group', label: 'Large', disabled: true, children: [{ role: 'option', value: 'm', selected: true, text: 'M' }] },
    ] }]);
    $dispose(root);
  });
});
