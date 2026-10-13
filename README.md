# ren-json

A view rendered once to data, for servers, APIs and native clients:

```js
import { $json } from 'ren-json';

const nodes = await $json(() => <Profile />, { props: { id } });
response.end(JSON.stringify(nodes));
```

There is no hydration, and no visual tree: the JSON is what the view
means, for AI agents, tools, APIs and native clients to read without a
parser and without guessing the data from the layout.

Meaning is marked with standard vocabularies (ren-core's `Meaning` props):
- **Roles make nodes.** An element with an ARIA `role` (its first token that
  is a WAI-ARIA role, as a browser reads it; the rest are fallbacks; `region`
  and `form` count only on a named element, as Chrome reads them), or a tag with a role
  of its own (`h1`–`h6` a heading, `ul` a list, `li` a listitem, `a[href]` and
  `area[href]` a link, `p` a paragraph, a table's rows and cells, form fields; `Action` a
  button, `Edit` a textbox, `Image` an img), is a node. A tag's role is the
  one Chrome's accessibility tree gives it (checked against its recording,
  `test/fixtures/roles.json`), where ARIA has one: a `header` or `footer`
  inside an element whose role is `article`, `complementary`, `main` or
  `navigation` (by its tag or its role token: an `article`, an `aside`
  that is a landmark, `main`, `nav`), or a `section` with no role token,
  is a `sectionheader` or `sectionfooter`, not a `banner` or
  `contentinfo` (the ancestor's role counts, not its tag: a `section` with
  role `none` is none); an `aside` inside one of those but `main` is no
  landmark unless named; a
  `pre` is a wrapper, a `code` a `code`; an `img` with an empty `alt` and
  no name is presentation; a `select` with `multiple` or a `size` above 1
  is a `listbox`; a text field whose `list` names a `datalist` a
  `combobox`, a file input a `button`; a `td` in a `grid` or `treegrid` a
  `gridcell`. It is a node:
  `{ role, ...fields, text }` or `{ role, ...fields, children }`. Its
  fields are its states and values: `level`, `label` (the first of
  `aria-labelledby`, `aria-label`, a `<label for>` (of a field: an input,
  `select`, `textarea`, `button`, `meter`, `output`, `progress`, `Edit`,
  `Action`; else the label is text) and a primitive's, an `option`'s or an
  `optgroup`'s `label` (an `optgroup` is a `group` of its options)
  (on any other tag an inert attribute that names nothing) that resolves to
  text not blank), `href`,
  `src`, `alt`, `value`, `checked` (a checked radio is unchecked, `false`,
  by a later checked one of its group: its `name` and form owner, as a
  browser's radios; a radio whose `form` names a form after it counts as
  after that form's own radios, as Chrome joins it to the group), `selected` (the options a select
  shows selected, as a browser does once ren-dom renders it: its `value`'s
  first match, `''` too, by its value or else its text, then each option
  after it selected itself; with no match, the options selected themselves;
  one only in a single select, the last; none for the first option a
  browser shows by itself; a select's options are the ones Chrome's select
  counts, in a `div` too but not in an optgroup's optgroup), `pressed`, `expanded`,
  `current`, `disabled`, `invalid`, `required`, `readonly`, `multiselectable`
  (a `select multiple` too), `min`, `max`,
  `valueText`, `sort`, `roleDescription`, `description`, `placeholder`,
  `title`, `name`, `datetime` (the `aria-*` states read as their names,
  `aria-valuenow` as `value`; an `Action`'s `selected` is `pressed` when it
  has no `role`, as the renderers write it, and says nothing when it has one,
  whose state the application gives as `aria-selected`, `aria-checked` or
  `aria-current`).
- **Microdata makes items.** `itemscope` starts an item and each `itemprop`
  inside it holds a value (its `content`, its link, source (an `object`'s
  `data`), time or value, else its text; a nested item is an object; a name held twice holds an
  array). The node is `{ role?, item: { '@type': 'Product', name, price } }`
  (JSON-LD shaped), with `children` for what else it shows. `itemref`
  names, by `id`, elements outside the item whose `itemprop`s (their own,
  or those inside them) are its fields too; they still show where they are.
- **Tables whose headers name their data give records.** A `table` (or
  `grid`, `treegrid`) whose rows (`row`, through wrappers and row groups:
  a boxless `display: 'contents'` row, a `tbody`) hold cells (`cell`,
  `gridcell`, `columnheader`, `rowheader`; a `th` is a row header with
  `scope="row"` or `"rowgroup"`, a column header with `"col"` or
  `"colgroup"`, and without a scope as Chrome reads its row: a row header
  next to a data cell with content, or in a row whose first or last cell
  (or second, or second to last) is one, else a column header):
  - a first row of column headers only: `{ role: 'table', columns: ['Name',
    'Age'], rows: [{ Name: 'Ada', Age: '36' }, …] }`, a record per row
    after it, keyed by the columns in their order; an empty or missing cell
    is `null`, and a cell holding a node (a link) or more is that node or
    their list; a cell with fields of its own (a calendar day's
    `datetime`, `selected`, `current`, a `label`) is them with its
    content, `{ selected: true, current: 'date', datetime: '2026-09-28',
    text: '28' }` (`children` for more than a string), a cell of text alone
    a plain string; a row's own fields are not in its record;
  - those and one row header per row, in one column: `rows` is an object
    keyed by the row headers, each a record of the other columns:
    `{ columns: ['Q1', 'Q2'], rows: { Revenue: { Q1: '10', Q2: '12' } } }`
    (the corner header may be empty);
  - no column headers, one row header per row, cells after it: `rows` is an
    object keyed by the row headers, each its cell's value, or its cells'
    list: `{ rows: { Name: 'Ada', Born: ['1990', 'Porto'] } }`.

  Headers must be distinct and not empty; any other table is rows of cells
  as any node (`children` of `row` nodes). What else the table shows (a
  caption) is its `text` or `children`. Cell values are the text shown,
  as everywhere (no number guessed from '36'). A table with no caption,
  header, summary or role is a table too, its rows and cells kept, where
  Chrome guesses it only lays out (its own LayoutTable role): the data
  does not guess.
- **The rest dissolves.** A wrapper (View, Layout, Scroll, `div`, `section`
  without a name, any element whose role is `presentation`, `none` or
  `generic`) gives its
  content to the nearest node that means something; a name is an
  `aria-labelledby` or `aria-label` that resolves to text not blank (a
  named `section` is a `region`, another named wrapper a `group`); a
  `section` or an `aside` is named by a `title` not blank too, or by an
  `aria-labelledby` naming an element there is, even an empty one, as
  Chrome counts it. Inline text joins into
  one string (`<p>Hello <b>big</b> world</p>` is `Hello big world`); each
  block of text (a Label, a `div`) is a string of its own. One string is a
  node's `text`, more are its `children`.
- **Dropped:** styles, classes, layout and sizes, colors, the text direction
  (`dir`, which Chrome's accessibility tree does not carry), handlers, refs and
  `data-*` hooks; hidden content, what Chrome's accessibility tree ignores
  (`hidden`, `aria-hidden`, an `inert` region, a hidden input, `display: none` in an
  element's style, as a browser's CSS parser reads a style text: the last
  valid `display`, an `!important` one over the rest; a `dialog` not
  `open`; what a closed `details` holds but its first `summary`, and of the
  open details of a `name` in a tree only the first the page makes (each
  child before its parent) stays open, as a browser keeps one; a
  `datalist`, whose options are a field's suggestions; a `video`'s or an
  `audio`'s fallback content), its text and elements by every route but
  `aria-labelledby`, which names by hidden text as the accessible name does
  (an element in a `select` that is not an option stays, as Chrome keeps
  it in its tree);
  what the page never holds as shown elements: anything inside a void element
  (an `input`'s or `img`'s children), a `template`'s content, and a
  `script`'s, `style`'s, `iframe`'s, `noembed`'s, `noframes`'s or
  `noscript`'s, by any route (a role, text, an id `aria-labelledby` or a
  `<label for>` names, an `itemref`); an id inside a `textarea`, `title`,
  `xmp` or `plaintext`, whose content is its own text;
  drawings (`Shape`, `svg`, `canvas`) and rules unless a role marks them;
  a node with a role and nothing else; a password's value; a `javascript:`
  URL (an `href`, `src` or `data`, given so or made by a URL part), which
  ren-dom never writes, so the page holds none; the ARIA
  attributes that are not data: `aria-haspopup`, `aria-activedescendant`,
  references (`aria-describedby`, `aria-controls`, `aria-owns`; `aria-labelledby`
  gives the `label`), live regions (`aria-live`, `aria-atomic`, `aria-relevant`,
  `aria-busy`) and positions (`aria-posinset`, `aria-setsize`, row and column
  indexes and counts).
- **Values:** plain copies. A value with `toJSON` is what it returns, as
  in `JSON.stringify` (a `Date` its ISO string); a `Map` is an array of
  `[key, value]` pairs; a `Set` an array of its values; a `BigInt` its
  decimal digits, a string (JSON has none); functions are left out.
  Aria words read as values: an aria state's `"true"` and `"false"` as
  booleans, a numeric `aria-level`, `aria-valuenow`, `aria-valuemin` or
  `aria-valuemax` as a number, and a `progress` or `meter` value too,
  in its range, as its DOM property is. A `disabled`, `required` or `readOnly` prop on a form
  control, and an `Edit`'s `invalid` or `secret`, is what ren-dom sets there,
  a DOM property: true for any value but an empty one (`"false"` is true,
  `""` false), so a `secret="false"` field's value never leaves (ren-json
  reads the same rule on any other element, where ren-dom writes an
  attribute instead); every other word stays the
  string written (a `value` of `"02134"`, an `aria-label` of `"42"`).

```js
// <View role="article" itemscope itemtype="Product" style={…}>
//   <Label itemprop="name" text="Desk lamp" /> <Label itemprop="price" content={25} text="$25.00" />
//   <Label role="link" href="/lamp" text="Details" />
// </View>
[{ role: 'article', item: { '@type': 'Product', name: 'Desk lamp', price: 25 },
   children: [{ role: 'link', href: '/lamp', text: 'Details' }] }]
```

Props hold the values the view resolved once its tasks settled, a nested
`<Root>`'s included. `$json` waits for them with ren-core's `$settle`
(Pending and Recover show their final content; a nested root's failure
rejects as the view's own), returns the root's top-level nodes and disposes the root.
Options: `id`, `props`, `provide` (as `Root`'s) and `timeout` (10,000 ms;
0 waits forever). `$tree(options)` is the Host itself, for a root that stays
alive: `host.json()` reads its data at any time, and `changed(nodes)` (an
option) gets it after every flush round, the view's or a nested root's,
whether or not anything changed (the last call holds the current view), for
a server that pushes a live view's data to its clients.

Its one dependency is ren-core (install rrx-core and ren-core first). Node
22.15 or later. Tests: `npm test` runs `test/json.test.jsx` (roles, dissolved
wrappers, inline and block text, microdata items and `itemref`, tables as
records, field names and values,
what stays hidden, a Label's runs, async lists, nested roots, failures, time-outs, a
live `$tree` root, dates, maps and sets) in both JSX passes,
`test/select.test.jsx` (the options marked selected against Chrome's
select, `test/fixtures/select.json`, ren-html's recording),
`test/radio.test.jsx` (the radios marked checked against Chrome's,
`test/fixtures/radio.json`, ren-html's recording),
`test/details.test.jsx` (the details whose content shows, against those
Chrome leaves open, `test/fixtures/details.json`, ren-html's recording; its
KNOWN list holds a details opened, or come in, before the open one of its
name, which the data, reading the view as it is, cannot order),
`test/roles.test.jsx` (the roles tags have by themselves, in the contexts
that change them, against Chrome's accessibility tree,
`test/fixtures/roles.json`, recorded by ren-html's `scripts/roles-oracle.mjs`
from `test/fixtures/roles-view.jsx`, with what the page does not show, which
Chrome ignores; its KNOWN list holds the differences
made on purpose: a `summary` a button, a `dl` a list, a `figcaption` a
caption, a colour or date input a textbox, where Chrome has roles of its own
ARIA does not; and a `table` with no caption, header, summary or role, which
Chrome guesses is a layout table, stays a table of rows and cells, so its
data is kept),
`test/forms.test.js` (the standard's 18 void elements, and `src/forms.js`
against `test/fixtures/forms.js`, a table ren-html shares), `test/exports.test.js` (the export lock), `test/timers.test.js` (the timers
guard) and `test/types/json.tsx` (the
declarations, through `tsc`).
