// A select case of test/fixtures/select.json as a view (the same builder in
// ren-html's test/fixtures/select-view.jsx, whose scripts/select-oracle.mjs
// records the file): a select with its `value`, `multiple` and `size`, its
// options, optgroups (`disabled` too) and wrapping divs (`wrap`), each prop
// given only when the case has it (`attribute`: selected as an attribute,
// not the property), and `ref` on the select. A case with steps binds the
// value and the options to signals, the options in a For by their ids, and
// `multiple` or `size` too when a step sets it; `apply` writes a step's
// value, options, multiple or size (a step that picks is the user's, on the
// DOM).

import { $signal, $read, $write } from 'rrx-core';
import { For, $active } from 'ren-core';

/**
 * @typedef {{ id: string, value?: string, text?: string, selected?: boolean, attribute?: boolean, disabled?: boolean, group?: string, wrap?: boolean, options?: Spec[] }} Spec
 * @typedef {{ value?: string | null, options?: Spec[], pick?: number, multiple?: boolean, size?: number }} Step
 * @typedef {{ name: string, multiple?: boolean, size?: number, value?: string, options: Spec[], steps?: Step[] }} Case
 */

/** An option, an optgroup or a div around options. @param {Spec} o @returns {any} */
function node(o) {
  if (o.group !== undefined) return <optgroup label={o.group} {...(o.disabled === undefined ? {} : { disabled: o.disabled })}>{(o.options ?? []).map(node)}</optgroup>;
  if (o.wrap === true) return <div>{(o.options ?? []).map(node)}</div>;
  /** @type {Record<string, any>} */
  const props = {};
  if (o.value !== undefined) props.value = o.value;
  if (o.selected !== undefined) props.selected = o.selected;
  // An attribute's name as a prop no DOM property has: ren-dom sets it as the attribute (HTML lowercases it).
  if (o.attribute === true) props.SELECTED = '';
  if (o.disabled !== undefined) props.disabled = o.disabled;
  return <option {...props}>{o.text ?? o.value ?? ''}</option>;
}

/**
 * The case's view, and `apply` for its steps.
 * @param {Case} c @param {(el: any) => void} ref
 * @returns {{ View: () => any, apply: (step: Step) => void }}
 */
export function selectCase(c, ref) {
  /** @type {Record<string, any>} */
  const props = { ref };
  if (c.multiple !== undefined) props.multiple = c.multiple;
  if (c.size !== undefined) props.size = c.size;
  if (c.steps === undefined) {
    if (c.value !== undefined) props.value = c.value;
    return { View: () => <select {...props}>{c.options.map(node)}</select>, apply: () => {} };
  }
  /** @type {any} */ let value;
  /** @type {any} */ let list;
  /** @type {Record<string, any>} */
  const flags = {};
  const View = () => {
    value = $signal($active(), c.value);
    list = $signal($active(), c.options);
    // multiple and size bound only when a step sets them.
    for (const key of /** @type {const} */ (['multiple', 'size']))
      if (c.steps?.some(s => key in s)) {
        flags[key] = $signal($active(), c[key]);
        props[key] = () => $read(flags[key]);
      }
    return <select {...props} value={() => $read(value)}><For each={list} by={(/** @type {Spec} */ o) => o.id}>{(/** @type {() => Spec} */ o) => node(o())}</For></select>;
  };
  const apply = (/** @type {Step} */ step) => {
    if ('value' in step) $write(value, step.value);
    if (step.options !== undefined) $write(list, step.options);
    for (const key of /** @type {const} */ (['multiple', 'size'])) if (key in step) $write(flags[key], step[key]);
  };
  return { View, apply };
}
