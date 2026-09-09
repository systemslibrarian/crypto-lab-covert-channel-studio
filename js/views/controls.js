/**
 * views/controls.js — reusable, accessible control widgets.
 *
 * Each widget is self-contained: it updates its own value read-out locally and
 * calls an onInput/onChange callback. Views wire those callbacks to the store.
 * Because the widgets persist while only output panels re-render, dragging a
 * slider or typing in the message box never loses focus.
 */

import { el, div, span, setNotice } from './dom.js';
import { utf8ByteLength, truncateToByteLimit } from '../utils/utf8.js';

let uid = 0;
const nextId = (p) => `${p}-${++uid}`;

/**
 * Labelled range slider with a live value read-out.
 *
 * Two accessibility details are load-bearing here.
 *
 * 1. `aria-valuetext`. Six sliders format a 0..1 fraction as a percentage and
 *    several append a unit, so without it a screen reader announced "0.06" and
 *    "600" while the label beside them read "6%" and "600 ms" — the exposed
 *    value contradicted the presented one (4.1.2 / 1.3.1). It is set at
 *    construction and updated in the same handler that updates the read-out.
 * 2. The read-out is an `<output>`, which HTML-AAM maps to role=status with an
 *    implicit polite live region. Left exposed it announced the formatted value
 *    a second time on every step of a drag, competing with the section's real
 *    status region, so it is hidden from assistive technology now that
 *    aria-valuetext carries the same string on the input itself.
 *
 * `ref`, when passed, is filled with { input, help, node } so a view can update
 * live state (a `disabled` that depends on another control) WITHOUT rebuilding
 * the control and dropping focus.
 */
export function slider({ label, min, max, step = 1, value, unit = '', format, help, onInput, disabled, ref }) {
  const id = nextId('sl');
  // Several callers pass a unit that already carries its own leading space
  // (' lux', ' cycles'); trimming keeps the read-out — and now the announced
  // value — from reading "220  lux".
  const u = String(unit || '').trim();
  const fmt = format || ((v) => `${v}${u ? ` ${u}` : ''}`);
  const out = el('output', { class: 'ctrl-value mono', for: id, text: fmt(value), attrs: { 'aria-hidden': 'true' } });
  const helpId = help ? `${id}-help` : null;
  const input = el('input', {
    type: 'range', min, max, step, value, id, class: 'ctrl-range',
    disabled: disabled ? true : false,
    attrs: helpId ? { 'aria-valuetext': fmt(value), 'aria-describedby': helpId } : { 'aria-valuetext': fmt(value) },
    on: {
      input: (e) => {
        const v = Number(e.target.value);
        const text = fmt(v);
        out.textContent = text;
        e.target.setAttribute('aria-valuetext', text);
        onInput && onInput(v);
      },
    },
  });
  const helpEl = help ? el('p', { class: 'ctrl-help', id: helpId, text: help }) : null;
  const node = div({ class: `ctrl${disabled ? ' is-disabled' : ''}` },
    div({ class: 'ctrl-head' }, el('label', { for: id, text: label }), out),
    input,
    helpEl);
  if (ref) { ref.input = input; ref.help = helpEl; ref.node = node; ref.format = fmt; }
  return node;
}

/**
 * Switch-style toggle.
 * The help text is associated through aria-describedby, matching slider(). In
 * the Active Warden Lab that text is `${action.what} — Cost: ${action.cost}`,
 * the entire pedagogical point of the switch, and in forms mode an unassociated
 * paragraph is never reached (3.3.2).
 */
export function toggle({ label, checked, onChange, help, ref }) {
  const id = nextId('tg');
  const helpId = help ? `${id}-help` : null;
  const input = el('input', {
    type: 'checkbox', id, class: 'switch-input', checked: checked ? true : false,
    attrs: helpId ? { 'aria-describedby': helpId } : {},
    on: { change: (e) => onChange && onChange(e.target.checked) },
  });
  const helpEl = help ? el('p', { class: 'ctrl-help', id: helpId, text: help }) : null;
  const node = div({ class: 'ctrl ctrl-toggle' },
    el('label', { class: 'switch', for: id },
      input,
      span({ class: 'switch-track', 'aria-hidden': 'true' }, span({ class: 'switch-thumb' })),
      span({ class: 'switch-label', text: label })),
    helpEl);
  if (ref) { ref.input = input; ref.help = helpEl; ref.node = node; }
  return node;
}

/** Dropdown select. Pass `ariaLabel` when there is no visible `label`. */
export function select({ label, options, value, onChange, help, ariaLabel }) {
  const id = nextId('se');
  const helpId = help ? `${id}-help` : null;
  const attrs = {};
  if (!label && ariaLabel) attrs['aria-label'] = ariaLabel;
  if (helpId) attrs['aria-describedby'] = helpId;
  const sel = el('select', {
    id, class: 'ctrl-select',
    attrs,
    on: { change: (e) => onChange && onChange(e.target.value) },
  }, ...options.map((o) => el('option', { value: o.value, selected: o.value === value ? true : false, text: o.label })));
  return div({ class: 'ctrl' },
    label ? el('label', { for: id, text: label }) : null,
    sel,
    help ? el('p', { class: 'ctrl-help', id: helpId, text: help }) : null);
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
 *
 * The limit still holds — the model has to stay bounded — but it is no longer
 * enforced silently. Pasting 52 bytes discarded 28 of them, and typing into a
 * full field deleted a character from the TAIL and threw the caret to the end,
 * with an amber counter as the only signal: user input rejected, automatically
 * detected, and neither identified nor described (3.3.1). The notice node below
 * pre-exists as a polite status region — it has to, because a live region
 * inserted together with its text is not reliably announced — and is written to
 * only when bytes were actually dropped, then cleared on the next clean edit.
 *
 * `describedBy` appends an external id (the stego payload-capacity error);
 * `ref` is filled with { input } so a view can set aria-invalid on it.
 */
export function messageInput({ value, maxBytes, onInput, label = 'Hidden message', hint, describedBy, ref }) {
  const id = nextId('msg');
  const counterId = `${id}-counter`;
  const hintId = hint ? `${id}-hint` : null;
  const noticeId = `${id}-notice`;
  const counter = el('span', { class: 'msg-counter mono', id: counterId });
  const notice = el('p', {
    class: 'ctrl-help msg-notice visually-hidden', id: noticeId,
    // Not colour alone: the sentence itself says what happened.
    style: { color: 'var(--warn)' },
    attrs: { role: 'status', 'aria-live': 'polite' },
  });
  const update = (v) => {
    const b = utf8ByteLength(v);
    counter.textContent = `${b}/${maxBytes} B`;
    counter.classList.toggle('at-limit', b >= maxBytes);
  };
  const describedIds = [counterId, hintId, noticeId, describedBy].filter(Boolean).join(' ');
  const input = el('input', {
    type: 'text', id, class: 'msg-input mono', value,
    attrs: { spellcheck: 'false', autocomplete: 'off', 'aria-describedby': describedIds, maxlength: String(maxBytes * 2) },
    on: {
      input: (e) => {
        const raw = e.target.value;
        let v = raw;
        if (utf8ByteLength(raw) > maxBytes) {
          v = truncateToByteLimit(raw, maxBytes);
          const dropped = utf8ByteLength(raw) - utf8ByteLength(v);
          const caret = typeof e.target.selectionStart === 'number' ? e.target.selectionStart : null;
          e.target.value = v;
          // Rewriting .value collapses the caret to the end, which is what made
          // editing the middle of a full message jump. Put it back where it was.
          if (caret != null && typeof e.target.setSelectionRange === 'function') {
            const pos = Math.min(caret, v.length);
            try { e.target.setSelectionRange(pos, pos); } catch { /* some inputs refuse */ }
          }
          setNotice(notice, `Trimmed to the ${maxBytes}-byte limit; ${dropped} byte${dropped === 1 ? '' : 's'} removed.`);
        } else if (notice.textContent) {
          setNotice(notice, '');
        }
        update(v);
        onInput && onInput(v);
      },
    },
  });
  update(value);
  if (ref) { ref.input = input; ref.notice = notice; }
  return div({ class: 'ctrl msg-field' },
    div({ class: 'ctrl-head' }, el('label', { for: id, text: label }), counter),
    input,
    hint ? el('p', { class: 'ctrl-help', id: hintId, text: hint }) : null,
    notice);
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
