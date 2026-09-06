/**
 * views/controls.js — reusable, accessible control widgets.
 *
 * Each widget is self-contained: it updates its own value read-out locally and
 * calls an onInput/onChange callback. Views wire those callbacks to the store.
 * Because the widgets persist while only output panels re-render, dragging a
 * slider or typing in the message box never loses focus.
 */

import { el, div, span } from './dom.js';
import { utf8ByteLength, truncateToByteLimit } from '../utils/utf8.js';

let uid = 0;
const nextId = (p) => `${p}-${++uid}`;

/** Labelled range slider with a live value read-out. */
export function slider({ label, min, max, step = 1, value, unit = '', format, help, onInput, disabled }) {
  const id = nextId('sl');
  const fmt = format || ((v) => `${v}${unit ? ` ${unit}` : ''}`);
  const out = el('output', { class: 'ctrl-value mono', for: id, text: fmt(value) });
  const input = el('input', {
    type: 'range', min, max, step, value, id, class: 'ctrl-range',
    disabled: disabled ? true : false,
    attrs: help ? { 'aria-describedby': `${id}-help` } : {},
    on: { input: (e) => { const v = Number(e.target.value); out.textContent = fmt(v); onInput && onInput(v); } },
  });
  return div({ class: `ctrl${disabled ? ' is-disabled' : ''}` },
    div({ class: 'ctrl-head' }, el('label', { for: id, text: label }), out),
    input,
    help ? el('p', { class: 'ctrl-help', id: `${id}-help`, text: help }) : null);
}

/** Switch-style toggle. */
export function toggle({ label, checked, onChange, help }) {
  const id = nextId('tg');
  const input = el('input', {
    type: 'checkbox', id, class: 'switch-input', checked: checked ? true : false,
    on: { change: (e) => onChange && onChange(e.target.checked) },
  });
  return div({ class: 'ctrl ctrl-toggle' },
    el('label', { class: 'switch', for: id },
      input,
      span({ class: 'switch-track', 'aria-hidden': 'true' }, span({ class: 'switch-thumb' })),
      span({ class: 'switch-label', text: label })),
    help ? el('p', { class: 'ctrl-help', text: help }) : null);
}

/** Dropdown select. Pass `ariaLabel` when there is no visible `label`. */
export function select({ label, options, value, onChange, help, ariaLabel }) {
  const id = nextId('se');
  const sel = el('select', {
    id, class: 'ctrl-select',
    attrs: (!label && ariaLabel) ? { 'aria-label': ariaLabel } : {},
    on: { change: (e) => onChange && onChange(e.target.value) },
  }, ...options.map((o) => el('option', { value: o.value, selected: o.value === value ? true : false, text: o.label })));
  return div({ class: 'ctrl' },
    label ? el('label', { for: id, text: label }) : null,
    sel,
    help ? el('p', { class: 'ctrl-help', text: help }) : null);
}

/** Segmented radio group (used for view mode and the storage field). */
export function segmented({ name, label, options, value, onChange, size }) {
  const group = div({ class: `segmented${size === 'sm' ? ' seg-sm' : ''}`, attrs: { role: 'radiogroup', 'aria-label': label } });
  for (const o of options) {
    const id = nextId('sg');
    const input = el('input', {
      type: 'radio', name, id, value: o.value, class: 'seg-input',
      checked: o.value === value ? true : false,
      on: { change: () => onChange && onChange(o.value) },
    });
    const lab = el('label', { class: 'seg-btn', for: id },
      o.icon ? span({ class: 'seg-icon', 'aria-hidden': 'true', text: o.icon }) : null,
      span({ text: o.label }));
    group.appendChild(input);
    group.appendChild(lab);
  }
  return group;
}

/** Button. */
export function button({ label, onClick, variant = '', icon, type = 'button', title }) {
  return el('button', { type, class: `btn ${variant}`.trim(), attrs: title ? { title } : {}, on: { click: onClick } },
    icon ? span({ class: 'btn-icon', 'aria-hidden': 'true', text: icon }) : null,
    span({ text: label }));
}

/**
 * Toy-message text input with a live byte counter that enforces the limit.
 */
export function messageInput({ value, maxBytes, onInput, label = 'Hidden message', hint }) {
  const id = nextId('msg');
  const counter = el('span', { class: 'msg-counter mono', id: `${id}-counter` });
  const update = (v) => {
    const b = utf8ByteLength(v);
    counter.textContent = `${b}/${maxBytes} B`;
    counter.classList.toggle('at-limit', b >= maxBytes);
  };
  const input = el('input', {
    type: 'text', id, class: 'msg-input mono', value,
    attrs: { spellcheck: 'false', autocomplete: 'off', 'aria-describedby': `${id}-counter`, maxlength: String(maxBytes * 2) },
    on: {
      input: (e) => {
        let v = e.target.value;
        if (utf8ByteLength(v) > maxBytes) { v = truncateToByteLimit(v, maxBytes); e.target.value = v; }
        update(v);
        onInput && onInput(v);
      },
    },
  });
  update(value);
  return div({ class: 'ctrl msg-field' },
    div({ class: 'ctrl-head' }, el('label', { for: id, text: label }), counter),
    input,
    hint ? el('p', { class: 'ctrl-help', text: hint }) : null);
}

/** Group of controls under an optional heading. */
export function controlGroup(title, ...children) {
  return el('div', { class: 'control-group' },
    title ? el('h4', { class: 'control-group-title', text: title }) : null,
    ...children);
}

/** A three-column-friendly panel wrapper. */
export function panel(kind, ...children) {
  return el('div', { class: `panel panel-${kind}` }, ...children);
}
