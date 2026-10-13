// ren-json: one render to the view's data, after its tasks settle: what it
// means, marked by roles and microdata, not how it is laid out.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Root, $read, $effect, $pending, $task, $active, $lookup, $context, $signal, $write, $dispose, For, Show, Pending, Recover, View, Label, Action, Edit, Image, Shape, Props } from 'ren-core';
import { $json, $tree } from 'ren-json';

const Theme = $context('light');

function Page() {
  const users = $task($active(), () => 1, (_, complete) => void setTimeout(() => complete({ ok: true, value: ['Ada', 'Grace'] }), 5)); // timer: feature: the task stands for slow I/O
  const count = $signal($active(), 1);
  $write(count, 2);
  return (
    <View gap={8}>
      <Label text={() => `hello ${$lookup(Props).name}`} />
      <Action text="Save" onPress={() => {}} />
      <p class="note" style={{ color: 'red' }} ref={() => {}} data-kind="counter" title="Counter">
        count {count} in {() => $lookup(Theme)}
      </p>
      <hr style={{ margin: 4 }} />
      <a href="/next" class="link" tabindex={0}>next</a>
      <Show when={() => false} fallback={<i>hidden</i>}>
        <b>never</b>
      </Show>
      <Recover fallback={() => <p>failed</p>}>
        <Pending fallback={<p>loading</p>}>
          <ul>
            <For each={() => $read(users)}>{name => <li>{name}</li>}</For>
          </ul>
        </Pending>
      </Recover>
    </View>
  );
}

describe('ren-json', () => {
  it('renders what the view means after its tasks settle: no styles, classes, layout, handlers or hooks', async () => {
    const nodes = await $json(() => <Page />, { props: { name: 'server' }, provide: /** @type {any} */ ([[Theme, 'dark']]) });
    assert.deepEqual(nodes, [
      'hello server',
      { role: 'button', text: 'Save' },
      { role: 'paragraph', title: 'Counter', text: 'count 2 in dark' },
      { role: 'link', href: '/next', text: 'next' },
      'hidden',
      { role: 'list', children: [{ role: 'listitem', text: 'Ada' }, { role: 'listitem', text: 'Grace' }] },
    ]);
    assert.doesNotThrow(() => JSON.stringify(nodes));
  });

  it("leaves a primitive's dir out, as Chrome's accessibility tree does: the text keeps its order", async () => {
    const nodes = await $json(() => (
      <View dir="rtl" role="paragraph">
        <Label dir="auto" text={'שלום'} />
        <Action dir="ltr" text="ok" />
      </View>
    ));
    assert.deepEqual(nodes, [{ role: 'paragraph', children: ['שלום', { role: 'button', text: 'ok' }] }]);
  });

  it('dissolves the visual hierarchy: wrappers give their content to the node that means something', async () => {
    const card = (/** @type {string} */ name, /** @type {string} */ mail) => (
      <View style={{ padding: 8, borderRadius: 4 }}>
        <View layout="row" gap={4}>
          <Shape shapes={[{ kind: 'oval', fill: '#f00' }]} />
          <View>
            <Label text={name} style={{ fontWeight: 700 }} />
            <Label text={mail} />
          </View>
        </View>
      </View>
    );
    const nodes = await $json(() => (
      <View>
        <View pad={16}>
          <Label role="heading" aria-level={1} text="People" />
        </View>
        <View role="list">
          <View role="listitem">{card('Ada', 'ada@mail.example')}</View>
          <View role="listitem">{card('Grace', 'grace@mail.example')}</View>
        </View>
      </View>
    ));
    assert.deepEqual(nodes, [
      { role: 'heading', level: 1, text: 'People' },
      { role: 'list', children: [{ role: 'listitem', children: ['Ada', 'ada@mail.example'] }, { role: 'listitem', children: ['Grace', 'grace@mail.example'] }] },
    ]);
  });

  it('joins inline text, and keeps each block of text a string of its own', async () => {
    const nodes = await $json(() => (
      <div>
        <p>
          Hello <b>big</b> <span class="x">world</span>!
        </p>
        <div>one</div>
        <div>two<br />three</div>
      </div>
    ));
    assert.deepEqual(nodes, [{ role: 'paragraph', text: 'Hello big world!' }, 'one', 'two', 'three']);
  });

  it('gives the microdata of an item as its data, JSON-LD shaped, with what else it shows', async () => {
    const nodes = await $json(() => (
      <View role="article" itemscope itemtype="https://schema.org/Product" style={{ padding: 12 }}>
        <Label itemprop="name" text="Desk lamp" style={{ fontSize: 20 }} />
        <View layout="row">
          <Label itemprop="price" content={25} text="$25.00" />
          <Label itemprop="priceCurrency" content="USD" text="" />
        </View>
        <Image itemprop="image" source="/lamp.png" label="The lamp" />
        <View itemprop="brand" itemscope itemtype="Brand">
          <Label itemprop="name" text="Lumen" />
        </View>
        <Label itemprop="keywords" text="light" />
        <Label itemprop="keywords" text="desk" />
        <Label role="link" href="/lamp" text="Details" />
        <Label text="Ships tomorrow" />
      </View>
    ));
    assert.deepEqual(nodes, [
      {
        role: 'article',
        item: {
          '@type': 'Product',
          name: 'Desk lamp',
          price: 25,
          priceCurrency: 'USD',
          image: '/lamp.png',
          brand: { '@type': 'Brand', name: 'Lumen' },
          keywords: ['light', 'desk'],
        },
        children: [{ role: 'link', href: '/lamp', text: 'Details' }, 'Ships tomorrow'],
      },
    ]);
  });

  it('gives an item the properties its itemref names by id, which still show where they are', async () => {
    const nodes = await $json(() => (
      <View>
        <View itemscope itemtype="Person" itemref="mail missing">
          <Label itemprop="name" text="Ada" />
        </View>
        <View id="mail">
          <Label itemprop="email" text="ada@example.com" />
          <Label itemprop="telephone" text="555" />
        </View>
        <Label id="born" itemprop="birthDate" datetime="1990-04-17" text="17 Apr 1990" />
        <View itemscope itemtype="Event" itemref="born"><Label itemprop="name" text="Birth" /></View>
      </View>
    ));
    assert.deepEqual(nodes, [
      { item: { '@type': 'Person', name: 'Ada', email: 'ada@example.com', telephone: '555' } },
      'ada@example.com',
      '555',
      '17 Apr 1990',
      { item: { '@type': 'Event', name: 'Birth', birthDate: '1990-04-17' } },
    ]);
  });

  it('walks an itemref cycle once: a ref that holds the item or is being walked is skipped', async () => {
    const inside = await $json(() => (
      <div id="a">
        <div itemscope itemref="a"><span itemprop="n">x</span></div>
      </div>
    ));
    assert.deepEqual(inside, [{ item: { n: 'x' } }]);
    const mutual = await $json(() => (
      <View>
        <View id="p" itemscope itemtype="Person" itemref="q"><Label itemprop="name" text="Ada" /></View>
        <View id="q" itemprop="knows" itemscope itemtype="Person" itemref="p"><Label itemprop="name" text="Grace" /></View>
      </View>
    ));
    assert.equal(mutual.length, 2);
    assert.deepEqual(mutual[0], { item: { '@type': 'Person', name: 'Ada', knows: { '@type': 'Person', name: 'Grace' } } });
  });

  it('reads an object\'s itemprop as its data URL, as microdata does', async () => {
    const nodes = await $json(() => (
      <div itemscope itemtype="Product">
        <object itemprop="manual" data="https://example.com/lamp.pdf">The manual</object>
        <object itemprop="leaflet" data="/leaflet.pdf" type="application/pdf">Leaflet</object>
      </div>
    ));
    assert.deepEqual(nodes, [{ item: { '@type': 'Product', manual: 'https://example.com/lamp.pdf', leaflet: '/leaflet.pdf' } }]);
  });

  it('walks an itemref naming an element inside the item once', async () => {
    const nodes = await $json(() => (
      <div itemscope itemtype="Thing" itemref="a"><span id="a" itemprop="name">x</span></div>
    ));
    assert.deepEqual(nodes, [{ item: { '@type': 'Thing', name: 'x' } }]);
  });

  it('leaves the text of a drawing, style or script out of names and header keys', async () => {
    const nodes = await $json(() => (
      <View>
        <table>
          <tr><th>Name<svg><title>sort</title></svg></th></tr>
          <tr><td>Ada</td></tr>
        </table>
        <label for="q">Query<style>{'.x{}'}</style></label>
        <input id="q" value="v" />
      </View>
    ));
    assert.deepEqual(nodes, [
      { role: 'table', columns: ['Name'], rows: [{ Name: 'Ada' }] },
      { role: 'textbox', label: 'Query', value: 'v' },
    ]);
  });

  it('gives a table whose first row is column headers as records keyed by them', async () => {
    const people = [['Ada', '36'], ['Grace', '']];
    const nodes = await $json(() => (
      <View>
        <View role="table" aria-label="People" style={{ display: 'grid', columns: '1fr 1fr' }}>
          <View role="row" style={{ display: 'contents' }}>
            <Label role="columnheader" text="Name" />
            <Label role="columnheader" text="Age" />
          </View>
          {people.map(([name, age]) => (
            <View role="row" style={{ display: 'contents' }}>
              <Label role="cell" text={name} />
              <Label role="cell" text={age} />
            </View>
          ))}
        </View>
        <table>
          <caption>Links</caption>
          <thead><tr><th>Site</th><th>Where</th></tr></thead>
          <tbody>
            <tr><td>Home</td><td><a href="/">start</a></td></tr>
            <tr><td>Short</td></tr>
          </tbody>
        </table>
      </View>
    ));
    assert.deepEqual(nodes, [
      { role: 'table', label: 'People', columns: ['Name', 'Age'], rows: [{ Name: 'Ada', Age: '36' }, { Name: 'Grace', Age: null }] },
      {
        role: 'table',
        columns: ['Site', 'Where'],
        rows: [{ Site: 'Home', Where: { role: 'link', href: '/', text: 'start' } }, { Site: 'Short', Where: null }],
        children: [{ role: 'caption', text: 'Links' }],
      },
    ]);
  });

  it('keys a table by its row headers: records of the other columns, or each row header\'s value', async () => {
    const nodes = await $json(() => (
      <View>
        <table>
          <tr><th></th><th>Q1</th><th>Q2</th></tr>
          <tr><th scope="row">Revenue</th><td>10</td><td>12</td></tr>
          <tr><th scope="row">Cost</th><td>7</td><td>8</td></tr>
        </table>
        <View role="table">
          <View role="row"><Label role="rowheader" text="Name" /><Label role="cell" text="Ada" /></View>
          <View role="row"><Label role="rowheader" text="Born" /><Label role="cell" text="1990" /><Label role="cell" text="Porto" /></View>
        </View>
      </View>
    ));
    assert.deepEqual(nodes, [
      { role: 'table', columns: ['Q1', 'Q2'], rows: { Revenue: { Q1: '10', Q2: '12' }, Cost: { Q1: '7', Q2: '8' } } },
      { role: 'table', rows: { Name: 'Ada', Born: ['1990', 'Porto'] } },
    ]);
  });

  it('reads a th as a row header where Chrome does: next to a data cell, by its scope, or in a row of them', async () => {
    const nodes = await $json(() => (
      <View>
        <table>
          <thead><tr><th></th><th>Q1</th></tr></thead>
          <tbody><tr><th>Revenue</th><td>10</td></tr><tr><th>Cost</th><td>4</td></tr></tbody>
        </table>
        <table><tbody><tr><td>10</td><th>Revenue</th></tr><tr><td>4</td><th>Cost</th></tr></tbody></table>
        <table><tbody><tr><th scope="col">Name</th><td>Ada</td></tr></tbody></table>
        <table><tbody><tr><th>Name</th><td></td></tr><tr><th>Born</th><td></td></tr></tbody></table>
      </View>
    ));
    assert.deepEqual(nodes, [
      { role: 'table', columns: ['Q1'], rows: { Revenue: { Q1: '10' }, Cost: { Q1: '4' } } },
      { role: 'table', rows: { Revenue: '10', Cost: '4' } },
      { role: 'table', children: [{ role: 'row', children: [{ role: 'columnheader', text: 'Name' }, { role: 'cell', text: 'Ada' }] }] },
      {
        role: 'table',
        children: [
          { role: 'row', children: [{ role: 'columnheader', text: 'Name' }] },
          { role: 'row', children: [{ role: 'columnheader', text: 'Born' }] },
        ],
      },
    ]);
  });

  it("keeps a cell's own fields in its record: a day's date and states with its text", async () => {
    const nodes = await $json(() => (
      <View role="grid" aria-label="September 2026">
        <View role="row" style={{ display: 'contents' }}>
          <Label role="columnheader" text="Mo" />
          <Label role="columnheader" text="Tu" />
        </View>
        <View role="row" style={{ display: 'contents' }}>
          <Label role="gridcell" datetime="2026-09-28" aria-selected="true" aria-current="date" text="28" />
          <Label role="gridcell" text="29" />
        </View>
      </View>
    ));
    assert.deepEqual(nodes, [
      {
        role: 'grid',
        label: 'September 2026',
        columns: ['Mo', 'Tu'],
        rows: [{ Mo: { selected: true, current: 'date', datetime: '2026-09-28', text: '28' }, Tu: '29' }],
      },
    ]);
  });

  it('keeps a table without distinct headers as rows of cells', async () => {
    const nodes = await $json(() => (
      <View>
        <table><tr><td>a</td><td>b</td></tr></table>
        <table><tr><th>x</th><th>x</th></tr><tr><td>1</td><td>2</td></tr></table>
      </View>
    ));
    assert.deepEqual(nodes, [
      { role: 'table', children: [{ role: 'row', children: [{ role: 'cell', text: 'a' }, { role: 'cell', text: 'b' }] }] },
      {
        role: 'table',
        children: [
          { role: 'row', children: [{ role: 'columnheader', text: 'x' }, { role: 'columnheader', text: 'x' }] },
          { role: 'row', children: [{ role: 'cell', text: '1' }, { role: 'cell', text: '2' }] },
        ],
      },
    ]);
  });

  it('names a node by aria-labelledby before aria-label, as the accessible name does', async () => {
    const nodes = await $json(() => (
      <View>
        <Label id="n" text="Real name" />
        <button aria-labelledby="n" aria-label="Other" />
      </View>
    ));
    assert.deepEqual(nodes, ['Real name', { role: 'button', label: 'Real name' }]);
  });

  it('reads label as a name only on the primitives and options that take it, as the browser names them', async () => {
    // Elsewhere label is an inert attribute: the browser names these by their content or not at all.
    const inert = {
      button: () => <button label="Delete all">OK</button>,
      input: () => <input label="Delete all" value="v" />,
      textarea: () => <textarea label="Delete all">t</textarea>,
      select: () => <select label="Delete all"><option>A</option></select>,
      img: () => <img label="Delete all" src="/a.png" alt="A" />,
      form: () => <form label="Delete all" aria-label="F">x</form>,
      output: () => <output label="Delete all">3</output>,
      meter: () => <meter label="Delete all" value={0.5} />,
      progress: () => <progress label="Delete all" value={0.5} />,
      li: () => <ul><li label="Delete all">x</li></ul>,
      ol: () => <ol label="Delete all"><li>x</li></ol>,
      details: () => <details label="Delete all"><summary>s</summary>x</details>,
      dialog: () => <dialog label="Delete all" open>x</dialog>,
      a: () => <a href="/x" label="Delete all">x</a>,
      h1: () => <h1 label="Delete all">x</h1>,
    };
    for (const [tag, view] of Object.entries(inert)) {
      const nodes = await $json(() => <div>{view()}</div>);
      assert.ok(!JSON.stringify(nodes).includes('Delete all'), `${tag}: ${JSON.stringify(nodes)}`);
    }
    const own = await $json(() => (
      <View>
        <Action label="Delete all" text="OK" />
        <Edit label="Search" />
        <View role="region" label="Inbox">x</View>
        <select aria-label="s"><option label="Long name" value="a">A</option></select>
      </View>
    ));
    assert.deepEqual(own, [
      { role: 'button', label: 'Delete all', text: 'OK' },
      { role: 'textbox', label: 'Search' },
      { role: 'region', label: 'Inbox', text: 'x' },
      { role: 'combobox', label: 's', children: [{ role: 'option', label: 'Long name', value: 'a', text: 'A' }] },
    ]);
  });

  it('skips a blank aria-label or aria-labelledby, as the accessible name does', async () => {
    const nodes = await $json(() => (
      <form>
        <label for="e">Email</label>
        <input id="e" aria-label="" />
        <Edit label="Search" aria-label="  " />
        <Label id="n" text="Real name" />
        <button aria-labelledby=" " aria-label="Go">x</button>
        <div aria-label="">text</div>
        <div aria-labelledby="">more</div>
        <section aria-label=" ">part</section>
      </form>
    ));
    assert.deepEqual(nodes, [
      {
        role: 'form',
        children: [
          { role: 'textbox', label: 'Email' },
          { role: 'textbox', label: 'Search' },
          'Real name',
          { role: 'button', label: 'Go', text: 'x' },
          'text',
          'more',
          'part',
        ],
      },
    ]);
  });

  it('names a node by a hidden element its aria-labelledby names, which stays hidden', async () => {
    const nodes = await $json(() => (
      <div>
        <span id="n" hidden>Close dialog</span>
        <button aria-labelledby="n">×</button>
        <span id="m">Open <span hidden>secret</span>menu</span>
        <button aria-labelledby="m">+</button>
      </div>
    ));
    assert.deepEqual(nodes, [
      { role: 'button', label: 'Close dialog', text: '×' },
      'Open menu',
      { role: 'button', label: 'Open menu', text: '+' },
    ]);
  });

  it('reads no empty id from spaces around aria-labelledby, nor an id="" as an id', async () => {
    const nodes = await $json(() => (
      <form>
        <span id="">Stray</span>
        <button aria-labelledby=" n ">x</button>
        <span id="n">Name</span>
        <label for="">Other</label>
        <input id="" value="v" />
      </form>
    ));
    assert.deepEqual(nodes, [
      { role: 'form', children: ['Stray', { role: 'button', label: 'Name', text: 'x' }, 'Name', 'Other', { role: 'textbox', value: 'v' }] },
    ]);
  });

  it('reads an id, and the props naming ids, by the text ren-dom writes: a number as its digits', async () => {
    // id and htmlFor are DOM properties (true is "true"); for, itemref and list attributes (for={true} is empty),
    // aria-labelledby one taking "true" and "false".
    const nodes = await $json(() => (
      <form>
        <label for={7}>Seven</label>
        <input id={7} value="a" />
        <label htmlFor={true}>Yes</label>
        <input id={true} value="b" />
        <label for={true}>Empty</label>
        <span id={8}>Named</span>
        <button aria-labelledby={8}>x</button>
        <span id="false">Flag</span>
        <button aria-labelledby={false}>y</button>
        <input list={9} aria-label="l" />
        <datalist id={9}><option value="o" /></datalist>
      </form>
    ));
    assert.deepEqual(nodes, [
      {
        role: 'form',
        children: [
          { role: 'textbox', label: 'Seven', value: 'a' },
          { role: 'textbox', label: 'Yes', value: 'b' },
          'Empty',
          'Named',
          { role: 'button', label: 'Named', text: 'x' },
          'Flag',
          { role: 'button', label: 'Flag', text: 'y' },
          // The datalist names the combobox; its option is a suggestion the page never shows.
          { role: 'combobox', label: 'l' },
        ],
      },
    ]);
    const item = await $json(() => (
      <div>
        <div itemscope itemtype="Person" itemref={5}><span itemprop="name">Ada</span></div>
        <span id={5} itemprop="born">1815</span>
      </div>
    ));
    assert.deepEqual(item, [{ item: { '@type': 'Person', name: 'Ada', born: '1815' } }, '1815']);
  });

  it('names by <label for> only an element a label can name, else keeps the label text', async () => {
    const div = await $json(() => <div><label for="x">Shipping</label><div id="x">body</div></div>);
    assert.deepEqual(div, ['Shipping', 'body']);
    const p = await $json(() => <div><label for="x">Shipping</label><p id="x">body</p></div>);
    assert.deepEqual(p, ['Shipping', { role: 'paragraph', text: 'body' }]);
    const hiddenInput = await $json(() => <div><label for="x">Token</label><input id="x" type="hidden" value="t" /></div>);
    assert.deepEqual(hiddenInput, ['Token']);
    const fields = await $json(() => (
      <form>
        <label for="a">Email</label>
        <input id="a" />
        <label for="b">Notes</label>
        <Edit id="b" />
        <label for="c">Send</label>
        <Action id="c" text="Go" />
      </form>
    ));
    assert.deepEqual(fields, [
      { role: 'form', children: [{ role: 'textbox', label: 'Email' }, { role: 'textbox', label: 'Notes' }, { role: 'button', label: 'Send', text: 'Go' }] },
    ]);
  });

  it('keeps a field inside its own <label for>, and drops only the label text', async () => {
    const nodes = await $json(() => (
      <form>
        <label for="a">
          Email <input id="a" value="v" />
        </label>
        <label for="b">
          <span>Plan</span>
          <div>
            <select id="b" value="pro" />
          </div>
        </label>
      </form>
    ));
    assert.deepEqual(nodes, [
      { role: 'form', children: [{ role: 'textbox', label: 'Email', value: 'v' }, { role: 'combobox', label: 'Plan', value: 'pro' }] },
    ]);
  });

  it('joins every <label for> naming one field, in document order', async () => {
    const nodes = await $json(() => (
      <form>
        <label for="a">First</label>
        <label for="a"> </label>
        <input id="a" />
        <label for="a">Name</label>
      </form>
    ));
    assert.deepEqual(nodes, [{ role: 'form', children: [{ role: 'textbox', label: 'First Name' }] }]);
  });

  it('reads the first element of a duplicate id, as getElementById does', async () => {
    const nodes = await $json(() => (
      <form>
        <span id="x">One</span>
        <span id="x">Two</span>
        <button aria-labelledby="x">b</button>
        <label for="a">L</label>
        <input id="a" value="1" />
        <input id="a" value="2" />
      </form>
    ));
    assert.deepEqual(nodes, [
      {
        role: 'form',
        children: ['OneTwo', { role: 'button', label: 'One', text: 'b' }, { role: 'textbox', label: 'L', value: '1' }, { role: 'textbox', value: '2' }],
      },
    ]);
  });

  it('names by the aria-label of a node aria-labelledby names, before its text', async () => {
    const nodes = await $json(() => (
      <div>
        <span id="x" aria-label="Close">X</span>
        <span id="y" aria-label=" ">dialog</span>
        <button aria-labelledby="x y">b</button>
      </div>
    ));
    assert.deepEqual(nodes, [{ role: 'group', label: 'Close', text: 'X' }, 'dialog', { role: 'button', label: 'Close dialog', text: 'b' }]);
  });

  it('follows aria-labelledby one level only: in any order, and down a long chain', async () => {
    // Inside a labelledby traversal a node gives its own aria-label, else its text (its aria-label decides its role).
    const p = () => <svg id="p" aria-labelledby="q">P</svg>;
    const q = () => <svg id="q" aria-labelledby="p" aria-label="QL">Q</svg>;
    const P = { role: 'group', label: 'QL', text: 'P' };
    const Q = { role: 'group', label: 'QL', text: 'Q' };
    assert.deepEqual(await $json(() => <div>{p()}{q()}</div>), [P, Q], 'p first');
    assert.deepEqual(await $json(() => <div>{q()}{p()}</div>), [Q, P], 'q first');
    const n = 5000;
    const ids = Array.from({ length: n }, (_, i) => i);
    const chain = await $json(() => (
      <div>
        {ids.map(i => <svg id={`s${i}`} aria-labelledby={`s${i + 1}`} />)}
        <span id={`s${n}`}>end</span>
      </div>
    ));
    // Only the last svg reads text (the span's); each other one names an svg with no text, so is dropped.
    assert.deepEqual(chain, [{ role: 'group', label: 'end' }, 'end']);
  });

  it('counts a name source only when it resolves to text, else falls to the next', async () => {
    // Every source in the accessible name's order, each bad in every way it
    // can be, with the sources after it good: the name is the next good one.
    const bad = {
      by: { missing: undefined, blank: '', whitespace: '  ', nothing: 'nope', empty: 'empty', spaces: 'spaces' },
      aria: { missing: undefined, blank: '', whitespace: '  ' },
      for: { missing: null, blank: '', whitespace: '  ', hidden: <span hidden>Gone</span> },
      label: { missing: undefined, blank: '', whitespace: '  ' },
    };
    const order = ['by', 'aria', 'for', 'label'];
    const good = { by: 'By', aria: 'Aria', for: 'For', label: 'Prim' };
    const labelOf = (/** @type {any[]} */ nodes) => nodes.flatMap(n => (typeof n === 'string' ? [] : n.role === 'textbox' ? [n] : labelOf(n.children ?? [])))[0];
    for (const [at, source] of order.entries()) {
      for (const [how, value] of Object.entries(bad[source])) {
        // This source bad, the ones before it absent, the ones after it good.
        const use = (/** @type {string} */ s) => (s === source ? value : order.indexOf(s) > at ? good[s] : undefined);
        const props = { id: 'f', 'aria-labelledby': use('by') === 'By' ? 'by' : use('by'), 'aria-label': use('aria'), label: use('label') };
        const forText = use('for');
        const nodes = await $json(() => (
          <form>
            <span id="by">By</span>
            <span id="empty" />
            <span id="spaces">{'  '}</span>
            {forText === undefined || forText === null ? null : <label for="f">{forText}</label>}
            <Edit {...props} />
          </form>
        ));
        const expected = order.slice(at + 1).map(s => good[s])[0];
        // With no name at all, the textbox has nothing about it and is dropped.
        assert.deepEqual(labelOf(nodes), expected === undefined ? undefined :{ role: 'textbox', label: expected }, `${source} ${how}`);
      }
    }
    // A wrapper is a region or a group only with a name that resolves; else it dissolves. A section's
    // aria-labelledby makes it a region once it names an element there is, even an empty one, as Chrome
    // counts it (test/fixtures/roles.json), though its label stays unset.
    for (const [how, value] of Object.entries(bad.by)) {
      const nodes = await $json(() => (
        <div>
          <span id="empty" />
          <span id="spaces">{'  '}</span>
          <section aria-labelledby={value}>part</section>
          <div aria-labelledby={value}>more</div>
        </div>
      ));
      const there = how === 'empty' || how === 'spaces';
      assert.deepEqual(nodes, [there ? { role: 'region', text: 'part' } : 'part', 'more'], `aria-labelledby ${how}`);
    }
    for (const [how, value] of Object.entries(bad.aria)) {
      const nodes = await $json(() => (
        <div>
          <section aria-label={value}>part</section>
          <div aria-label={value}>more</div>
        </div>
      ));
      assert.deepEqual(nodes, ['part', 'more'], `aria-label ${how}`);
    }
    const named = await $json(() => (
      <div>
        <span id="n">Name</span>
        <section aria-labelledby="nope n">part</section>
        <div aria-label="Box">more</div>
      </div>
    ));
    assert.deepEqual(named, ['Name', { role: 'region', label: 'Name', text: 'part' }, { role: 'group', label: 'Box', text: 'more' }]);
    // Elements with no props at all have no name and no role of a name.
    const bare = await $json(() => (
      <div>
        <section>part</section>
        <div>more</div>
        <svg />
        <table><tr><td>cell</td></tr></table>
        <Edit />
      </div>
    ));
    assert.deepEqual(bare, ['part', 'more', { role: 'table', children: [{ role: 'row', children: [{ role: 'cell', text: 'cell' }] }] }]);
  });

  it('reads a role by its first WAI-ARIA token, trimmed, so a fallback list of none roles dissolves', async () => {
    const nodes = await $json(() => (
      <View>
        <View role="none presentation"><b>a</b></View>
        <View role=" tab">b</View>
        <View role="tab button">c</View>
        <ul role="none presentation"><li>e</li></ul>
        <View role="  ">f</View>
        <View role="card button">g</View>
        <View role="card">h</View>
        <View role="Tab">i</View>
        <View role="doc-chapter">j</View>
        <View role="doc-card button">k</View>
        <View role={'lin\u212A'}>l</View>
      </View>
    ));
    // As a browser reads it: the first token that is a WAI-ARIA role, compared lowercase; none, the element's own role.
    assert.deepEqual(nodes, ['a', { role: 'tab', text: 'b' }, { role: 'tab', text: 'c' }, { role: 'listitem', text: 'e' }, 'f', { role: 'button', text: 'g' }, 'h', { role: 'tab', text: 'i' }, { role: 'doc-chapter', text: 'j' }, { role: 'button', text: 'k' }, 'l']);
  });

  it('reads a boolean prop not spelled as its DOM property as the attribute ren-dom writes: there unless false (security)', async () => {
    // HIDDEN is no property: ren-dom writes the attribute, and its presence hides, whatever its value.
    const nodes = await $json(() => (
      <form aria-label="f">
        <p {...{ HIDDEN: '' }}>secret</p>
        <p {...{ HIDDEN: 0 }}>secret 2</p>
        <p {...{ HIDDEN: false }}>shown</p>
        <input type="checkbox" aria-label="a" {...{ CHECKED: '' }} />
        <input aria-label="b" {...{ DISABLED: 0, REQUIRED: '', readonly: 0 }} />
        <select aria-label="c" {...{ MULTIPLE: '' }}><option {...{ SELECTED: '' }}>x</option></select>
      </form>
    ));
    assert.ok(!JSON.stringify(nodes).includes('secret'), JSON.stringify(nodes));
    assert.deepEqual(nodes, [
      {
        role: 'form',
        label: 'f',
        children: [
          { role: 'paragraph', text: 'shown' },
          { role: 'checkbox', label: 'a', checked: true },
          { role: 'textbox', label: 'b', disabled: true, required: true, readonly: true },
          { role: 'listbox', label: 'c', multiselectable: true, children: [{ role: 'option', selected: true, text: 'x' }] },
        ],
      },
    ]);
  });

  it('reads no ID-reference ariaX prop, which no browser has as a string property', async () => {
    // ariaLabelledBy and the like take elements in a browser: ren-dom writes an arialabelledby attribute, inert.
    const nodes = await $json(() => (
      <div>
        <span id="l">Name</span>
        <button {...{ ariaLabelledBy: 'l', ariaDescribedBy: 'l', ariaControls: 'l', ariaOwns: 'l', ariaActiveDescendant: 'l', ariaErrorMessage: 'l', ariaDetails: 'l', ariaFlowTo: 'l' }}>x</button>
      </div>
    ));
    assert.deepEqual(nodes, ['Name', { role: 'button', text: 'x' }]);
  });

  it('reads a DOM property prop under the attribute it reflects: htmlFor, dateTime, ariaX', async () => {
    const nodes = await $json(() => (
      <form aria-label="f">
        <label htmlFor="n">Name</label>
        <input id="n" value="v" />
        <time dateTime="2026-09-30">today</time>
        <div role="button" {...{ ariaLabel: 'Close', ariaPressed: 'true' }} />
        <div {...{ ariaHidden: 'true' }}>gone</div>
      </form>
    ));
    assert.deepEqual(nodes, [
      {
        role: 'form',
        label: 'f',
        children: [
          { role: 'textbox', label: 'Name', value: 'v' },
          { role: 'time', datetime: '2026-09-30', text: 'today' },
          { role: 'button', pressed: true, label: 'Close' },
        ],
      },
    ]);
  });

  it('reads prop and tag names as ren-dom writes them, ASCII case-insensitively (security)', async () => {
    // A name that is no DOM property is an attribute to ren-dom, and HTML
    // lowercases it: TYPE is type, HIDDEN hidden, ROLE role; a type written as
    // a list is its string, as the attribute's.
    const Input = /** @type {any} */ ('INPUT');
    const nodes = await $json(() => (
      <form aria-label="f">
        <input {...{ TYPE: 'password' }} value="hunter2" aria-label="a" />
        <input {...{ Type: 'hidden' }} name="csrf" value="tok-123" />
        <input type={/** @type {any} */ (['password'])} value="pw2" aria-label="b" />
        <div {...{ HIDDEN: true }}><p>private note</p></div>
        <p {...{ 'ARIA-HIDDEN': 'true' }}>gone</p>
        <div {...{ ROLE: 'button' }}>Go</div>
        <Input type="hidden" value="tok" />
        <input {...{ readonly: true }} value="x" aria-label="c" />
        <input readOnly value="y" aria-label="d" />
      </form>
    ));
    const text = JSON.stringify(nodes);
    for (const leak of ['hunter2', 'tok-123', 'pw2', 'private', 'gone', '"tok"']) assert.ok(!text.includes(leak), `${leak}: ${text}`);
    assert.deepEqual(nodes, [
      {
        role: 'form',
        label: 'f',
        children: [
          { role: 'textbox', label: 'a' },
          { role: 'textbox', label: 'b' },
          { role: 'button', text: 'Go' },
          { role: 'textbox', label: 'c', value: 'x', readonly: true },
          { role: 'textbox', label: 'd', value: 'y', readonly: true },
        ],
      },
    ]);
  });

  it('reads enumerated attribute values ASCII case-insensitively, as a browser does (security)', async () => {
    const nodes = await $json(() => (
      <form aria-label="f">
        <input type="PASSWORD" value="hunter2" aria-label="Password" />
        <input type="Hidden" name="csrf" value="tok-123" />
        <input type="CHECKBOX" checked aria-label="c" />
        <span aria-hidden="TRUE">secret</span>
        <div role="checkbox" aria-checked="MIXED" aria-label="m" />
        <table>
          <tbody>
            <tr><th scope="ROW">Name</th><td>Ada</td></tr>
          </tbody>
        </table>
      </form>
    ));
    const text = JSON.stringify(nodes);
    assert.ok(!text.includes('hunter2') && !text.includes('tok-123') && !text.includes('secret'), text);
    assert.deepEqual(nodes, [
      {
        role: 'form',
        label: 'f',
        children: [
          { role: 'textbox', label: 'Password' },
          { role: 'checkbox', label: 'c', checked: true },
          { role: 'checkbox', checked: 'mixed', label: 'm' },
          { role: 'table', rows: { Name: 'Ada' } },
        ],
      },
    ]);
  });

  it('marks the option a select\'s value picks selected, and only it, as the browser\'s select.value does', async () => {
    const empty = await $json(() => (
      <select aria-label="s" value="">
        <option value="a">A</option>
        <option value="">None</option>
      </select>
    ));
    assert.deepEqual(empty, [{ role: 'combobox', label: 's', children: [{ role: 'option', value: 'a', text: 'A' }, { role: 'option', selected: true, text: 'None' }] }]);
    const grouped = await $json(() => (
      <select aria-label="s" value="b">
        <option value="a" selected>A</option>
        <optgroup label="G"><option value="b">B</option></optgroup>
      </select>
    ));
    assert.deepEqual(grouped, [{ role: 'combobox', label: 's', value: 'b', children: [{ role: 'option', value: 'a', text: 'A' }, { role: 'group', label: 'G', children: [{ role: 'option', value: 'b', selected: true, text: 'B' }] }] }]);
    // An option without a value is picked by its text, whitespace collapsed.
    const text = await $json(() => (
      <select aria-label="s" value="Two x">
        <option>One</option>
        <option>{' Two\n x '}</option>
        <option>Two x</option>
      </select>
    ));
    assert.deepEqual(text, [{ role: 'combobox', label: 's', value: 'Two x', children: [{ role: 'option', text: 'One' }, { role: 'option', selected: true, text: 'Two x' }, { role: 'option', text: 'Two x' }] }]);
  });

  it('reads a select\'s multiple as its DOM property does, for its role and its field alike', async () => {
    const nodes = await $json(() => (
      <View>
        <select multiple="multiple" aria-label="a"><option>x</option></select>
        <select multiple={false} aria-label="b"><option>y</option></select>
      </View>
    ));
    assert.deepEqual(nodes, [
      { role: 'listbox', label: 'a', multiselectable: true, children: [{ role: 'option', text: 'x' }] },
      { role: 'combobox', label: 'b', children: [{ role: 'option', text: 'y' }] },
    ]);
  });

  it('reads a tag or input type named as an object member as any other name', async () => {
    const Own = /** @type {any} */ ('hasOwnProperty');
    const Str = /** @type {any} */ ('toString');
    const nodes = await $json(() => (
      <form aria-label="f">
        <input type="constructor" aria-label="a" />
        <input type="__proto__" aria-label="b" />
        <Own>c</Own>
        <Str>d</Str>
      </form>
    ));
    assert.deepEqual(nodes, [{ role: 'form', label: 'f', children: [{ role: 'textbox', label: 'a' }, { role: 'textbox', label: 'b' }, 'c', 'd'] }]);
  });

  it('splits token lists on ASCII whitespace only, as a browser does', async () => {
    const nodes = await $json(() => (
      <View>
        <View role={'\u00a0tab'}>a</View>
        <span id={'a\u2003b'}>Name</span>
        <button aria-labelledby={'a\u2003b'}>x</button>
        <View itemscope itemref={'p\u2003q'} />
        <span id={'p\u2003q'} itemprop="name">Ada</span>
      </View>
    ));
    // A no-break space is no separator: the role is no role. An em space is part of an id.
    assert.deepEqual(nodes, ['a', 'Name', { role: 'button', label: 'Name', text: 'x' }, { item: { name: 'Ada' } }, 'Ada']);
  });

  it('reads aria-multiselectable as multiselectable, a constraint like required, and drops the rest', async () => {
    const nodes = await $json(() => (
      <View>
        <View role="listbox" aria-label="Tags" aria-multiselectable="true" aria-activedescendant="t1" aria-describedby="h">
          <View role="option" id="t1" aria-selected="true" aria-posinset={1} aria-setsize={2}>red</View>
        </View>
        <View role="listbox" aria-label="Size" aria-multiselectable="false" aria-live="polite" aria-haspopup="true">
          <View role="option">small</View>
        </View>
        <select multiple aria-label="Colors">
          <option>red</option>
        </select>
      </View>
    ));
    assert.deepEqual(nodes, [
      { role: 'listbox', label: 'Tags', multiselectable: true, children: [{ role: 'option', selected: true, text: 'red' }] },
      { role: 'listbox', label: 'Size', children: [{ role: 'option', text: 'small' }] },
      { role: 'listbox', label: 'Colors', multiselectable: true, children: [{ role: 'option', text: 'red' }] },
    ]);
  });

  it('reads an Action\'s selected as pressed, but only without a role, as the renderers write it', async () => {
    const nodes = await $json(() => (
      <View>
        <Action text="Bold" selected />
        <Action text="Italic" selected={false} />
        <Action role="tab" aria-selected="true" selected text="Inbox" />
        <Action role="checkbox" aria-checked="false" selected text="Starred" />
        <Action role="switch" selected text="Sync" />
        <Action role="" selected text="Plain" />
      </View>
    ));
    assert.deepEqual(nodes, [
      { role: 'button', pressed: true, text: 'Bold' },
      { role: 'button', pressed: false, text: 'Italic' },
      { role: 'tab', selected: true, text: 'Inbox' },
      { role: 'checkbox', checked: false, text: 'Starred' },
      { role: 'switch', text: 'Sync' },
      // role="" is a role to the renderers (they write no aria-pressed): selected says nothing.
      { role: 'button', text: 'Plain' },
    ]);
    // selected given null or undefined makes no toggle, as the renderers write no aria-pressed.
    const none = await $json(() => <View><Action text="Null" selected={null} /><Action text="Unset" selected={undefined} /></View>);
    assert.deepEqual(none, [{ role: 'button', text: 'Null' }, { role: 'button', text: 'Unset' }]);
  });

  it('reads valueAsNumber and valueAsDate as the value they write, as ren-html converts them', async () => {
    const utc = (/** @type {number} */ y, /** @type {number} */ m, /** @type {number} */ d) => new Date(0).setUTCFullYear(y, m, d);
    /** @type {[string, Record<string, unknown>, string | undefined][]} */
    const cases = [
      ['number', { valueAsNumber: 5 }, '5'], ['range', { valueAsNumber: 2.5 }, '2.5'], ['number', { valueAsNumber: NaN }, undefined],
      ['date', { valueAsNumber: 0 }, '1970-01-01'], ['date', { valueAsNumber: 9e15 }, undefined], ['date', { valueAsNumber: -1e14 }, undefined],
      ['date', { valueAsNumber: utc(1, 0, 1) }, '0001-01-01'], ['month', { valueAsNumber: 1 }, '1970-02'], ['month', { valueAsNumber: 1e12 }, undefined],
      ['week', { valueAsNumber: Date.UTC(2021, 0, 3) }, '2020-W53'], ['week', { valueAsNumber: -1e14 }, undefined], ['time', { valueAsNumber: 3723004 }, '01:02:03.004'],
      ['datetime-local', { valueAsNumber: 86400000 + 60000 }, '1970-01-02T00:01'],
      ['date', { valueAsDate: new Date(Date.UTC(2024, 1, 29, 13)) }, '2024-02-29'], ['month', { valueAsDate: new Date(Date.UTC(2024, 11, 15)) }, '2024-12'],
      ['time', { valueAsDate: new Date(Date.UTC(2000, 0, 1, 9, 30)) }, '09:30'], ['date', { valueAsDate: new Date(-1e14) }, undefined],
      ['date', { value: '2000-01-01', valueAsDate: null }, undefined],
    ];
    for (const [type, props, value] of cases) {
      const [node] = /** @type {any[]} */ (await $json(() => <input type={type} aria-label="f" {...props} />));
      assert.equal(node?.value, value, `${type} ${JSON.stringify(props)}`);
    }
    // Where they do not apply, ren-dom's write throws, and so does the render: a password never gets a value from them.
    for (const [type, props] of /** @type {[string, Record<string, unknown>][]} */ ([['text', { valueAsNumber: 5 }], ['password', { valueAsNumber: 5 }], ['datetime-local', { valueAsDate: new Date(0) }], ['number', { valueAsDate: new Date(0) }]]))
      await assert.rejects($json(() => <input type={type} {...props} />), { name: 'InvalidStateError' }, `${type} ${Object.keys(props)[0]}`);
    await assert.rejects($json(() => <input type="number" valueAsNumber={Infinity} />), TypeError);
    await assert.rejects($json(() => <input type="date" valueAsDate="2024-01-01" />), TypeError);
  });

  it('copies an object value\'s own keys only, as JSON.stringify does', async () => {
    const value = Object.create({ inherited: 'LEAK' });
    value.own = 1;
    const nodes = await $json(() => <div itemscope><meta itemprop="x" content={value} /></div>);
    assert.deepEqual(nodes, [{ item: { x: { own: 1 } } }]);
  });

  it('reads a textarea, title, xmp or plaintext as its text only: no role or item from the elements put in it', async () => {
    const Tag = (/** @type {string} */ tag) => /** @type {any} */ (tag);
    for (const tag of ['textarea', 'title', 'xmp', 'plaintext']) {
      const T = Tag(tag);
      /** @type {(() => any)[]} */
      const views = [
        () => <T>a<h1>LEAK</h1></T>,
        () => <T><div itemscope itemtype="https://schema.org/Person"><span itemprop="name">LEAK</span></div></T>,
        () => <T><nav><a href="/x">LEAK</a></nav></T>,
        () => <T><table><tr><td>LEAK</td></tr></table></T>,
      ];
      for (const view of views) {
        const text = JSON.stringify(await $json(view));
        // Its text may say it (the page holds the markup as text); nothing may stand as a node or an item.
        assert.ok(!/"role":"(heading|navigation|link|table|row|cell)"|"item"|"@type"/.test(text), `${tag}: ${text}`);
        assert.ok(text.includes('LEAK'), `${tag} keeps its text: ${text}`);
      }
    }
  });

  it('names a field by no label the page hides, itself or by an ancestor (security)', async () => {
    for (const view of [
      () => <div><div hidden><label for="x">LEAK</label></div><input id="x" /></div>,
      () => <div><div aria-hidden="true"><label for="x">LEAK</label></div><input id="x" /></div>,
      () => <div><label for="x" hidden>LEAK</label><input id="x" /></div>,
    ]) assert.deepEqual(await $json(view), []); // an unnamed field is a role and nothing else: dropped
    assert.deepEqual(await $json(() => <div><div><label for="x">Shown</label></div><input id="x" /></div>), [{ role: 'textbox', label: 'Shown' }]);
  });

  it('follows no itemref into a hidden element or one under a hidden ancestor (security)', async () => {
    /** @type {[string, () => any][]} */
    const routes = [
      ['hidden ancestor', () => <div><div itemscope itemref="s"><span itemprop="name">Pub</span></div><div hidden><span id="s" itemprop="secret">LEAK</span></div></div>],
      ['aria-hidden ancestor', () => <div><div itemscope itemref="s"><span itemprop="name">Pub</span></div><div aria-hidden="true"><span id="s" itemprop="secret">LEAK</span></div></div>],
      ['until-found ancestor', () => <div><div itemscope itemref="s"><span itemprop="name">Pub</span></div><section hidden="until-found"><meta id="s" itemprop="k" content="LEAK" /></section></div>],
      ['hidden itself', () => <div><div itemscope itemref="s"><span itemprop="name">Pub</span></div><span hidden id="s" itemprop="secret">LEAK</span></div>],
    ];
    for (const [route, view] of routes) {
      const nodes = await $json(view);
      assert.ok(!JSON.stringify(nodes).includes('LEAK'), `${route}: ${JSON.stringify(nodes)}`);
      assert.equal(/** @type {any} */ (nodes[0]).item.name, 'Pub', route);
    }
    // A shown ref is still followed.
    const shown = await $json(() => <div><div itemscope itemref="s"><span itemprop="name">Pub</span></div><div><span id="s" itemprop="more">Also</span></div></div>);
    assert.equal(/** @type {any} */ (shown[0]).item.more, 'Also');
  });

  it('reads a textarea with a value as that value only, not the children appended after it', async () => {
    // A browser's textarea value is dirty once set (ren-dom sets '' for null): the field shows it, not later text.
    const Area = /** @type {any} */ ('textarea');
    assert.deepEqual(await $json(() => <Area aria-label="b" value="v">kid</Area>), [{ role: 'textbox', label: 'b', value: 'v' }]);
    assert.deepEqual(await $json(() => <Area aria-label="b" value="">kid</Area>), [{ role: 'textbox', label: 'b' }]);
    assert.deepEqual(await $json(() => <Area aria-label="b" value={null}>kid</Area>), [{ role: 'textbox', label: 'b' }]);
    assert.deepEqual(await $json(() => <Area aria-label="b">kid</Area>), [{ role: 'textbox', label: 'b', text: 'kid' }]);
    // Nor does a label around it read the children.
    assert.ok(!JSON.stringify(await $json(() => <label>Note <Area value="v">kid</Area></label>)).includes('kid'));
  });

  it('reports nothing the page never holds: a template\'s content, and what the parser reads as text or never renders (security)', async () => {
    const Tag = (/** @type {string} */ tag) => /** @type {any} */ (tag);
    /** @type {[string, () => any][]} */
    const routes = [
      ['a template\'s role', () => <div><template role="note">secret</template></div>],
      ['an id in a template', () => <div><template><span id="s">secret</span></template><button aria-labelledby="s">Go</button></div>],
      ['a label in a template', () => <div><template><label for="f">secret</label></template><input id="f" /></div>],
      ['an itemref into a template', () => <div><div itemscope itemref="p"><b itemprop="x">1</b></div><template><span id="p" itemprop="pin">secret</span></template></div>],
    ];
    for (const tag of ['script', 'style', 'iframe', 'noembed', 'noframes', 'noscript']) {
      const T = Tag(tag);
      routes.push([`a ${tag}'s role`, () => <div><T role="note">secret</T></div>]);
      routes.push([`a ${tag}'s text`, () => <div><T>secret</T></div>]);
      routes.push([`an id in a ${tag}`, () => <div><T><span id="s">secret</span></T><button aria-labelledby="s">Go</button></div>]);
      routes.push([`a label in a ${tag}`, () => <div><T><label for="f">secret</label></T><input id="f" /></div>]);
    }
    // A textarea's, title's, xmp's or plaintext's content is its own text: no element in it has an id to name.
    for (const tag of ['textarea', 'title', 'xmp', 'plaintext']) {
      const T = Tag(tag);
      routes.push([`an id in a ${tag}`, () => <div><T><span id="s">secret</span></T><button aria-labelledby="s">Go</button></div>]);
      routes.push([`a label in a ${tag}`, () => <div><T><label for="f">secret</label></T><input id="f" /></div>]);
      routes.push([`an itemref into a ${tag}`, () => <div><div itemscope itemref="p"><b itemprop="x">1</b></div><T><span id="p" itemprop="pin">secret</span></T></div>]);
    }
    /** @type {string[]} */
    const leaks = [];
    for (const [route, view] of routes) {
      const nodes = await $json(view);
      // Only the text a textarea, title, xmp or plaintext holds may say it: never as a name or an item's value.
      const text = JSON.stringify(nodes);
      if (/textarea|title|xmp|plaintext/.test(route) ? /"(label|pin)":"secret"/.test(text) : text.includes('secret')) leaks.push(`${route}: ${text}`);
    }
    assert.deepEqual(leaks, []);
  });

  it('reports nothing inside a void element, which the page drops, by any route (security)', async () => {
    const Input = /** @type {any} */ ('input');
    /** @type {[string, () => any][]} */
    const routes = [
      ['content prop', () => <input type="password" aria-label="pw" textContent="hunter2" />],
      ['children', () => <Input type="password" aria-label="pw">hunter2</Input>],
      ['a label around it', () => (
        <label>
          Password <Input type="password">hunter2</Input>
        </label>
      )],
      ['aria-labelledby', () => (
        <div>
          <Input id="pw" type="password">hunter2</Input>
          <button aria-labelledby="pw">Go</button>
        </div>
      )],
      ['an itemprop', () => (
        <div itemscope>
          <Input itemprop="secret" type="password">hunter2</Input>
        </div>
      )],
      ['an img', () => (
        <p>
          <img alt="a" textContent="hunter2" />
        </p>
      )],
      ['a table cell', () => (
        <table>
          <tr>
            <td>
              <Input type="password">hunter2</Input>
            </td>
          </tr>
        </table>
      )],
    ];
    for (const [route, view] of routes) {
      const text = JSON.stringify(await $json(view));
      assert.ok(!text.includes('hunter2'), `${route}: ${text}`);
    }
  });

  it('gives an area with an href the link role, named by its alt, and one without none', async () => {
    const nodes = await $json(() => (
      <map name="m">
        <area href="/home" alt="Home" />
        <area alt="Nowhere" />
      </map>
    ));
    assert.deepEqual(nodes, [{ role: 'link', href: '/home', alt: 'Home' }]);
  });

  it('edits an absolute href by its URL parts, as the page holds it, and a relative one not at all', async () => {
    /** @type {[() => any, string][]} */
    const cases = [
      [() => <a href="https://u:p@x.example:8080/p?q=1#f" hash="#h">go</a>, 'https://u:p@x.example:8080/p?q=1#h'],
      [() => <a href="https://x.example/p" search="z=2">go</a>, 'https://x.example/p?z=2'],
      [() => <a href="https://x.example/p" pathname="/n">go</a>, 'https://x.example/n'],
      [() => <a href="https://x.example/p" host="y.example:9">go</a>, 'https://y.example:9/p'],
      [() => <a href="https://x.example/p" hostname="y.example">go</a>, 'https://y.example/p'],
      [() => <a href="https://x.example:8080/p" port="443">go</a>, 'https://x.example/p'],
      [() => <a href="https://x.example/p" protocol="http">go</a>, 'http://x.example/p'],
      [() => <a href="https://x.example/p" username="v">go</a>, 'https://v@x.example/p'],
      [() => <a href="https://v@x.example/p" password="w">go</a>, 'https://v:w@x.example/p'],
      [() => <a href="/relative" hash="#h">go</a>, '/relative'],
      // An href given as an object is its string, as ren-dom writes it: a URL's too.
      [() => <a href={new URL('https://x.example/p')} hash="#h">go</a>, 'https://x.example/p#h'],
    ];
    for (const [view, href] of cases) assert.deepEqual(await $json(view), [{ role: 'link', href, text: 'go' }], href);
    // A part that makes the href javascript: drops it, as ren-dom does: the page holds no link, and neither does the data.
    assert.deepEqual(await $json(() => <a href="mailto:alert(1)" protocol="javascript:">go</a>), ['go']);
    assert.deepEqual(await $json(() => <a href={new URL('mailto:alert(1)')} protocol="JavaScript:">go</a>), ['go']);
    // Nor a javascript: URL given as such, however cased or spaced; another scheme is the data's.
    for (const href of ['javascript:alert(1)', ' JaVa\tScRiPt:alert(1)', '\u0001javascript:alert(1)']) assert.deepEqual(await $json(() => <a href={href}>go</a>), ['go'], href);
    assert.deepEqual(await $json(() => <img src="javascript:alert(1)" alt="A" />), [{ role: 'img', alt: 'A' }]);
    assert.deepEqual(await $json(() => <a href="/javascript:x">go</a>), [{ role: 'link', href: '/javascript:x', text: 'go' }]);
    const area = await $json(() => <area href="https://x.example/p" hash="#h" alt="A" />);
    assert.ok(JSON.stringify(area).includes('"href":"https://x.example/p#h"'), JSON.stringify(area));
    // Elsewhere the parts are no properties: nothing to edit.
    assert.deepEqual(await $json(() => <link href="https://x.example/p" hash="#h" />), await $json(() => <link href="https://x.example/p" />));
  });

  it('reads text, textContent and innerText as the content they write, as ren-dom and ren-html do', async () => {
    /** @type {[() => any, () => any][]} */
    const pairs = [
      [() => <a href="/x" text="Docs" />, () => <a href="/x">Docs</a>],
      [() => (
        <select>
          <option text="One" />
          <option selected text="Two" />
        </select>
      ), () => (
        <select>
          <option>One</option>
          <option selected>Two</option>
        </select>
      )],
      [() => <p textContent="Hello" />, () => <p>Hello</p>],
      [() => <p innerText="Hello" />, () => <p>Hello</p>],
      // innerText's line breaks are <br>s, as the page holds them.
      [() => <p innerText={'a\nb\r\nc'} />, () => (
        <p>
          a<br />b<br />c
        </p>
      )],
      [() => <pre innerText={'a\nb'} />, () => (
        <pre>
          a<br />b
        </pre>
      )],
      [() => <h2 textContent="Title" />, () => <h2>Title</h2>],
      [() => <title text="T" />, () => <title>T</title>],
      [() => <script text="var a = 1" />, () => <script>var a = 1</script>],
      // text is content only on an a, option, title or script; elsewhere it is an inert attribute.
      [() => <p text="x" />, () => <p />],
      [() => <p textContent={null} />, () => <p />],
    ];
    for (const [given, want] of pairs) assert.deepEqual(await $json(given), await $json(want), JSON.stringify(await $json(want)));
  });

  it('reads defaultChecked, defaultSelected and defaultValue as the attributes they write, when the live prop is absent', async () => {
    // ren-dom and ren-html write them as the checked, selected and value attributes.
    const nodes = await $json(() => (
      <form>
        <input type="checkbox" defaultChecked aria-label="a" />
        <input type="checkbox" defaultChecked checked={false} aria-label="b" />
        <input type="checkbox" {...{ DefaultChecked: true }} aria-label="c" />
        <input defaultValue="dv" aria-label="d" />
        <input defaultValue="dv" value="live" aria-label="e" />
        <textarea defaultValue="hello" aria-label="f" />
        <input type="password" defaultValue="hunter2" aria-label="g" />
        <input type="PASSWORD" defaultValue="hunter3" aria-label="h" />
        <select aria-label="i">
          <option value="x">X</option>
          <option value="y" defaultSelected>
            Y
          </option>
        </select>
        <div itemscope>
          <input itemprop="code" defaultValue="42" aria-label="j" />
          <input itemprop="pin" type="password" defaultValue="1234" aria-label="k" />
        </div>
      </form>
    ));
    const text = JSON.stringify(nodes);
    assert.ok(!text.includes('hunter') && !text.includes('1234'), 'a password default never leaves the view');
    const form = /** @type {any} */ (nodes[0]).children;
    assert.deepEqual(form.slice(0, 8), [
      { role: 'checkbox', label: 'a', checked: true },
      { role: 'checkbox', label: 'b', checked: false },
      { role: 'checkbox', label: 'c' },
      { role: 'textbox', label: 'd', value: 'dv' },
      { role: 'textbox', label: 'e', value: 'live' },
      // A textarea's default value is its text, as the page holds it.
      { role: 'textbox', label: 'f', text: 'hello' },
      { role: 'textbox', label: 'g' },
      { role: 'textbox', label: 'h' },
    ]);
    assert.ok(JSON.stringify(form[8]).includes('"selected":true'), JSON.stringify(form[8]));
    assert.equal(/** @type {any} */ (form[9]).item.code, '42');
  });

  it('names fields by their labels, keeps their values and states, and never a password', async () => {
    const nodes = await $json(() => (
      <form>
        <label for="mail">Email</label>
        <input id="mail" type="email" value="ada@mail.example" class="wide" required />
        <Label id="pw-name" text="Password" />
        <Edit aria-labelledby="pw-name" secret value="hunter2" />
        <Edit label="Search" value="lamp" invalid />
        <input type="checkbox" checked name="terms" />
        <input type="hidden" name="csrf" value="token" />
        <Action role="checkbox" aria-checked="false" text="Newsletter" />
        <Action text="Send" disabled />
      </form>
    ));
    assert.deepEqual(nodes, [
      {
        role: 'form',
        children: [
          { role: 'textbox', label: 'Email', value: 'ada@mail.example', required: true },
          'Password',
          { role: 'textbox', label: 'Password' },
          { role: 'textbox', label: 'Search', value: 'lamp', invalid: true },
          { role: 'checkbox', name: 'terms', checked: true },
          { role: 'checkbox', checked: false, text: 'Newsletter' },
          { role: 'button', disabled: true, text: 'Send' },
        ],
      },
    ]);
  });

  it('makes numbers only of aria level and range values, booleans of aria states, and keeps every other word as written', async () => {
    const nodes = await $json(() => (
      <form>
        <input name="zip" value="02134" title="Infinity" />
        <Action aria-label="42" aria-expanded="true" aria-pressed="mixed" text="Open" />
        <div role="slider" aria-label="Volume" aria-valuenow="5" aria-valuemin="0" aria-valuemax="10" aria-valuetext="5" />
        <div role="heading" aria-level="2">Title</div>
      </form>
    ));
    assert.deepEqual(nodes, [
      {
        role: 'form',
        children: [
          { role: 'textbox', title: 'Infinity', name: 'zip', value: '02134' },
          { role: 'button', expanded: true, pressed: 'mixed', label: '42', text: 'Open' },
          { role: 'slider', value: 5, min: 0, max: 10, valueText: '5', label: 'Volume' },
          { role: 'heading', level: 2, text: 'Title' },
        ],
      },
    ]);
  });

  it('reads a boolean prop as the DOM property ren-dom sets does: any value but an empty one is true (security)', async () => {
    // ren-dom sets these as properties, so "false" is true and "" false, as in
    // a browser; a secret "false" is a password field, whose value never leaves.
    /** @type {[any, boolean][]} */
    const values = [['false', true], ['', false], [true, true]];
    for (const [value, set] of values) {
      // Each on an element that owns it as a DOM property: an input's disabled, required and readOnly, an Edit's invalid.
      for (const [prop, field] of [['disabled', 'disabled'], ['required', 'required'], ['readOnly', 'readonly'], ['invalid', 'invalid']]) {
        const nodes = await $json(() => (prop === 'invalid' ? <Edit aria-label="f" {...{ [prop]: value }} /> : <input aria-label="f" {...{ [prop]: value }} />));
        assert.deepEqual(nodes, [set ? { role: 'textbox', label: 'f', [field]: true } : { role: 'textbox', label: 'f' }], `${prop}=${JSON.stringify(value)}`);
      }
      const secret = await $json(() => <Edit aria-label="p" secret={value} value="pw" />);
      assert.deepEqual(secret, [set ? { role: 'textbox', label: 'p' } : { role: 'textbox', label: 'p', value: 'pw' }], `secret=${JSON.stringify(value)}`);
      const item = await $json(() => <View itemscope><Edit itemprop="code" secret={value} value="pw" /></View>);
      assert.equal(JSON.stringify(item).includes('pw'), !set, `itemprop secret=${JSON.stringify(value)}`);
    }
  });

  it('makes an item of any itemscope written, as a boolean attribute is there by its presence', async () => {
    const nodes = await $json(() => (
      <View>
        <View itemscope="false"><Label itemprop="a" text="1" /></View>
        <View itemscope="itemscope"><Label itemprop="b" text="2" /></View>
        <View itemscope={false}><Label itemprop="c" text="3" /></View>
      </View>
    ));
    assert.deepEqual(nodes, [{ item: { a: '1' } }, { item: { b: '2' } }, '3']);
  });

  it('keeps an output\'s value as its text, as the page holds it', async () => {
    const nodes = await $json(() => <form aria-label="f"><output value="42" name="sum" /></form>);
    assert.deepEqual(nodes, [{ role: 'form', label: 'f', children: [{ role: 'status', name: 'sum', text: '42' }] }]);
  });

  it('reads a textarea\'s defaultValue, and an output\'s value and defaultValue, as the text they write before the children', async () => {
    const Tag = (/** @type {string} */ tag) => /** @type {any} */ (tag);
    const Area = Tag('textarea');
    const Out = Tag('output');
    /** @type {[() => any, () => any][]} */
    const pairs = [
      [() => <Area aria-label="b" defaultValue="D">kid</Area>, () => <Area aria-label="b">Dkid</Area>],
      [() => <Out aria-label="b" value="V">kid</Out>, () => <Out aria-label="b">Vkid</Out>],
      [() => <Out aria-label="b" defaultValue="D">kid</Out>, () => <Out aria-label="b">Dkid</Out>],
      [() => <Out aria-label="b" value={null}>kid</Out>, () => <Out aria-label="b">kid</Out>],
      [() => <Area aria-label="b" defaultValue={null}>kid</Area>, () => <Area aria-label="b">kid</Area>],
    ];
    for (const [given, want] of pairs) assert.deepEqual(await $json(given), await $json(want), JSON.stringify(await $json(want)));
    // A textarea's value is the value typed: it alone shows.
    assert.deepEqual(await $json(() => <Area aria-label="b" value="v">kid</Area>), [{ role: 'textbox', label: 'b', value: 'v' }]);
  });

  it('reads progress and meter values as numbers, as the DOM does', async () => {
    const nodes = await $json(() => (
      <form>
        <progress value="3" max="10" />
        <meter value="0.5" min="0" max="1" />
      </form>
    ));
    assert.deepEqual(nodes, [{ role: 'form', children: [{ role: 'progressbar', value: 3 }, { role: 'meter', value: 0.5 }] }]);
  });

  it('reads a progress or meter value in its range, as its DOM property clamps it (the values Chrome reads)', async () => {
    /** @type {[() => any, number][]} */
    const cases = [
      [() => <progress value={-3} max={-1} />, 0],
      [() => <progress value={150} max={100} />, 100],
      [() => <progress max="100" value="150" />, 100],
      [() => <progress value={2} />, 1],
      [() => <progress value={0.5} max={0} />, 0.5],
      [() => <meter value={5} min={0} max={1} />, 1],
      [() => <meter value={-2} min={0} max={1} />, 0],
      [() => <meter value={5} min={3} max={1} />, 3],
      [() => <meter value={7} />, 1],
      [() => <meter min={2} value={1} />, 2],
      // A boolean or a blank string converts as the property's double does (Chrome 154 through ren-dom).
      [() => <progress value={true} />, 1],
      [() => <progress value={false} />, 0],
      [() => <progress value="" />, 0],
      [() => <progress value="   " />, 0],
      [() => <progress value={'\t\n'} />, 0],
      [() => <progress value=" 0.5 " />, 0.5],
      [() => <meter value={true} />, 1],
      [() => <meter value={false} />, 0],
      [() => <meter value="" />, 0],
      [() => <meter value="  " max={4} />, 0],
      [() => <meter value={true} max={4} />, 1],
    ];
    for (const [view, value] of cases) assert.equal((/** @type {any} */ (await $json(view)))[0].value, value, JSON.stringify(await $json(view)));
  });

  it('hides by the hidden prop as the DOM does: any truthy value hides', async () => {
    const nodes = await $json(() => (
      <View>
        <div hidden="hidden"><p>A</p></div>
        <div hidden=""><p>B</p></div>
        <div hidden="false"><p>C</p></div>
      </View>
    ));
    const text = JSON.stringify(nodes);
    assert.ok(!text.includes('"A"') && !text.includes('"C"'), `a truthy hidden hides: ${text}`);
    assert.ok(text.includes('"B"'), `an empty hidden shows, as the DOM property false: ${text}`);
  });

  it('leaves out what a browser does not show, text and elements, by every route: a closed dialog or details, display none, a datalist, media fallback', async () => {
    const view = () => (
      <div>
        <dialog>dialog text<p>dialog p</p></dialog>
        <dialog open>open dialog</dialog>
        <details>
          <summary>Shown summary</summary>
          details text<p>details p</p>
          <summary>second summary</summary>
        </details>
        <details open>
          <summary>Open</summary>open details
        </details>
        <p style={{ display: 'none' }}>object none</p>
        <p style="color: red; display: none">text none</p>
        <p style={{ display: 'block' }}>block</p>
        <p style="display: none; display: block">later block</p>
        <View style={{ display: 'contents' }}>contents</View>
        <datalist id="d"><option value="x">datalist option</option></datalist>
        <video>video fallback<p>video p</p></video>
        <audio>audio fallback</audio>
        <span id="far">far name</span>
        <details><summary>S</summary><span id="near">hidden name</span></details>
        <button aria-labelledby="near">b</button>
        <dialog><label for="f">Dialog label</label></dialog>
        <input id="f" value="v" />
      </div>
    );
    const nodes = await $json(view);
    assert.deepEqual(nodes, [
      { role: 'dialog', text: 'open dialog' },
      { role: 'group', children: [{ role: 'button', text: 'Shown summary' }] },
      { role: 'group', children: [{ role: 'button', text: 'Open' }, 'open details'] },
      { role: 'paragraph', text: 'block' },
      { role: 'paragraph', text: 'later block' },
      'contents',
      'far name',
      { role: 'group', children: [{ role: 'button', text: 'S' }] },
      // A hidden element still names what aria-labelledby points it at, as the accessible name reads it.
      { role: 'button', label: 'hidden name', text: 'b' },
      // A label in a closed dialog names nothing.
      { role: 'textbox', value: 'v' },
    ]);
  });

  it('shows content under an empty aria-hidden, as ARIA reads it as not set', async () => {
    const nodes = await $json(() => (
      <div>
        <p aria-hidden="">shown</p>
        <p aria-hidden="false">also shown</p>
        <p aria-hidden={true}>gone</p>
      </div>
    ));
    assert.deepEqual(nodes, [{ role: 'paragraph', text: 'shown' }, { role: 'paragraph', text: 'also shown' }]);
  });

  it('leaves out what does not show: hidden, aria-hidden, drawings, rules and images with no name', async () => {
    const nodes = await $json(() => (
      <View>
        <Label hidden text="secret" />
        <View aria-hidden="true"><Label text="decor" /></View>
        <Shape shapes={[{ kind: 'rect', fill: '#123' }]} />
        <hr />
        <Image source="/logo.png" label="Logo" />
        <Label text="shown" />
      </View>
    ));
    assert.deepEqual(nodes, [{ role: 'img', src: '/logo.png', alt: 'Logo' }, 'shown']);
  });

  it('keeps a marked drawing, names what a role is with aria-roledescription, and leaves out a role with nothing in it', async () => {
    const nodes = await $json(() => (
      <View role="figure" aria-label="Design">
        <Shape role="img" aria-roledescription="ellipse" aria-label="Sun" shapes={[{ kind: 'oval', fill: '#fc0' }]} />
        <View role="list" />
        <Label text="Weekly revenue" />
      </View>
    ));
    assert.deepEqual(nodes, [{ role: 'figure', label: 'Design', children: [{ role: 'img', roleDescription: 'ellipse', label: 'Sun' }, 'Weekly revenue'] }]);
  });

  it("renders a Label's styled runs as its text: the runs' texts joined, no styles", async () => {
    const nodes = await $json(() => <Label runs={[{ text: 'find ' }, { text: 'this', style: { background: '#ff0', fontWeight: 700 } }, { text: ' here', onPress: () => {} }]} />);
    assert.deepEqual(nodes, ['find this here']);
  });

  it('renders a nested root inside the view, and the Recover fallback of a failed task', async () => {
    const nodes = await $json(() => {
      const t = $task($active(), () => 1, (_, complete) => void setTimeout(() => complete({ ok: false, error: new Error('down') }), 1)); // timer: feature: the task stands for slow I/O
      return (
        <section>
          <Root id="inner" props="inside">{() => <Label text={() => $lookup(Props)} />}</Root>
          <Recover fallback={(/** @type {Error} */ e) => <p>failed: {e.message}</p>}>
            <p>{() => $read(t)}</p>
          </Recover>
        </section>
      );
    });
    assert.deepEqual(nodes, ['inside', { role: 'paragraph', text: 'failed: down' }]);
  });

  it("waits for a nested root's tasks too, and rejects with a nested root's failure", async () => {
    /** A task that completes after `ms`, in the running root. @param {any} value @param {number} ms */
    const slow = (value, ms) => $task($active(), () => 1, (_, complete) => void setTimeout(() => complete(value instanceof Error ? { ok: false, error: value } : { ok: true, value }), ms)); // timer: feature: the task stands for slow I/O
    /** @param {any} value @param {number} ms */
    const Inner = (value, ms) => () => {
      const t = slow(value, ms);
      return <Label text={() => String($read(t))} />;
    };
    const only = await $json(() => (
      <section>
        <Root id="inner">{Inner('inner-done', 20)}</Root>
        <Label text="outer" />
      </section>
    ));
    assert.deepEqual(only, ['inner-done', 'outer'], 'a task of the nested root only');
    const slower = await $json(() => {
      const o = slow('outer-done', 10);
      return (
        <section>
          <Root id="inner">{Inner('inner-done', 40)}</Root>
          <Label text={() => String($read(o))} />
        </section>
      );
    });
    assert.deepEqual(slower, ['inner-done', 'outer-done'], 'the nested root slower than the outer');
    await assert.rejects(
      $json(() => <Root id="inner">{Inner(new Error('inner down'), 5)}</Root>),
      /inner down/,
      "the nested root's failure",
    );
  });

  it('times out on a task that never completes', async () => {
    await assert.rejects(
      $json(() => {
        const t = $task($active(), () => 1, () => {});
        return <p>{() => $read(t)}</p>;
      }, { timeout: 30 }),
      /did not settle within 30 ms/,
    );
  });

  it('rejects with a failure a flush raises after a task completes', async () => {
    await assert.rejects($json(() => {
      const t = $task($active(), () => 1, (_, complete) => void Promise.resolve().then(() => complete({ ok: true, value: 5 })));
      $effect($active(), () => {
        if (!$pending(t) && $read(t) === 5) throw new Error('boom after load');
      });
      return null;
    }, { timeout: 500 }), /boom after load/);
  });

  it("keeps a live root's data: json() at any time, changed(nodes) after each flush", () => {
    /** @type {any[][]} */
    const seen = [];
    const host = $tree({ changed: nodes => seen.push(nodes) });
    /** @type {any} */
    let count = null;
    const root = Root({ id: 'live', renderer: host, storage: null, locks: null, children: () => {
      count = $signal($active(), 1);
      return <Label role="status" text={() => `count ${$read(count)}`} />;
    } });
    assert.deepEqual(host.json(), [{ role: 'status', text: 'count 1' }]);
    $write(count, 2);
    assert.deepEqual(host.json(), [{ role: 'status', text: 'count 2' }]);
    assert.deepEqual(seen.at(-1), [{ role: 'status', text: 'count 2' }], 'the change was reported');
    $dispose(root);
  });

  it('keeps dates, maps, sets and big integers an item holds as JSON data', async () => {
    const when = new Date(0);
    const nodes = await $json(() => (
      <View itemscope>
        <Label itemprop="when" content={when} text="then" />
        <Label itemprop="tags" content={new Set(['a', 'b'])} />
        <Label itemprop="map" content={new Map([['k', { at: when }]])} />
        <Label itemprop="big" content={2n ** 64n} />
      </View>
    ));
    const at = '1970-01-01T00:00:00.000Z';
    const expected = [{ item: { when: at, tags: ['a', 'b'], map: [['k', { at }]], big: '18446744073709551616' } }];
    assert.deepEqual(nodes, expected);
    assert.deepEqual(JSON.parse(JSON.stringify(nodes)), expected, 'the same after JSON');
  });

  it('leaves out a text once it goes away, and shows it again', () => {
    const host = $tree();
    /** @type {any} */
    let text = null;
    const root = Root({ id: 'gone', renderer: host, storage: null, locks: null, children: () => {
      text = $signal($active(), /** @type {string | undefined} */ ('x'));
      return <Label text={() => $read(text)} />;
    } });
    assert.deepEqual(host.json(), ['x']);
    $write(text, undefined);
    assert.deepEqual(host.json(), []);
    $write(text, 'y');
    assert.deepEqual(host.json(), ['y']);
    $dispose(root);
  });

  it('gives an item the itemprops of its meta and link elements, which show nothing', async () => {
    const nodes = await $json(() => (
      <div itemscope itemtype="https://schema.org/Product">
        <span itemprop="name">Lamp</span>
        <meta itemprop="price" content="25" />
        <link itemprop="availability" href="https://schema.org/InStock" />
        <meta name="robots" content="none" />
      </div>
    ));
    assert.deepEqual(nodes, [{ item: { '@type': 'Product', name: 'Lamp', price: '25', availability: 'https://schema.org/InStock' } }]);
  });

  it('keeps the text of a label whose for names no element', async () => {
    const nodes = await $json(() => (
      <form aria-label="f">
        <label for="nope">Shipping notes</label>
        <input id="other" />
      </form>
    ));
    assert.deepEqual(nodes, [{ role: 'form', label: 'f', text: 'Shipping notes' }]);
  });

  it('keeps a header and an itemprop named __proto__ as keys of their own', async () => {
    const nodes = await $json(() => (
      <div>
        <table>
          <tr><th>__proto__</th><th>b</th></tr>
          <tr><td>1</td><td>2</td></tr>
        </table>
        <table>
          <tr><th scope="row">__proto__</th><td>x</td></tr>
        </table>
        <div itemscope><span itemprop="__proto__">y</span></div>
      </div>
    ));
    assert.deepEqual(JSON.parse(JSON.stringify(nodes)), [
      { role: 'table', columns: ['__proto__', 'b'], rows: [JSON.parse('{"__proto__":"1","b":"2"}')] },
      { role: 'table', rows: JSON.parse('{"__proto__":"x"}') },
      { item: JSON.parse('{"__proto__":"y"}') },
    ]);
    assert.equal(Object.getPrototypeOf(/** @type {any} */ (nodes[2]).item), Object.prototype);
  });

  it('is a Host of its own for any root', () => {
    const host = $tree();
    Root({ id: 'data', renderer: host, storage: null, locks: null, children: <b>x</b> });
    assert.equal(host.kind, 'json');
    assert.deepEqual(host.json(), ['x']);
  });

  it('renders a root of its own when called from inside a running view', async () => {
    /** @type {Promise<any> | null} */
    let pending = null;
    const outer = Root({ id: 'outer', renderer: $tree(), storage: null, locks: null, children: () => {
      pending = $json(() => <Label text="inside a view" />);
      return <b>outer</b>;
    } });
    assert.deepEqual(await pending, ['inside a view']);
    void outer;
  });

  it('reports a change inside a nested <Root> through the outer changed', () => {
    /** @type {any[]} */
    const seen = [];
    const host = $tree({ changed: nodes => seen.push(nodes) });
    /** @type {any} */
    let count = null;
    const root = Root({ id: 'live', renderer: host, storage: null, locks: null, children: () => (
      <View><Root id="inner">{() => { count = $signal($active(), 1); return <Label role="status" text={() => `n ${$read(count)}`} />; }}</Root></View>
    ) });
    const before = seen.length;
    $write(count, 2);
    assert.ok(seen.length > before);
    assert.deepEqual(seen.at(-1), host.json());
    assert.match(JSON.stringify(seen.at(-1)), /n 2/);
    $dispose(root);
  });

  it("keeps an own __proto__ key in a copied prop value", async () => {
    const p = JSON.parse('{"__proto__": {"k": 1}, "b": 2}');
    const out = await $json(() => <View itemscope><Label itemprop="p" content={p} /></View>);
    const text = JSON.stringify(out);
    assert.match(text, /"__proto__":\{"k":1\}/);
    assert.match(text, /"b":2/);
  });
});
