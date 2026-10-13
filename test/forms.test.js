// Pins what ren-json mirrors from ren-html, so a change on either side shows:
// the void elements (the HTML standard's 18), whose children the page drops,
// and src/forms.js's valueAsNumber and valueAsDate conversions against
// test/fixtures/forms.js, the same table ren-html's own tests check.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'ren-core/jsx-runtime';
import { $json } from 'ren-json';
import { numberValue, dateValue } from '../src/forms.js';
import { FORMS } from './fixtures/forms.js';

/** The HTML standard's void elements: the 13 of its syntax and the 5 its serializer writes without an end tag. */
const VOID = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'basefont', 'bgsound', 'frame', 'keygen', 'param'];
/** Near misses: elements that are not void (a video is not, but shows none of its content: json.test.jsx). */
const NOT_VOID = ['image', 'menuitem', 'isindex', 'nextid', 'spacer', 'command', 'div', 'span', 'object', 'picture'];

test('the void elements are the standard\'s 18: nothing inside one is read', async () => {
  for (const tag of [...VOID, ...NOT_VOID]) {
    // A role keeps the element whatever its tag; its label names it by its content, which a void one has none of.
    const text = JSON.stringify(await $json(() => h('div', { children: h(tag, { role: 'note', children: 'inside' }) })));
    if (VOID.includes(tag)) assert.ok(!text.includes('inside'), `${tag}: ${text}`);
    else assert.ok(text.includes('inside'), `${tag}: ${text}`);
  }
});

test('valueAsNumber and valueAsDate write the value the table gives', () => {
  for (const [prop, type, given, want] of FORMS) {
    let got;
    try {
      got = prop === 'valueAsNumber' ? numberValue(type, given) : dateValue(type, given === null ? null : new Date(given));
    } catch (error) {
      got = `throws ${/** @type {Error} */ (error).name}`;
    }
    assert.equal(got, want, `${prop} ${type} ${given}`);
  }
});
