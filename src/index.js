// ren-json: a view rendered once to its data, for AI agents, tools, servers
// and native clients. No hydration, and no visual tree: the output is what
// the view means, readable without a parser and without guessing from its
// layout.
//
// Meaning is marked with standard vocabularies (ren-core's `Meaning`):
// - an ARIA `role` and its `aria-*` states, or the role a tag has by itself
//   (h1 a heading, ul a list, a[href] a link, Edit a textbox, Action a
//   button, Image an img), make a node: `{ role, ...fields, text | children }`;
// - microdata (`itemscope`, `itemtype`, `itemprop`, `itemref`, `content`)
//   makes an item, JSON-LD shaped: `{ item: { '@type': 'Product', name, price } }`;
// - a table whose headers name its columns (or its rows) gives records
//   keyed by them: `{ role: 'table', columns, rows: [{ Name: 'Ada' }] }`.
// Everything else is presentation and dissolves: a wrapper (View, div, span)
// gives its content to the nearest node that means something, styles,
// classes, sizes, handlers, refs and `data-*` hooks are dropped, and hidden
// content, drawings, rules and password values never show. Adjacent inline
// text joins into one string; each block of text is a string of its own.
// $json waits until every task the view started has settled ($settle).

import { Root, $settle, $dispose } from 'ren-core';
import { numberValue, dateValue } from './forms.js';

/** @typedef {import('ren-core/host').Host} Host */
/**
 * A node of the data: a text, or an element that means something.
 * @typedef {string | { role?: string, item?: Record<string, unknown>, text?: string, children?: Json[], [field: string]: unknown }} Json
 */

/**
 * The props the output reads; all others are presentation or behaviour and
 * are never kept. `aria-*` props are read too.
 */
const KEEP = new Set([
  'role', 'itemscope', 'itemtype', 'itemprop', 'itemref', 'content', 'hidden', 'inert', 'open', 'id', 'for',
  'text', 'runs', 'value', 'label', 'source', 'selected', 'checked', 'invalid', 'disabled', 'readonly', 'required', 'secret',
  'href', 'src', 'alt', 'title', 'name', 'type', 'datetime', 'placeholder', 'multiple', 'scope', 'data', 'size', 'list', 'form', 'min', 'max',
]);

/** @param {string} name */
const kept = name => KEEP.has(name) || name.startsWith('aria-');

/** The kept props that are an id or name ids: each is read by its attribute's text (see `set`). */
const IDS = new Set(['id', 'for', 'aria-labelledby', 'itemref', 'list']);

/** The WAI-ARIA 1.2 (and 1.3) roles an element may take, less the abstract ones, and the DPUB and Graphics modules' roles. */
const ROLES = new Set([
  'alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote', 'button', 'caption', 'cell', 'checkbox', 'code',
  'columnheader', 'combobox', 'comment', 'complementary', 'contentinfo', 'definition', 'deletion', 'dialog', 'directory', 'document',
  'emphasis', 'feed', 'figure', 'form', 'generic', 'grid', 'gridcell', 'group', 'heading', 'image', 'img', 'insertion', 'link', 'list',
  'listbox', 'listitem', 'log', 'main', 'mark', 'marquee', 'math', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'meter', 'navigation', 'none', 'note', 'option', 'paragraph', 'presentation', 'progressbar', 'radio', 'radiogroup', 'region', 'row',
  'rowgroup', 'rowheader', 'scrollbar', 'search', 'searchbox', 'sectionfooter', 'sectionheader', 'separator', 'slider', 'spinbutton',
  'status', 'strong', 'subscript', 'suggestion', 'superscript', 'switch', 'tab', 'table', 'tablist', 'tabpanel', 'term', 'textbox',
  'time', 'timer', 'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem',
  // DPUB-ARIA 1.1.
  'doc-abstract', 'doc-acknowledgments', 'doc-afterword', 'doc-appendix', 'doc-backlink', 'doc-biblioentry', 'doc-bibliography',
  'doc-biblioref', 'doc-chapter', 'doc-colophon', 'doc-conclusion', 'doc-cover', 'doc-credit', 'doc-credits', 'doc-dedication',
  'doc-endnote', 'doc-endnotes', 'doc-epigraph', 'doc-epilogue', 'doc-errata', 'doc-example', 'doc-footnote', 'doc-foreword',
  'doc-glossary', 'doc-glossref', 'doc-index', 'doc-introduction', 'doc-noteref', 'doc-notice', 'doc-pagebreak', 'doc-pagefooter',
  'doc-pageheader', 'doc-pagelist', 'doc-part', 'doc-preface', 'doc-prologue', 'doc-pullquote', 'doc-qna', 'doc-subtitle', 'doc-tip',
  'doc-toc',
  // Graphics-ARIA 1.0.
  'graphics-document', 'graphics-object', 'graphics-symbol',
]);
/** A WAI-ARIA role, or a DPUB or Graphics module's. @param {string} token */
const ariaRole = token => ROLES.has(token);
/** A token list split on ASCII whitespace only, as a browser splits one (a no-break or em space is part of a token). @param {string} s */
const tokens = s => s.split(/[\t\n\f\r ]+/).filter(t => t !== '');
/** ASCII lowercase, as a browser compares roles (a Unicode fold makes the Kelvin sign a k). @param {string} s */
const lower = s => s.replace(/[A-Z]+/g, c => c.toLowerCase());

/** Roles that mean nothing: the element is a wrapper. */
const NONE = new Set(['presentation', 'none', 'generic']);

/**
 * The HTML void elements, as ren-html writes them: the page drops whatever
 * the view put inside one (a password input's text included), so no route
 * reads it. The first child an element shows: none for a void one.
 */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'param', 'keygen', 'frame', 'basefont', 'bgsound']);
/** @param {Item} item */
const firstOf = item => (VOID.has(item.type) || UNHELD.has(item.type) || typed(item) ? null : item.first);
/** A textarea whose value was set: dirty, as a browser's, so the field shows that value, not its children. @param {Item} item */
const typed = item => item.type === 'textarea' && item.props !== null && item.props.value !== undefined;
/**
 * Elements whose content the page never holds as elements it shows: a
 * template's is inert, and a script's, style's, iframe's, noembed's,
 * noframes's or noscript's is text the parser keeps unrendered. Nothing in
 * them is walked: no role, text, id, label or item.
 */
const UNHELD = new Set(['template', 'script', 'style', 'iframe', 'noembed', 'noframes', 'noscript']);
/** Elements whose content the parser reads as their own text: no element in it has an id or a label for, a role or an item. */
const TEXTUAL = new Set(['textarea', 'title', 'xmp', 'plaintext']);
/** A textual element's content: its descendants' text, joined, as the page holds it as one text. @param {Item} item @returns {string} */
const textual = item => {
  let out = '';
  for (let c = firstOf(item); c !== null; c = c.next) out += c.k === 1 ? c.type : c.k === 0 ? textual(c) : '';
  return out;
};

/** Tags whose content runs on in the text around them. */
const INLINE = new Set(['span', 'b', 'strong', 'i', 'em', 'u', 's', 'small', 'mark', 'sub', 'sup', 'abbr', 'cite', 'q', 'kbd', 'samp', 'var', 'code', 'bdi', 'bdo', 'data', 'ins', 'del', 'font']);

/** Tags and primitives that carry nothing: a drawing, a rule, a script. */
const EMPTY = new Set(['Shape', 'hr', 'svg', 'canvas', 'script', 'style', 'template', 'noscript', 'meta', 'link', 'wbr']);

/**
 * The DOM properties ren-dom sets whose attribute is not their lowercased
 * name (an ariaX property reflects aria-x, read in `set`). No prototype.
 * @type {Record<string, string>}
 */
const REFLECTS = Object.assign(Object.create(null), { htmlFor: 'for', className: 'class', httpEquiv: 'http-equiv', acceptCharset: 'accept-charset' });

/**
 * ARIA's string reflection (ren-html's list, as a browser's ARIAMixin has it):
 * ariaLabel is aria-label. The ID references (ariaLabelledBy, ariaControls, …)
 * take elements, not strings, so ren-dom writes an inert arialabelledby.
 */
const ARIA_STRINGS = new Set(
  [
    'Atomic', 'AutoComplete', 'BrailleLabel', 'BrailleRoleDescription', 'Busy', 'Checked', 'ColCount', 'ColIndex', 'ColIndexText', 'ColSpan',
    'Current', 'Description', 'Disabled', 'Expanded', 'HasPopup', 'Hidden', 'Invalid', 'KeyShortcuts', 'Label', 'Level', 'Live', 'Modal',
    'MultiLine', 'MultiSelectable', 'Orientation', 'Placeholder', 'PosInSet', 'Pressed', 'ReadOnly', 'Relevant', 'Required',
    'RoleDescription', 'RowCount', 'RowIndex', 'RowIndexText', 'RowSpan', 'Selected', 'SetSize', 'Sort', 'ValueMax', 'ValueMin',
    'ValueNow', 'ValueText',
  ].map(name => `aria${name}`),
);

/**
 * The properties that write another attribute, on the elements that have
 * them (ren-dom sets them there; elsewhere they are inert attributes): each
 * is kept as `#name` and read only when the live prop is absent.
 * @type {Record<string, [string, string[]]>}
 */
const DEFAULTS = Object.assign(Object.create(null), {
  defaultChecked: ['#checked', ['input']],
  defaultSelected: ['#selected', ['option']],
  defaultValue: ['#value', ['input']],
});
/** A live prop, or its default's when absent. @param {Record<string, any>} p @param {'checked' | 'selected' | 'value'} key */
const live = (p, key) => {
  if (p[key] !== undefined) return p[key];
  const d = p[`#${key}`];
  // A flag property's default is there as its attribute is: any truthy value.
  return d === undefined || key === 'value' ? d : !!d;
};

/**
 * Whether a URL is `javascript:` as a browser's URL parser reads it (leading
 * C0 controls and spaces dropped, tabs and line breaks ignored, any ASCII
 * case): ren-dom writes none, so the page holds none (its README, "What is
 * never written").
 * @param {unknown} value
 */
const scripted = value => /^javascript:/i.test(String(value).replace(/^[\u0000-\u0020]+/, '').replace(/[\t\n\r]/g, ''));
/** The kept props whose value is a URL: a `javascript:` one is not written. */
const LINKS = new Set(['href', 'src', 'data']);

/** The URL parts an a's or area's href is edited by. */
const URL_PARTS = new Set(['hash', 'search', 'pathname', 'host', 'hostname', 'port', 'protocol', 'username', 'password']);

/** The elements whose `text` property is their content. */
const TEXT_OWNERS = new Set(['a', 'option', 'title', 'script']);

/** The boolean props ren-dom sets as DOM properties, by attribute name: the property's spelling. No prototype. @type {Record<string, string>} */
const BOOLEANS = Object.assign(Object.create(null), { hidden: 'hidden', inert: 'inert', open: 'open', checked: 'checked', selected: 'selected', multiple: 'multiple', disabled: 'disabled', required: 'required', readonly: 'readOnly' });

/** ren-core's primitives, whose names keep their case (every other tag is lowercased, as ren-dom's createElement does). */
const PRIMITIVES = new Set(['View', 'Layout', 'Scroll', 'Label', 'Edit', 'Action', 'Image', 'Shape']);

/** The tags and primitives a `<label for>` can name (an input unless hidden). */
const LABELABLE = new Set(['input', 'select', 'textarea', 'button', 'meter', 'output', 'progress', 'Edit', 'Action']);

/**
 * Whether an enumerated attribute's value is `word`: compared ASCII
 * case-insensitively, as a browser compares one (type="PASSWORD" is a
 * password, scope="ROW" a row, aria-hidden="TRUE" hides).
 * @param {unknown} value @param {string} word
 */
const is = (value, word) => value != null && String(value).replace(/[A-Z]+/g, c => c.toLowerCase()) === word;

/** @param {Item} item */
const labelable = item => LABELABLE.has(item.type) && !(item.type === 'input' && is(item.props?.type, 'hidden'));

/** A name source's value, or undefined when absent or blank (the accessible name skips a blank one). @param {unknown} v */
const given = v => (v == null || (typeof v === 'string' && v.trim() === '') ? undefined : v);

/** Whether a select takes many options, as its DOM property reads the prop ren-dom sets: truthy. @param {Record<string, unknown>} p */
const many = p => !!p.multiple;

/**
 * The select an option belongs to, as Chrome's select reads it: its nearest
 * select ancestor, through any element but an option or a datalist, and
 * through one optgroup at most (an option in a nested optgroup is no
 * select's).
 * @param {Item} option @returns {Item | null}
 */
const selectOf = option => {
  let grouped = false;
  for (let up = option.parent; up !== null; up = up.parent) {
    if (up.type === 'select') return up;
    if (up.type === 'option' || up.type === 'datalist' || up.type === 'hr') return null;
    if (up.type === 'optgroup') {
      if (grouped) return null;
      grouped = true;
    }
  }
  return null;
};

/** An option's value: its value, else its text with whitespace collapsed, as its DOM property reads. @param {Item} option */
const optionValue = option => {
  const v = option.props === null ? undefined : live(option.props, 'value');
  return v == null ? textual(option).replace(/[\t\n\f\r ]+/g, ' ').trim() : String(v);
};

/**
 * A select's options, in tree order: its descendants whose select it is
 * (see selectOf), through divs and one optgroup.
 * @param {Item} select
 */
const optionsIn = select => {
  /** @type {Item[]} */
  const out = [];
  /** @param {Item} at @param {boolean} grouped */
  const walk = (at, grouped) => {
    for (let c = firstOf(at); c !== null; c = c.next) {
      if (c.k !== 0) continue;
      if (c.type === 'option') out.push(c);
      else if (c.type === 'optgroup') {
        if (!grouped) walk(c, true);
      } else if (c.type !== 'select' && c.type !== 'datalist' && c.type !== 'hr' && !TEXTUAL.has(c.type)) walk(c, grouped);
    }
  };
  walk(select, false);
  return out;
};

/** Whether an option is selected itself (its selected, or its defaultSelected when that is absent). @param {Item} option */
const selfSelected = option => option.props !== null && !!live(option.props, 'selected');

/**
 * The options a select shows selected, as a browser's select does once
 * ren-dom has set its value and inserted its options: its value's first
 * match ('' too), then each option after it selected itself; with no value,
 * or a value no option has, the options selected themselves (a multiple
 * select given a value no option has keeps the first). A single select shows
 * the last of them. None when no option is: the first option a browser
 * shows by itself carries no data.
 * @param {Item} select @returns {Set<Item>}
 */
const picks = select => {
  const list = optionsIn(select);
  const p = select.props ?? {};
  const v = live(p, 'value');
  const at = v == null ? -1 : list.findIndex(o => optionValue(o) === String(v));
  let on = at >= 0 ? [list[at], ...list.slice(at + 1).filter(selfSelected)] : list.filter(selfSelected);
  if (at < 0 && v != null && many(p)) on = on.slice(0, 1);
  return new Set(many(p) ? on : on.slice(-1));
};

/** An element's next or previous sibling element (text and markers skipped). @param {Item} item @param {'next' | 'prev'} way */
const beside = (item, way) => {
  let at = item[way];
  while (at !== null && at.k !== 0) at = at[way];
  return at;
};

/** A data cell with content: a td holding anything. @param {Item | null} cell */
const filled = cell => cell !== null && cell.type === 'td' && cell.first !== null;

/**
 * A th's role: its scope's (row or rowgroup a row header, col or colgroup a
 * column header), else as Chrome reads its row: a column header alone in
 * its row or between headers; a row header next to a data cell with
 * content, or in a row whose first or last cell (or second, or second to
 * last: a corner cell may be empty) is one; else a column header.
 * @param {Record<string, unknown>} p @param {Item} th
 */
const headerRole = (p, th) => {
  if (is(p.scope, 'row') || is(p.scope, 'rowgroup')) return 'rowheader';
  if (is(p.scope, 'col') || is(p.scope, 'colgroup')) return 'columnheader';
  const next = beside(th, 'next');
  const prev = beside(th, 'prev');
  if (next === null && prev === null) return 'columnheader';
  if (next?.type === 'th' && prev?.type === 'th') return 'columnheader';
  if (filled(next) || filled(prev)) return 'rowheader';
  const row = th.parent;
  if (row === null || row.type !== 'tr') return 'columnheader';
  let first = row.first;
  while (first !== null && first.k !== 0) first = first.next;
  let last = row.last;
  while (last !== null && last.k !== 0) last = last.prev;
  if (filled(first) || filled(last)) return 'rowheader';
  if ((first !== null && filled(beside(first, 'next'))) || (last !== null && filled(beside(last, 'prev')))) return 'rowheader';
  return 'columnheader';
};

/** The roles an element takes only when named (see Names.authored), as Chrome reads them: else the next token counts. */
const NAMED_ONLY = new Set(['region', 'form']);

/**
 * An element's own role: the first token of its `role` that is a WAI-ARIA
 * role (`region` and `form` only on a named element), lowercased, if any.
 * @param {Item} item @param {Names} names
 */
const ownRole = (item, names) => {
  const own = item.props?.role;
  return typeof own === 'string' ? tokens(lower(own)).find(t => ariaRole(t) && (!NAMED_ONLY.has(t) || names.authored(item))) : undefined;
};

/**
 * The roles that make a header, footer or aside a section's, as Chrome reads
 * its ancestors' roles (main too for a header or footer): a section with no
 * role token counts by its tag, named or not.
 */
const SECTIONING_ROLES = new Set(['article', 'complementary', 'navigation']);

/**
 * Whether an element is inside an element whose role is a sectioning one
 * (see SECTIONING_ROLES), or a main when `main`: by the role it has, so a
 * role token overrides its tag (a section with role none is none).
 * @param {Item} item @param {boolean} main @param {Names} names
 */
const sectioned = (item, main, names) => {
  for (let up = item.parent; up !== null; up = up.parent) {
    if (up.k !== 0) continue;
    if (up.type === 'section' && ownRole(up, names) === undefined) return true;
    const role = roleOf(up, names);
    if (role !== null && (SECTIONING_ROLES.has(role) || (main && role === 'main'))) return true;
  }
  return false;
};

/** A select's size as its attribute is parsed (a non-negative integer, 0 when not one). @param {Record<string, unknown>} p */
const sizeOf = p => {
  const m = /^[\t\n\f\r ]*\+?([0-9]+)/.exec(p.size == null ? '' : String(p.size));
  return m === null ? 0 : Number(m[1]);
};

/** The input types a datalist makes a combobox: the text fields that take a list. */
const LISTED = new Set(['text', 'search', 'tel', 'url', 'email', 'number']);

/** A td's role: a gridcell in a grid or treegrid, else a cell. @param {Item} td @param {Names} names */
const cellRole = (td, names) => {
  for (let up = td.parent; up !== null; up = up.parent) {
    if (up.k !== 0) continue;
    const role = ownRole(up, names);
    if (role === 'grid' || role === 'treegrid') return 'gridcell';
    if (role === 'table' || (role === undefined && up.type === 'table')) return 'cell';
  }
  return 'cell';
};

/**
 * The role a tag has by itself (a table with no prototype: a tag named
 * constructor or hasOwnProperty is any tag), as Chrome's accessibility tree
 * gives it (test/roles.test.jsx): some by their context, or their author
 * name (`named`: a section's or an aside's).
 * @type {Record<string, string | ((p: Record<string, unknown>, named: boolean, item: Item, names: Names) => string | null)>}
 */
const IMPLICIT = {
  Action: 'button', Edit: 'textbox', Image: 'img',
  a: p => (p.href != null ? 'link' : null), area: p => (p.href != null ? 'link' : null), article: 'article', blockquote: 'blockquote',
  // An aside in a section's content is no landmark, unless named; a header or footer there (or in main) is the section's.
  aside: (_, named, item, names) => (named || !sectioned(item, false, names) ? 'complementary' : null),
  header: (_, _named, item, names) => (sectioned(item, true, names) ? 'sectionheader' : 'banner'),
  footer: (_, _named, item, names) => (sectioned(item, true, names) ? 'sectionfooter' : 'contentinfo'),
  button: 'button', caption: 'caption', code: 'code', dd: 'definition', details: 'group', dialog: 'dialog', dl: 'list',
  dt: 'term', fieldset: 'group', figcaption: 'caption', figure: 'figure', form: 'form',
  h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading',
  // An img with an empty alt is presentation, unless it has a name of its own.
  img: (p, _, item, names) => (p.alt === '' && names.aria(item) === undefined && given(p.title) === undefined ? null : 'img'),
  li: 'listitem', main: 'main', menu: 'list', meter: 'meter', nav: 'navigation', ol: 'list',
  option: 'option', optgroup: 'group', output: 'status', p: 'paragraph', progress: 'progressbar', search: 'search',
  section: (_, named) => (named ? 'region' : null),
  select: p => (many(p) || sizeOf(p) > 1 ? 'listbox' : 'combobox'), summary: 'button', table: 'table',
  td: (_, _named, item, names) => cellRole(item, names),
  textarea: 'textbox', th: (p, _, item) => headerRole(p, item), time: 'time', tr: 'row', ul: 'list',
  input: (p, _, item, names) => {
    const type = lower(String(p.type ?? 'text'));
    // A text field whose list names a datalist is a combobox.
    if (typeof p.list === 'string' && names.ids.get(p.list)?.type === 'datalist' && (LISTED.has(type) || INPUT[type] === undefined)) return 'combobox';
    return INPUT[type] ?? 'textbox';
  },
};
Object.setPrototypeOf(IMPLICIT, null);

/** An input's role by its type (no prototype, as IMPLICIT). @type {Record<string, string>} */
const INPUT = {
  checkbox: 'checkbox', radio: 'radio', range: 'slider', number: 'spinbutton', search: 'searchbox',
  button: 'button', submit: 'button', reset: 'button', image: 'button', file: 'button', hidden: '',
};
Object.setPrototypeOf(INPUT, null);

/**
 * `aria-*` states and constraints read as fields, by the field's name. The
 * others are dropped: `aria-haspopup`, `aria-activedescendant`, references
 * (`aria-describedby`, `aria-controls`, `aria-owns`; `aria-labelledby` names
 * the node), live regions (`aria-live`, `aria-atomic`, `aria-relevant`,
 * `aria-busy`) and positions (`aria-posinset`, `aria-setsize`, the row and
 * column indexes and counts).
 */
const ARIA = new Map([
  ['level', 'level'], ['checked', 'checked'], ['selected', 'selected'], ['pressed', 'pressed'], ['expanded', 'expanded'],
  ['current', 'current'], ['disabled', 'disabled'], ['invalid', 'invalid'], ['required', 'required'], ['readonly', 'readonly'],
  ['valuenow', 'value'], ['valuemin', 'min'], ['valuemax', 'max'], ['valuetext', 'valueText'], ['sort', 'sort'],
  ['placeholder', 'placeholder'], ['description', 'description'], ['roledescription', 'roleDescription'],
  ['multiselectable', 'multiselectable'],
]);

/** States kept only when set: false says nothing. */
const FLAGS = new Set(['disabled', 'invalid', 'required', 'readonly', 'current', 'multiselectable']);

/** A node of the tree: an element, a text or a marker. */
class Item {
  /** @param {number} k 0 element, 1 text, 2 marker @param {string} type */
  constructor(k, type) {
    this.k = k;
    this.type = type;
    /** The kept props, made on the first one. @type {Record<string, unknown> | null} */
    this.props = null;
    /** @type {Item | null} */ this.parent = null;
    /** @type {Item | null} */ this.first = null;
    /** @type {Item | null} */ this.last = null;
    /** @type {Item | null} */ this.prev = null;
    /** @type {Item | null} */ this.next = null;
  }
}

/**
 * A plain copy of a prop value: functions out, objects and arrays copied
 * (so the JSON does not share the view's objects). A value with `toJSON` is
 * what it returns, as in JSON.stringify (a Date its ISO string); a Map is
 * its entries, an array of `[key, value]` pairs; a Set its values, an array;
 * a BigInt its decimal digits, a string (JSON has no BigInt).
 * @param {unknown} value @returns {unknown}
 */
function plain(value) {
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (typeof value === 'bigint') return String(value);
  if (value === null || typeof value !== 'object') return value;
  const any = /** @type {any} */ (value);
  if (typeof any.toJSON === 'function') return plain(any.toJSON());
  if (Array.isArray(value)) return value.map(v => plain(v));
  if (value instanceof Map) return Array.from(value, ([k, v]) => [plain(k), plain(v)]);
  if (value instanceof Set) return Array.from(value, v => plain(v));
  /** @type {Record<string, unknown>} */
  const out = Object.create(null);
  // Its own enumerable keys, as JSON.stringify reads them: an inherited one is not the value's.
  for (const key of Object.keys(value)) {
    const v = plain(/** @type {any} */ (value)[key]);
    if (v !== undefined) out[key] = v;
  }
  return own(out);
}

/** The aria attributes whose word is a number. */
const NUMERIC = new Set(['level', 'valuenow', 'valuemin', 'valuemax']);
/** The aria states whose 'true' and 'false' are booleans ('mixed', 'page' stay words). */
const STATES = new Set(['checked', 'selected', 'pressed', 'expanded', 'current', 'disabled', 'invalid', 'required', 'readonly', 'multiselectable']);

/**
 * An aria attribute's word as a value: a number for a level or range value,
 * a boolean for a state's 'true' or 'false'; any other word as written.
 * @param {string} name the attribute without `aria-` @param {unknown} v
 */
function word(name, v) {
  if (typeof v !== 'string') return v;
  if (NUMERIC.has(name)) {
    const n = Number(v);
    return v.trim() !== '' && Number.isFinite(n) ? n : v;
  }
  // An enumerated word, ASCII case-insensitive: TRUE is true, MIXED is mixed.
  if (STATES.has(name) || name === 'sort') {
    const w = lower(v);
    return w === 'true' ? true : w === 'false' ? false : w;
  }
  return v;
}

/**
 * A number prop as ren-dom's double property takes it (Number's rules, as
 * the DOM converts: true is 1, false 0, a blank string 0), else undefined.
 * @param {unknown} v
 */
const finite = v => {
  const n = typeof v === 'number' ? v : typeof v === 'string' || typeof v === 'boolean' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/**
 * A progress's or meter's value, as its DOM property reads it (the HTML
 * standard's getters): a progress's in [0, max], its max 1 unless above 0; a
 * meter's in [min, max], min 0 and max 1 by default, a max below min being
 * min. A value that is no number stays the word written.
 * @param {Item} item @param {Record<string, unknown>} p
 */
function rangeValue(item, p) {
  const v = finite(p.value);
  if (v === undefined) return word('valuenow', p.value);
  if (item.type === 'progress') {
    const max = finite(p.max);
    const top = max !== undefined && max > 0 ? max : 1;
    return Math.min(Math.max(v, 0), top);
  }
  const min = finite(p.min) ?? 0;
  const max = Math.max(finite(p.max) ?? 1, min);
  return Math.min(Math.max(v, min), max);
}

/** An aria true/false state (aria-hidden) that is on: true or 'true', any case; an empty value is not set, as ARIA reads it. @param {unknown} v */
const on = v => v === true || is(v, 'true');

/** A boolean attribute ren-dom writes (itemscope): there by its presence, whatever its value, unless false or null removed it. @param {unknown} v */
const present = v => v !== undefined && v !== null && v !== false;

/**
 * A boolean prop ren-dom sets as a DOM property (disabled, required,
 * readOnly, a primitive's invalid and secret): nothing when not given, else
 * its truth, as the property reads it ("false" is true, "" false).
 * @param {unknown} v @returns {boolean | undefined}
 */
const flag = v => (v === undefined ? undefined : !!v);

/** Whitespace as one space. @param {string} s */
const squash = s => s.replace(/\s+/g, ' ');

/** A primitive's own text: a Label's or an Action's `text`. @param {Item} item */
const ownText = item => {
  const p = item.props;
  if (p === null || (item.type !== 'Label' && item.type !== 'Action')) return '';
  return p.text == null ? '' : String(p.text);
};

/**
 * The text an element shows, flattened. `direct` reads the element even when
 * hidden, as the accessible name reads a node aria-labelledby names; its
 * descendants follow the usual rules.
 * @param {Item} item @param {Names} names @param {boolean} [direct] @returns {string}
 */
function textOf(item, names, direct = false) {
  if (item.k === 1) return hidden(item) ? '' : item.type;
  if (item.k === 2 || (!direct && hidden(item))) return '';
  // A drawing or a rule shows no text unless it is marked, as `walk` keeps it.
  if (EMPTY.has(item.type) && roleOf(item, names) === null) return '';
  if (TEXTUAL.has(item.type)) return squash(textual(item)).trim();
  let out = ownText(item);
  for (let c = firstOf(item); c !== null; c = c.next) out += (c.k === 0 && !INLINE.has(c.type) && out !== '' ? ' ' : '') + textOf(c, names);
  return squash(out).trim();
}

/**
 * Whether the page shows nothing of `item` (an element or a text), as
 * Chrome's accessibility tree ignores it: `hidden` and `inert` (truthy,
 * as the DOM properties read them), `aria-hidden`, a hidden input, `display: none` in its
 * style, a `dialog` not open, a `datalist` (its options are a field's
 * suggestions, never shown in the page), what a closed `details` holds but
 * its summary, and a `video`'s or an `audio`'s fallback content.
 * @param {Item} item
 */
const hidden = item => {
  const up = item.parent;
  if (up !== null && up.k === 0 && concealed(up, item)) return true;
  if (item.k !== 0) return false;
  const p = item.props;
  if (item.type === 'datalist' || (item.type === 'dialog' && !(p !== null && !!p.open))) return true;
  // `hidden` hides when truthy, as the DOM property does; `aria-hidden` reads its word.
  return p !== null && (!!p.hidden || !!p.inert || p['#none'] === true || on(p['aria-hidden']) || (item.type === 'input' && is(p.type, 'hidden')));
};

/** Whether `parent` shows no `child`: a closed details shows only its summary; a video or an audio none of its fallback. @param {Item} parent @param {Item} child */
const concealed = (parent, child) => parent.type === 'video' || parent.type === 'audio' || (parent.type === 'details' && !opened(parent) && child !== summaryOf(parent));

/** Whether a details is open: its `open`, unless an open one of its name came first (see shutIn). @param {Item} details */
const opened = details => details.props !== null && !!details.props.open && !shut.has(details);

/** The open details the tree being read (`data`) closes by name: shutIn's, for that read. @type {Set<Item>} */
let shut = new Set();

/**
 * The open details of a name (not empty, its text as ren-dom sets the
 * property) that the page closes, as a browser keeps one of a name open in
 * a tree: the first in the order the page makes them, each child before
 * its parent, stays open. The data reads the view as it is, not the order
 * a later open or an insertion came in (test/details.test.jsx lists those).
 * @param {Item} container @returns {Set<Item>}
 */
function shutIn(container) {
  /** @type {Set<Item>} */
  const out = new Set();
  /** @type {Set<string>} */
  const named = new Set();
  /** @param {Item} item */
  const visit = item => {
    for (let c = firstOf(item); c !== null; c = c.next) if (c.k === 0) visit(c);
    const p = item.props;
    if (item.type !== 'details' || p === null || !p.open || p.name == null || typeof p.name === 'function') return;
    const name = String(p.name);
    if (name === '') return;
    if (named.has(name)) out.add(item);
    else named.add(name);
  };
  visit(container);
  return out;
}

/** A details' summary: its first summary child. @param {Item} details */
const summaryOf = details => {
  for (let c = details.first; c !== null; c = c.next) if (c.k === 0 && c.type === 'summary') return c;
  return null;
};

/** The words a `display` value is made of: any other makes the declaration invalid, and the browser drops it. */
const DISPLAYS = new Set([
  'none', 'contents', 'block', 'inline', 'run-in', 'flow', 'flow-root', 'table', 'flex', 'grid', 'ruby', 'math', 'list-item',
  'inline-block', 'inline-table', 'inline-flex', 'inline-grid', 'table-row-group', 'table-header-group', 'table-footer-group',
  'table-row', 'table-cell', 'table-column-group', 'table-column', 'table-caption', 'ruby-base', 'ruby-text', 'ruby-base-container',
  'ruby-text-container', '-webkit-box', '-webkit-inline-box', 'inherit', 'initial', 'unset', 'revert', 'revert-layer',
]);

/**
 * A style text's declarations, as CSS splits them: at each `;` outside a
 * string, a comment or a bracket (a `;` inside `"a;b"` is the string's).
 * Comments are left out.
 * @param {string} text @returns {string[]}
 */
function declarations(text) {
  /** @type {string[]} */
  const out = [];
  let at = '';
  let quote = '';
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote !== '') {
      at += c;
      if (c === '\\' && i + 1 < text.length) at += text[++i];
      else if (c === quote) quote = '';
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 1;
    } else if (c === '"' || c === "'") {
      quote = c;
      at += c;
    } else if (c === ';' && depth === 0) {
      out.push(at);
      at = '';
    } else {
      if (c === '(' || c === '[' || c === '{') depth++;
      else if ((c === ')' || c === ']' || c === '}') && depth > 0) depth--;
      at += c;
    }
  }
  out.push(at);
  return out;
}

/**
 * Whether a style ren-dom writes hides its element (`display: none`): an
 * object's `display`, set as a property (`none` in any ASCII case), or a
 * text's declarations as a browser's CSS parser reads them: the last valid
 * `display` wins, but an `!important` one over those without.
 * @param {unknown} style @returns {boolean}
 */
function displayNone(style) {
  if (style !== null && typeof style === 'object') {
    const v = /** @type {Record<string, unknown>} */ (style).display;
    return typeof v === 'string' && lower(v.trim()) === 'none';
  }
  if (typeof style !== 'string') return false;
  let none = false;
  let important = false;
  for (const declaration of declarations(style)) {
    const colon = declaration.indexOf(':');
    if (colon < 0 || lower(declaration.slice(0, colon).trim()) !== 'display') continue;
    let value = declaration.slice(colon + 1).trim();
    const bang = /!\s*important$/i.exec(value);
    if (bang !== null) value = value.slice(0, bang.index).trim();
    const words = value.split(/\s+/).map(lower);
    if (value === '' || !words.every(w => DISPLAYS.has(w))) continue;
    if (important && bang === null) continue;
    important = bang !== null;
    none = words.length === 1 && words[0] === 'none';
  }
  return none;
}

/** The element's role, or null for a wrapper. @param {Item} item @param {Names} names @returns {string | null} */
function roleOf(item, names) {
  const p = item.props ?? {};
  // As a browser reads the attribute: its first token that is a WAI-ARIA role (the rest are fallbacks), compared in ASCII lowercase,
  // a region or form only when named; a none role dissolves, and with no role token the element keeps its own.
  const token = ownRole(item, names);
  if (token !== undefined) return NONE.has(token) ? null : token;
  const implicit = IMPLICIT[item.type];
  // A section is a region and an aside in a section a landmark only when named (see Names.authored); a
  // wrapper is a group of its own only with an author name (aria-*) that resolves.
  if (typeof implicit === 'function') return implicit(p, (item.type === 'section' || item.type === 'aside') && names.authored(item), item, names) || null;
  if (implicit != null) return implicit;
  return names.aria(item) !== undefined ? 'group' : null;
}

/**
 * Text flowing into the content of the node being made: inline pieces join,
 * a block boundary ends a string.
 */
class Flow {
  constructor() {
    /** @type {Json[]} */ this.out = [];
    this.run = '';
  }

  /** @param {string} s */
  inline(s) {
    this.run += s;
  }

  block() {
    const s = squash(this.run).trim();
    if (s !== '') this.out.push(s);
    this.run = '';
  }

  /** @param {Json} node */
  node(node) {
    this.block();
    this.out.push(node);
  }

  end() {
    this.block();
    return this.out;
  }
}

/**
 * What the output knows of the whole tree: the names given to elements by
 * `aria-labelledby`, `aria-label`, `<label for>` and a primitive's `label`.
 * A `<label for>` naming a field it can name (LABELABLE) then has no text of
 * its own (a field inside it still shows); a node that
 * `aria-labelledby` names stays in the output as it is.
 *
 * One rule decides a name: each source counts only when it resolves to text
 * that is not blank, else the next one is read (`aria`, then `name`).
 */
class Names {
  /** @param {Item} root */
  constructor(root) {
    /** @type {Map<string, Item>} */ this.ids = new Map();
    /** @type {Map<Item, string>} */ this.labels = new Map(); // the text of the <label for>s naming each field, joined
    /** @type {Set<Item>} */ this.used = new Set();
    /** @type {Set<Item>} */ this.refs = new Set(); // the itemrefs being walked now
    /** @type {Map<Item, string | undefined>} */ this.named = new Map(); // author names read, outside a traversal
    /** @type {Map<Item, Set<Item>>} */ this.picks = new Map(); // the options each select shows selected
    /** @type {Set<Item> | null} */ this.overruled = null; // the checked radios a later one in their group unchecks
    this.root = root;
    this.depth = 0; // the aria-labelledby traversals open now
    /** @type {Item[]} */ const fors = [];
    this.scan(root, fors);
    // Each label's text once every id is known (the text reads roles, and a role may read a name).
    for (const label of fors) {
      const field = this.ids.get(/** @type {string} */ (/** @type {any} */ (label.props).for));
      // A label names its field, and stands for nothing of its own, only when that field exists and a label can name it.
      if (field === undefined || !labelable(field)) continue;
      // A label the page hides (itself or by an ancestor) names nothing.
      if (!shown(label)) continue;
      this.used.add(label);
      const text = given(textOf(label, this));
      // Every label naming the field adds its text, in document order.
      if (text === undefined) continue;
      const had = this.labels.get(field);
      this.labels.set(field, had === undefined ? /** @type {string} */ (text) : `${had} ${text}`);
    }
  }

  /** @param {Item} item @param {Item[]} fors */
  scan(item, fors) {
    for (let c = firstOf(item); c !== null; c = c.next) {
      if (c.k !== 0) continue;
      const p = c.props;
      // An empty id or for names nothing, and a duplicate id names its first element, as in the DOM.
      if (p !== null && typeof p.id === 'string' && p.id !== '' && !this.ids.has(p.id)) this.ids.set(p.id, c);
      if (c.type === 'label' && p !== null && typeof p.for === 'string' && p.for !== '') fors.push(c);
      if (!TEXTUAL.has(c.type)) this.scan(c, fors);
    }
  }

  /**
   * The name its author gave an element: the text of the nodes its
   * `aria-labelledby` names, else its `aria-label`; undefined when neither
   * resolves to text. aria-labelledby is followed one level only, as the
   * accessible name does: a node it names gives its own `aria-label`, else
   * its text; inside a traversal a node has only its `aria-label` (it
   * decides its role), so a cycle or a
   * chain ends there. Only names read outside a traversal are kept.
   * @param {Item} item @returns {string | undefined}
   */
  aria(item) {
    const p = item.props;
    if (p === null || (p['aria-labelledby'] == null && p['aria-label'] == null)) return undefined;
    if (this.depth > 0) return /** @type {string | undefined} */ (given(p['aria-label']));
    if (this.named.has(item)) return this.named.get(item);
    const by = p['aria-labelledby'];
    this.depth++;
    let text;
    try {
      text = typeof by === 'string' ? tokens(by).map(id => this.ids.get(id)).filter(x => x !== undefined).map(x => /** @type {string | undefined} */ (given(x?.props?.['aria-label'])) ?? textOf(/** @type {Item} */ (x), this, true)).join(' ').trim() : '';
    } finally {
      this.depth--;
    }
    const name = text !== '' ? text : /** @type {string | undefined} */ (given(p['aria-label']));
    this.named.set(item, name);
    return name;
  }

  /**
   * Whether its author named an element, as Chrome counts a section's or an
   * aside's name, or a region's or a form's: a name (see name; a
   * primitive's `label` is its aria-label), a `title` not blank, or an
   * `aria-labelledby` naming an element there is, even an empty one.
   * @param {Item} item
   */
  authored(item) {
    const p = item.props;
    if (p === null) return false;
    if (this.name(item) !== undefined || given(p.title) !== undefined) return true;
    const by = p['aria-labelledby'];
    return typeof by === 'string' && tokens(by).some(id => this.ids.has(id));
  }

  /**
   * An element's accessible name: its author name, else the text of the
   * `<label for>` naming it, else its primitive's `label` (an Image's is its
   * `alt`), an option's or an optgroup's; undefined when none resolves to
   * text. On another tag `label` is an inert attribute that names nothing.
   * @param {Item} item
   */
  name(item) {
    const labelled = (PRIMITIVES.has(item.type) && item.type !== 'Image') || item.type === 'option' || item.type === 'optgroup';
    return this.aria(item) ?? this.labels.get(item) ?? (labelled ? given(item.props?.label) : undefined);
  }

  /**
   * Whether a radio checked itself is unchecked by its group, as a browser's
   * radio is: a checked radio of its name (not empty, compared exactly) and
   * form owner joins the group after it. Radios join in tree order, as a page
   * inserts them (Chrome's, recorded in test/fixtures/radio.json), but a
   * radio in its form owner is in that form's group before the rest, and a
   * radio whose `form` names a form after it joins when that form comes.
   * Once per render.
   * @param {Item} item
   */
  overruledRadio(item) {
    if (this.overruled === null) {
      /** @type {Set<Item>} */
      const overruled = (this.overruled = new Set());
      /** @type {Map<Item, number>} each element's place in tree order */
      const place = new Map();
      /** @type {Item[]} */
      const checked = [];
      /** @param {Item} at */
      const scan = at => {
        for (let c = firstOf(at); c !== null; c = c.next) {
          if (c.k !== 0) continue;
          place.set(c, place.size);
          const p = c.props;
          // A name's attribute is its text, as ren-dom's property writes it (name={7} is "7").
          if (c.type === 'input' && p !== null && is(p.type, 'radio') && live(p, 'checked') === true && p.name != null && String(p.name) !== '') checked.push(c);
          if (!TEXTUAL.has(c.type)) scan(c);
        }
      };
      scan(this.root);
      /** @type {Map<Item | null, Map<string, [number, number, Item]>>} the last to join each group: when, its place, the radio */
      const last = new Map();
      for (const c of checked) {
        const name = String(/** @type {any} */ (c.props).name);
        const owner = this.formOf(c);
        const here = /** @type {number} */ (place.get(c));
        let around = null;
        for (let up = c.parent; up !== null && around === null; up = up.parent) if (up.type === 'form') around = up;
        const at = owner === null ? here : /** @type {number} */ (place.get(owner));
        const when = owner !== null && owner === around ? -1 : Math.max(at, here);
        let names = last.get(owner);
        if (names === undefined) last.set(owner, (names = new Map()));
        const had = names.get(name);
        if (had !== undefined && (had[0] > when || (had[0] === when && had[1] > here))) overruled.add(c);
        else {
          if (had !== undefined) overruled.add(had[2]);
          names.set(name, [when, here, c]);
        }
      }
    }
    return this.overruled.has(item);
  }

  /**
   * A form control's form owner: the form its `form` names (none when that
   * is no form), else its nearest form. The attribute is its text, as
   * ren-dom writes it (form={7} is "7", true is empty, false none).
   * @param {Item} item
   */
  formOf(item) {
    const id = item.props?.form;
    if (id != null && id !== false) {
      const form = this.ids.get(id === true ? '' : String(id));
      return form?.type === 'form' ? form : null;
    }
    for (let up = item.parent; up !== null; up = up.parent) if (up.type === 'form') return up;
    return null;
  }

  /** The options a select shows selected (see picks), once per render. @param {Item} select */
  picked(select) {
    let set = this.picks.get(select);
    if (set === undefined) this.picks.set(select, (set = picks(select)));
    return set;
  }
}

/**
 * The fields of a node: its states, name, link and value, from the kept
 * props.
 * @param {Item} item @param {string} role @param {Names} names
 */
function fields(item, role, names) {
  const p = item.props ?? {};
  /** @type {Record<string, unknown>} */
  const out = {};
  const put = (/** @type {string} */ key, /** @type {unknown} */ value) => {
    const v = plain(value);
    if (v === undefined || v === null || v === '') return;
    if (FLAGS.has(key) && v === false) return;
    out[key] = v;
  };
  const level = /^h([1-6])$/.exec(item.type);
  if (level) put('level', Number(level[1]));
  for (const name in p) {
    if (!name.startsWith('aria-')) continue;
    const key = ARIA.get(name.slice(5));
    if (key !== undefined) put(key, word(name.slice(5), p[name]));
  }
  put('label', names.name(item));
  if (role === 'link' || p.href != null) put('href', p.href);
  if (item.type === 'Image') {
    put('src', p.source);
    put('alt', p.alt ?? p.label);
  } else {
    put('src', p.src);
    put('alt', p.alt);
  }
  put('title', p.title);
  put('datetime', p.datetime);
  put('name', p.name);
  // A password's value never leaves the view.
  const secret = flag(p.secret) === true || is(p.type, 'password');
  // A progress or meter value is a number in its range, as its DOM value is.
  const range = item.type === 'meter' || item.type === 'progress';
  if (!secret && out.value === undefined && (item.type === 'Edit' || item.type === 'input' || item.type === 'textarea' || item.type === 'select' || range || item.type === 'option' || item.type === 'data' || item.type === 'output')) put('value', range ? rangeValue(item, p) : live(p, 'value'));
  if (p.placeholder !== undefined && p.placeholder !== out.label) put('placeholder', p.placeholder);
  // An Action's selected is aria-pressed, as the renderers write it, when it has no role; with one, the
  // application states it (aria-selected, aria-checked, aria-current) and selected adds nothing.
  const action = item.type === 'Action';
  if (action && p.selected !== undefined && p.role == null && out.pressed === undefined) put('pressed', !!p.selected);
  // An option of a select is selected as the select shows it, whatever its own selected says.
  const select = item.type === 'option' ? selectOf(item) : null;
  if (select !== null && out.selected === undefined && names.picked(select).has(item)) put('selected', true);
  // A radio a later checked one of its group unchecks is unchecked, as the page shows it.
  if (item.type === 'input' && out.checked === undefined && live(p, 'checked') === true && names.overruledRadio(item)) put('checked', false);
  for (const key of /** @type {const} */ (['checked', 'selected'])) if (live(p, key) !== undefined && out[key] === undefined && !(action && key === 'selected') && !(select !== null && key === 'selected')) put(key, !!live(p, key));
  put('disabled', flag(p.disabled));
  put('invalid', flag(p.invalid));
  put('required', flag(p.required));
  put('readonly', flag(p.readonly));
  // A select that takes many options is a listbox that says so, as its aria-multiselectable would.
  if (item.type === 'select' && many(p) && out.multiselectable === undefined) put('multiselectable', true);
  return out;
}

/**
 * The value an `itemprop` holds (microdata's rules): its `content`, the
 * item it starts, its link, source (an object's data), time or value, else
 * its text.
 * @param {Item} item @param {Names} names
 */
function valueOf(item, names) {
  const p = item.props ?? {};
  if (p.content !== undefined) return plain(p.content);
  if (present(p.itemscope)) return itemOf(item, names).item;
  if (p.href != null) return plain(p.href);
  if (item.type === 'Image') return plain(p.source);
  // An object's is its data URL, as microdata reads it (as given: no base URL here, as for href and src).
  if (item.type === 'object' && p.data != null) return plain(p.data);
  if (p.src != null) return plain(p.src);
  if (p.datetime != null) return plain(p.datetime);
  if (live(p, 'value') !== undefined && flag(p.secret) !== true && !is(p.type, 'password')) return plain(live(p, 'value'));
  return textOf(item, names);
}

/**
 * An item: the values its `itemprop`s hold, JSON-LD shaped, and what else
 * its content shows.
 * @param {Item} item @param {Names} names
 */
function itemOf(item, names) {
  const p = item.props ?? {};
  /** @type {Record<string, unknown>} */
  const data = Object.create(null);
  if (typeof p.itemtype === 'string' && p.itemtype !== '') data['@type'] = p.itemtype.replace(/^https?:\/\/schema\.org\//, '');
  const flow = new Flow();
  walkChildren(item, flow, names, data);
  // Properties outside it: the elements its `itemref` names by id, and what they hold (they show where they are).
  // A ref being walked already, or one holding the item, would walk it again: a cycle, walked once.
  // A ref inside the item was walked with its content already.
  if (typeof p.itemref === 'string')
    for (const id of tokens(p.itemref)) {
      const ref = id === '' ? undefined : names.ids.get(id);
      // A ref the page does not show (hidden, or under a hidden ancestor) gives nothing.
      if (ref === undefined || !shown(ref) || names.refs.has(ref) || holds(ref, item) || holds(item, ref)) continue;
      names.refs.add(ref);
      walk(ref, new Flow(), names, data);
      names.refs.delete(ref);
    }
  return { item: own(data), rest: flow.end() };
}

/**
 * A plain object of a record built on `Object.create(null)`, each key its
 * own data property, so a key named `__proto__` is kept.
 * @param {Record<string, unknown>} record
 */
function own(record) {
  return Object.fromEntries(Object.entries(record));
}

/** Whether the page shows `item`: neither it nor an ancestor is hidden. @param {Item} item */
function shown(item) {
  /** @type {Item | null} */ let at = item;
  for (; at !== null; at = at.parent) if (at.k === 0 && hidden(at)) return false;
  return true;
}

/** True when `item` is `outer` or inside it. @param {Item} outer @param {Item} item */
function holds(outer, item) {
  /** @type {Item | null} */ let at = item;
  for (; at !== null; at = at.parent) if (at === outer) return true;
  return false;
}

/** Roles of a table's cells, and of the tables records are made of. */
const CELLS = new Set(['cell', 'gridcell', 'columnheader', 'rowheader']);
const TABLES = new Set(['table', 'grid', 'treegrid']);

/**
 * The elements of `role` inside `item`, through wrappers and row groups (a
 * boxless row, a tbody), not inside a nested table or another `stop` role,
 * nor hidden. @param {Item} item @param {Set<string>} roles @param {Item[]} out @param {Names} names
 */
function find(item, roles, out, names) {
  for (let c = firstOf(item); c !== null; c = c.next) {
    if (c.k !== 0 || hidden(c)) continue;
    const role = roleOf(c, names);
    if (role !== null && roles.has(role)) out.push(c);
    else if ((role === null || role === 'rowgroup') && !TEXTUAL.has(c.type)) find(c, roles, out, names);
  }
  return out;
}

/** True when `item` holds a row (then it is part of a table's records). @param {Item} item @param {Names} names */
const holdsRow = (item, names) => item.k === 0 && (roleOf(item, names) === 'row' || find(item, ROW, [], names).length > 0);
const ROW = new Set(['row']);

/**
 * A cell's value: its one string or node, its list of them, or null when
 * empty; a cell with fields of its own (a day's `datetime`, `selected`,
 * `current`, a label) is them with its content: `{ datetime, selected,
 * text }` (or `children`).
 * @param {Item} cell @param {Names} names
 */
function cellOf(cell, names) {
  const flow = new Flow();
  flow.inline(ownText(cell));
  walkChildren(cell, flow, names, null);
  const list = flow.end();
  const own = fields(cell, /** @type {string} */ (roleOf(cell, names)), names);
  if (Object.keys(own).length > 0) {
    content(own, list);
    return own;
  }
  return list.length === 0 ? null : list.length === 1 ? list[0] : list;
}

/** Distinct non-empty names. @param {string[]} keys */
const distinct = keys => keys.every(k => k !== '') && new Set(keys).size === keys.length;

/**
 * A table's records, when its headers name them (else null, and it is rows
 * of cells as any node):
 * - a first row of column headers only: `columns` (their texts) and `rows`,
 *   a record per row after it keyed by the columns (null where a cell is
 *   empty or missing);
 * - those, and one row header per row after it, in one column: `rows` is
 *   an object keyed by the row headers, each a record of the other columns;
 * - no column headers, one row header per row and cells after it: `rows`
 *   is an object keyed by the row headers, each its one cell's value (or
 *   its cells' values, a list).
 * Headers must be distinct and not empty.
 * @param {Item} table @param {Names} names
 * @returns {{ columns?: string[], rows: unknown } | null}
 */
function records(table, names) {
  const rows = find(table, ROW, [], names);
  if (rows.length === 0) return null;
  const cells = rows.map(row => find(row, CELLS, [], names));
  const roles = cells.map(list => list.map(c => roleOf(c, names)));
  const top = roles[0].length > 0 && roles[0].every(r => r === 'columnheader');
  const body = top ? cells.slice(1) : cells;
  const bodyRoles = top ? roles.slice(1) : roles;
  // The column of the row headers (-1: none), the same in every row: one each, or none at all.
  let at = -2;
  for (const list of bodyRoles) {
    const here = list.indexOf('rowheader');
    if (here >= 0 && list.lastIndexOf('rowheader') !== here) return null;
    if (at === -2) at = here;
    else if (here !== at) return null;
  }
  if (at === -2) at = -1;
  if (bodyRoles.some(r => r.includes('columnheader'))) return null;
  if (top) {
    const columns = cells[0].map(c => textOf(c, names));
    const keyed = at >= 0 && body.length > 0;
    if (!distinct(columns.filter((_, j) => !keyed || j !== at))) return null;
    if (body.some(list => list.length > columns.length)) return null;
    const record = (/** @type {Item[]} */ list) => {
      /** @type {Record<string, unknown>} */
      const out = Object.create(null);
      for (let j = 0; j < columns.length; j++) if (!keyed || j !== at) out[columns[j]] = j < list.length ? cellOf(list[j], names) : null;
      return own(out);
    };
    if (!keyed) return { columns, rows: body.map(record) };
    const heads = body.map(list => textOf(list[at], names));
    if (!distinct(heads)) return null;
    /** @type {Record<string, unknown>} */
    const out = Object.create(null);
    body.forEach((list, i) => (out[heads[i]] = record(list)));
    return { columns: columns.filter((_, j) => j !== at), rows: own(out) };
  }
  if (at < 0 || body.some(list => list.length < 2)) return null;
  const heads = body.map(list => textOf(list[at], names));
  if (!distinct(heads)) return null;
  /** @type {Record<string, unknown>} */
  const out = Object.create(null);
  body.forEach((list, i) => {
    const values = list.filter((_, j) => j !== at).map(cell => cellOf(cell, names));
    out[heads[i]] = values.length === 1 ? values[0] : values;
  });
  return { rows: own(out) };
}

/**
 * Puts an element's data into the flow of the node around it.
 * @param {Item} item @param {Flow} flow @param {Names} names @param {Record<string, unknown> | null} scope the item its itemprops fill
 */
function walk(item, flow, names, scope) {
  if (item.k === 1) return hidden(item) ? undefined : void flow.inline(item.type);
  if (item.k === 2 || hidden(item)) return;
  if (names.used.has(item)) {
    // A used label's text is its field's name; what else it holds (the field itself, inside it) still shows.
    const inner = new Flow();
    walkChildren(item, inner, names, scope);
    for (const node of inner.end()) if (typeof node !== 'string') flow.node(node);
    return;
  }
  if (item.type === 'br') return void flow.block();
  const p = item.props;
  const prop = p !== null && typeof p.itemprop === 'string' ? p.itemprop : null;
  if (prop !== null && scope !== null) {
    const value = valueOf(item, names);
    if (value === undefined || value === '') return;
    // Each name it lists holds the value; a name held twice holds them all.
    for (const key of tokens(prop)) {
      if (key === '') continue;
      const had = scope[key];
      scope[key] = had === undefined ? value : Array.isArray(had) ? [...had, value] : [had, value];
    }
    return;
  }
  // A drawing or a rule means nothing unless it is marked (a Shape with `role="img"` and a label).
  if (EMPTY.has(item.type) && roleOf(item, names) === null) return;
  const role = roleOf(item, names);
  if (p !== null && present(p.itemscope)) {
    const { item: data, rest } = itemOf(item, names);
    /** @type {Record<string, unknown>} */
    const node = role === null ? {} : { role, ...fields(item, role, names) };
    node.item = data;
    content(node, rest);
    return void flow.node(/** @type {Json} */ (node));
  }
  const table = role !== null && TABLES.has(role) ? records(item, names) : null;
  if (role !== null && table !== null) {
    // Its records, and what else it shows (a caption) as its content.
    const inner = new Flow();
    for (let c = firstOf(item); c !== null; c = c.next) if (!holdsRow(c, names)) walk(c, inner, names, scope);
    const node = { role, ...fields(item, role, names), ...table };
    content(node, inner.end());
    return void flow.node(/** @type {Json} */ (node));
  }
  if (role !== null) {
    const inner = new Flow();
    inner.inline(ownText(item));
    walkChildren(item, inner, names, scope);
    const node = { role, ...fields(item, role, names) };
    content(node, inner.end());
    // A role with nothing in it and nothing about it says nothing (a list whose items went into an item).
    if (Object.keys(node).length === 1) return;
    return void flow.node(/** @type {Json} */ (node));
  }
  // A wrapper: its content runs on in the text around it (an inline tag) or
  // stands as blocks of its own (a View, a Label, a div).
  const inline = INLINE.has(item.type);
  if (!inline) flow.block();
  flow.inline(ownText(item));
  walkChildren(item, flow, names, scope);
  if (!inline) flow.block();
}

/** @param {Item} item @param {Flow} flow @param {Names} names @param {Record<string, unknown> | null} scope */
function walkChildren(item, flow, names, scope) {
  // A textarea's, title's, xmp's or plaintext's content is its text: the elements put in it are no nodes.
  if (TEXTUAL.has(item.type)) return void flow.inline(textual(item));
  for (let c = firstOf(item); c !== null; c = c.next) walk(c, flow, names, scope);
}

/** A node's content: one string is its `text`, more are its `children`. @param {Record<string, unknown>} node @param {Json[]} list */
function content(node, list) {
  if (list.length === 1 && typeof list[0] === 'string') node.text = list[0];
  else if (list.length > 0) node.children = list;
}

/** The data of a container's content. @param {Item} container @returns {Json[]} */
function data(container) {
  const flow = new Flow();
  shut = shutIn(container);
  try {
    walkChildren(container, flow, new Names(container), null);
  } finally {
    shut = new Set();
  }
  return flow.end();
}

/**
 * The JSON Host, for `mount` or an application root's `renderer`, for a
 * root that stays alive: `json()` reads its data at any time, and
 * `changed(nodes)` gets it after every flush round, the view's or a nested
 * root's, whether or not anything changed (the last call holds the current
 * view). `nest` lets a `<Root>` nested in the view render in it.
 * @param {{ changed?: (nodes: Json[]) => void }} [options]
 * @returns {Host & { container: Item | null, json: () => Json[] }}
 */
export function $tree(options = {}) {
  const changed = options.changed;
  const layer = new Item(0, '#layer');
  /** @type {any} */
  const H = {
    kind: 'json',
    container: null,
    // A tag as ren-dom makes it: lowercased (INPUT is input), but for the primitives (Edit, Label).
    element: (/** @type {string} */ tag) => new Item(0, PRIMITIVES.has(tag) ? tag : lower(tag)),
    text: (/** @type {string} */ text) => new Item(1, text),
    content(/** @type {Item} */ node, /** @type {string} */ text) {
      node.type = text;
    },
    set(/** @type {Item} */ node, /** @type {string} */ name, /** @type {unknown} */ value) {
      // A Label's styled runs are its text, joined: the styles are presentation.
      if (name === 'runs') {
        if (node.type !== 'Label') return;
        name = 'text';
        value = Array.isArray(value) ? value.map(run => (run == null || run.text == null ? '' : String(run.text))).join('') : undefined;
      }
      // A prop's name as ren-dom writes it: a DOM property's (readOnly) or an attribute's, which HTML
      // lowercases (TYPE is type, HIDDEN hidden, ARIA-HIDDEN aria-hidden); the primitives' own are lowercase.
      const given = name;
      // A style is presentation, but for display: none, which hides the element (a primitive's portable style has none).
      if (lower(given) === 'style') {
        if (PRIMITIVES.has(node.type)) return;
        // Another spelling (STYLE) is the attribute: its value as text.
        if (displayNone(given === 'style' || value == null || typeof value === 'function' ? value : String(value))) (node.props ??= {})['#none'] = true;
        else if (node.props !== null) delete node.props['#none'];
        return;
      }
      // Content props replace the element's children with their text, as ren-dom's write does: textContent
      // and innerText on any element, text on an a, option, title or script (elsewhere an inert attribute).
      // null empties the first two, as ren-dom does; a text of null writes nothing.
      // So do a textarea's defaultValue and an output's value and defaultValue, which set its text (null empties it).
      const content =
        (given === 'defaultValue' && (node.type === 'textarea' || node.type === 'output')) || (given === 'value' && node.type === 'output');
      if (!PRIMITIVES.has(node.type) && (content || given === 'textContent' || given === 'innerText' || (given === 'text' && TEXT_OWNERS.has(node.type)))) {
        if (given === 'text' && value == null) return;
        if (typeof value === 'function') return;
        while (node.first !== null) H.remove(node, node.first);
        const text = value == null ? '' : String(value);
        // innerText's line breaks are <br>s, as ren-dom's and ren-html's writes make them.
        (given === 'innerText' ? text.split(/\r\n|\r|\n/) : [text]).forEach((line, i) => {
          if (i > 0) H.insert(node, new Item(0, 'br'), null);
          if (line !== '') H.insert(node, new Item(1, line), null);
        });
        return;
      }
      // The URL parts of an a or area edit an absolute href, as ren-dom's and ren-html's writes do; with a
      // relative or no href (no base URL here) they write nothing. The data holds the URL the page holds.
      if (URL_PARTS.has(given) && (node.type === 'a' || node.type === 'area')) {
        const href = node.props?.href;
        // An href given as an object (a URL) is its string, as ren-dom writes it.
        if (value == null || typeof value === 'function' || href == null || typeof href === 'function') return;
        let url;
        try {
          url = new URL(String(href));
        } catch {
          return;
        }
        /** @type {any} */ (url)[given] = String(value);
        // An edit that makes it javascript: drops it, as ren-dom does.
        if (scripted(url.href)) {
          if (node.props !== null) delete node.props.href;
        } else node.props = { ...node.props, href: url.href };
        return;
      }
      // An input's valueAsNumber and valueAsDate write its value, as ren-dom's and ren-html's writes do, and
      // throw where a browser does (a password never takes one). A null valueAsNumber writes nothing; a null
      // valueAsDate empties the value.
      if ((given === 'valueAsNumber' || given === 'valueAsDate') && node.type === 'input') {
        if (typeof value === 'function' || (given === 'valueAsNumber' && value == null)) return;
        const type = lower(String(node.props?.type ?? ''));
        const text = given === 'valueAsNumber' ? numberValue(type, value) : dateValue(type, value === undefined ? null : value);
        if (text === '') {
          if (node.props !== null) delete node.props.value;
        } else (node.props ??= {}).value = text;
        return;
      }
      // A textarea's value of null is '', dirty, as ren-dom sets it: its children no longer show.
      if (given === 'value' && node.type === 'textarea' && value == null) value = '';
      const fallback = DEFAULTS[name];
      if (fallback !== undefined && fallback[1].includes(node.type)) name = fallback[0];
      else {
        name = REFLECTS[name] ?? (ARIA_STRINGS.has(name) ? `aria-${lower(name.slice(4))}` : lower(name));
        if (!kept(name)) return;
      }
      // A boolean spelled otherwise than its DOM property (HIDDEN, CHECKED, readonly) is no property: ren-dom writes
      // the attribute, removed for false, and its presence counts whatever its value (HIDDEN="" hides).
      const property = BOOLEANS[name];
      if (property !== undefined && given !== property && !PRIMITIVES.has(node.type) && value !== undefined && value !== null && typeof value !== 'function') value = value === false ? undefined : true;
      // An id, or a prop naming ids, is read by the text ren-dom writes: id and htmlFor as DOM properties
      // (id={7} is "7", true "true"), the rest as attributes (aria-labelledby={true} is "true", for={true}
      // empty, false none), so an id given as a number names what its text names.
      if (IDS.has(name) && value !== undefined && value !== null && typeof value !== 'function') {
        if (given === 'id' || given === 'htmlFor' || (typeof value === 'boolean' && given.startsWith('aria-'))) value = String(value);
        else value = value === false ? undefined : value === true ? '' : String(value);
      }
      // A javascript: URL is never written (ren-dom drops it): the page holds none.
      if (value === undefined || value === null || typeof value === 'function' || (LINKS.has(name) && value !== false && scripted(value))) {
        if (node.props !== null) delete node.props[name];
        return;
      }
      (node.props ??= {})[name] = value;
    },
    // Handlers are not data: nothing listens in a JSON render.
    listen: () => () => {},
    insert(/** @type {Item} */ parent, /** @type {Item} */ child, /** @type {Item | null} */ before) {
      if (child.parent !== null) H.remove(child.parent, child);
      child.parent = parent;
      child.next = before;
      child.prev = before === null ? parent.last : before.prev;
      if (child.prev === null) parent.first = child;
      else child.prev.next = child;
      if (before === null) parent.last = child;
      else before.prev = child;
    },
    remove(/** @type {Item} */ parent, /** @type {Item} */ child) {
      if (child.prev === null) parent.first = child.next;
      else child.prev.next = child.next;
      if (child.next === null) parent.last = child.prev;
      else child.next.prev = child.prev;
      child.parent = child.prev = child.next = null;
    },
    marker: () => new Item(2, ''),
    parent: (/** @type {Item} */ node) => node.parent,
    next: (/** @type {Item} */ node) => node.next,
    owns: (/** @type {unknown} */ value) => value instanceof Item,
    layer: () => H.container ?? layer,
    open(/** @type {Item | null} */ element) {
      return (H.container = element ?? new Item(0, '#root'));
    },
    close() {},
    nest: () => $tree(changed === undefined ? {} : { changed: () => changed(H.json()) }),
    json: () => (H.container === null ? [] : data(H.container)),
  };
  if (changed !== undefined) H.present = () => changed(H.json());
  return H;
}

/**
 * @typedef {object} Options
 * @property {string=} id The root's id (`page`).
 * @property {any=} props What the view reads with `$lookup(Props)`.
 * @property {[any, any][]=} provide Contexts passed in, as `Root`'s `provide`.
 * @property {number=} timeout Milliseconds to wait for tasks to settle (10,000; 0 waits forever).
 */

/**
 * Renders `view` once and returns its data, after its tasks settled.
 * @param {any} view a component, an element, or a function returning one
 * @param {Options} [options]
 * @returns {Promise<Json[]>}
 */
export async function $json(view, options = {}) {
  const host = $tree();
  const root = Root({
    id: options.id ?? 'page',
    // A root of its own even when called from a running view (a handler): no target.
    target: null,
    renderer: host,
    storage: null,
    locks: null,
    props: options.props,
    provide: options.provide,
    retire: false,
    sweep: false,
    children: view,
  });
  try {
    await $settle(root, { timeout: options.timeout });
    return data(/** @type {Item} */ (host.container));
  } finally {
    $dispose(root);
  }
}
