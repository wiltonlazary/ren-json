// A radio case of test/fixtures/radio.json as a view (the same builder in
// ren-html's test/fixtures/radio-view.jsx, whose scripts/radio-oracle.mjs
// records the file): radios (`name`, `checked`, a `form` attribute) in forms and
// divs, each prop given only when the case has it, each radio's value its
// id. A radio a step checks, unchecks or renames binds that prop to a
// signal, and a box whose id a step changes binds its id; a radio or box
// that comes in later is shown by one, and one a step removes is held by
// its own; `apply` writes a step.

import { $signal, $read, $write } from 'rrx-core';
import { Show, $active } from 'ren-core';

/**
 * @typedef {{ id: string, name?: string | number, checked?: boolean, form?: string | number, later?: boolean }} Radio
 * @typedef {{ id: string, box: 'form' | 'div', children: Node[], later?: boolean }} Box
 * @typedef {Radio | Box} Node
 * @typedef {{ check?: string, uncheck?: string, rename?: string, to?: string, show?: boolean, remove?: string, removeBox?: string, reid?: string }} Step
 * @typedef {{ name: string, tree: Node[], steps?: Step[] }} Case
 */

/**
 * The case's view, and `apply` for its steps.
 * @param {Case} c
 * @returns {{ View: () => any, apply: (step: Step) => void }}
 */
export function radioCase(c) {
  const steps = c.steps ?? [];
  /** @type {Record<string, any>} */
  const checked = {};
  /** @type {Record<string, any>} */
  const names = {};
  /** @type {Record<string, any>} */
  const ids = {};
  /** @type {Record<string, any>} */
  const kept = {};
  /** @type {any} */
  let shown = null;
  /** A node a step removes, held while its signal is true. @param {string} key @param {any} el */
  const held = (key, el) => {
    kept[key] = $signal($active(), true);
    return <Show when={() => $read(kept[key])}>{el}</Show>;
  };
  /** @param {Node} n @returns {any} */
  const node = n => {
    if ('box' in n) {
      const children = n.children.map(node);
      /** @type {any} */
      let id = n.id;
      if (steps.some(s => s.reid === n.id)) {
        ids[n.id] = $signal($active(), n.id);
        id = () => $read(ids[n.id]);
      }
      const box = n.box === 'form' ? <form id={id}>{children}</form> : <div id={id}>{children}</div>;
      if (steps.some(s => s.removeBox === n.id)) return held(`box ${n.id}`, box);
      return n.later === true ? <Show when={() => $read(shown)}>{box}</Show> : box;
    }
    /** @type {Record<string, any>} */
    const props = { type: 'radio', value: n.id };
    if (steps.some(s => s.rename === n.id)) {
      names[n.id] = $signal($active(), n.name);
      props.name = () => $read(names[n.id]);
    } else if (n.name !== undefined) props.name = n.name;
    if (steps.some(s => s.check === n.id || s.uncheck === n.id)) {
      checked[n.id] = $signal($active(), n.checked ?? false);
      props.checked = () => $read(checked[n.id]);
    } else if (n.checked !== undefined) props.checked = n.checked;
    if (n.form !== undefined) props.form = n.form;
    const input = <input {...props} />;
    if (steps.some(s => s.remove === n.id)) return held(n.id, input);
    return n.later === true ? <Show when={() => $read(shown)}>{input}</Show> : input;
  };
  const View = () => {
    shown = $signal($active(), false);
    return <div>{c.tree.map(node)}</div>;
  };
  const apply = (/** @type {Step} */ step) => {
    if (step.check !== undefined) $write(checked[step.check], true);
    if (step.uncheck !== undefined) $write(checked[step.uncheck], false);
    if (step.rename !== undefined) $write(names[step.rename], step.to);
    if (step.show === true) $write(shown, true);
    if (step.remove !== undefined) $write(kept[step.remove], false);
    if (step.removeBox !== undefined) $write(kept[`box ${step.removeBox}`], false);
    if (step.reid !== undefined) $write(ids[step.reid], step.to);
  };
  return { View, apply };
}
