// A details case of test/fixtures/details.json as a view (the builder of
// ren-html's test/fixtures/details-view.jsx, whose scripts/details-oracle.mjs
// records the file): details (`name`, `open`) in divs and in each other,
// each prop given only when the case has it, each summary its id, and after
// it a paragraph `<id> inside`, which shows only while the details is open.
// A details a step opens, closes or renames binds that
// prop to a signal, and one or a div that comes in later is shown by one;
// `apply` writes a step.

import { $signal, $read, $write } from 'rrx-core';
import { Show, $active } from 'ren-core';

/**
 * @typedef {{ id: string, details: true, name?: string | number, open?: boolean, later?: boolean, children?: Node[] }} Details
 * @typedef {{ id: string, div: true, children: Node[], later?: boolean }} Div
 * @typedef {Details | Div} Node
 * @typedef {{ open?: string, close?: string, rename?: string, to?: string, show?: boolean }} Step
 * @typedef {{ name: string, tree: Node[], steps?: Step[] }} Case
 */

/**
 * The case's view, and `apply` for its steps.
 * @param {Case} c
 * @returns {{ View: () => any, apply: (step: Step) => void }}
 */
export function detailsCase(c) {
  const steps = c.steps ?? [];
  /** @type {Record<string, any>} */
  const opens = {};
  /** @type {Record<string, any>} */
  const names = {};
  /** @type {any} */
  let shown = null;
  /** @param {Node} n @returns {any} */
  const node = n => {
    const children = (n.children ?? []).map(node);
    let el;
    if ('div' in n) el = <div id={n.id}>{children}</div>;
    else {
      /** @type {Record<string, any>} */
      const props = {};
      if (steps.some(s => s.rename === n.id)) {
        names[n.id] = $signal($active(), n.name);
        props.name = () => $read(names[n.id]);
      } else if (n.name !== undefined) props.name = n.name;
      if (steps.some(s => s.open === n.id || s.close === n.id)) {
        opens[n.id] = $signal($active(), n.open ?? false);
        props.open = () => $read(opens[n.id]);
      } else if (n.open !== undefined) props.open = n.open;
      el = <details {...props}><summary>{n.id}</summary><p>{`${n.id} inside`}</p>{children}</details>;
    }
    return n.later === true ? <Show when={() => $read(shown)}>{el}</Show> : el;
  };
  const View = () => {
    shown = $signal($active(), false);
    return <div>{c.tree.map(node)}</div>;
  };
  const apply = (/** @type {Step} */ step) => {
    if (step.open !== undefined) $write(opens[step.open], true);
    if (step.close !== undefined) $write(opens[step.close], false);
    if (step.rename !== undefined) $write(names[step.rename], step.to);
    if (step.show === true) $write(shown, true);
  };
  return { View, apply };
}
