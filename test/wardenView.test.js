/**
 * wardenView.test.js — a view-level gate for the Active Warden section.
 *
 * The a11y gate renders every view once, in its DEFAULT state. That is not
 * enough for this section, because the interesting states are behind the
 * switches: `runWarden` returns a verdict per channel, `wardenView` looks each
 * one up in a fixed VERDICT table, and a verdict the model can produce but the
 * table has never heard of takes the whole section down with a TypeError on
 * `.pill`.
 *
 * That is not hypothetical. When 'rate-limited' was added to the model and not
 * to the view, flipping the PCAW switch on its own — the exact interaction the
 * card's copy tells the reader to perform first — threw. "Enable every action"
 * did not, because the egress allow-list overrides the throttle and the hopping
 * row comes back 'closed', so the bulk button hid the bug from every test that
 * looked.
 *
 * These tests therefore do what a reader does: flip each switch alone, then all
 * of them, and assert nothing throws and nothing goes missing from the summary.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDomShim, walk, renderedText } from './dom-shim.js';

installDomShim();

const { getState } = await import('../js/state.js');
const { renderWardenView } = await import('../js/views/wardenView.js');
const { runWarden, WARDEN_ACTIONS, WARDEN_CHANNELS } = await import('../js/analysis/warden.js');

/** Every checkbox in the rendered section, in DOM order — one per warden action. */
function switchesOf(node) {
  return walk(node, (n) => n.tagName === 'INPUT' && n.getAttribute('type') === 'checkbox');
}

/** Flip one checkbox and run its change listeners, exactly as a click would. */
function flip(input, value) {
  input.checked = value;
  for (const fn of input._listeners.change || []) fn({ target: input });
}

test('every switch can be flipped on its own without throwing', () => {
  const { node } = renderWardenView(getState());
  const inputs = switchesOf(node);
  assert.equal(inputs.length, WARDEN_ACTIONS.length,
    'one switch per warden action');

  for (let i = 0; i < inputs.length; i++) {
    const label = WARDEN_ACTIONS[i].key;
    assert.doesNotThrow(() => flip(inputs[i], true),
      `enabling '${label}' alone must not throw — every verdict runWarden can return needs a VERDICT entry`);
    assert.doesNotThrow(() => flip(inputs[i], false),
      `disabling '${label}' must not throw`);
  }
});

test('every switch can be flipped on with the others already on', () => {
  const { node } = renderWardenView(getState());
  const inputs = switchesOf(node);
  for (let i = 0; i < inputs.length; i++) {
    assert.doesNotThrow(() => flip(inputs[i], true), `cumulative enable of switch ${i}`);
  }
  for (let i = 0; i < inputs.length; i++) {
    assert.doesNotThrow(() => flip(inputs[i], false), `cumulative disable of switch ${i}`);
  }
});

test('the rate-limited verdict is reachable and reaches the reader as words', () => {
  const state = getState();
  const pcaw = WARDEN_ACTIONS.findIndex((a) => a.patch.hopping && a.patch.hopping.gapMs);
  assert.ok(pcaw >= 0, 'the PCAW action should still be present');

  const res = runWarden(state.message, { seed: `${state.seed}:warden`, active: [WARDEN_ACTIONS[pcaw].key] });
  assert.ok(res.rows.some((r) => r.verdict === 'rate-limited'),
    'the PCAW switch alone should produce a rate-limited row — if not, this test has stopped guarding anything');

  const { node } = renderWardenView(state);
  flip(switchesOf(node)[pcaw], true);
  const text = renderedText(node);
  assert.match(text, /Rate-limited/,
    'the verdict must render as a label, not as an undefined lookup');
  assert.match(text, /just more slowly|Throttled, not closed/,
    'and it must say what the verdict means, so it is not read as a smaller "closed"');
});

test('the outcome tiles account for every channel, whatever is switched on', () => {
  const state = getState();
  const combos = [[], WARDEN_ACTIONS.map((a) => a.key), ...WARDEN_ACTIONS.map((a) => [a.key])];
  for (const active of combos) {
    const { counts } = runWarden(state.message, { seed: `${state.seed}:warden`, active });
    const tiled = (counts.closed || 0)
      + (counts.residual || 0)
      + (counts['rate-limited'] || 0)
      + (counts.survives || 0) + (counts.untouched || 0)
      + (counts['out-of-path'] || 0);
    assert.equal(tiled, WARDEN_CHANNELS.length,
      `the outcome tiles must sum to every channel; with [${active.join(', ')}] active they sum to ${tiled} of ${WARDEN_CHANNELS.length}. A new verdict has been added to the model without a tile in wardenView.`);
  }
});

test('nothing carrying zero capacity is ever reported as rate-limited', () => {
  // The zero-baseline inversion. `verdictFor` is module-private, so this asserts
  // the invariant that guard exists to hold: "rate-limited" claims every bit
  // still arrives, so a channel with no capacity before or after must never
  // earn it. The honest verdict there is 'closed'.
  const state = getState();
  const combos = [[], WARDEN_ACTIONS.map((a) => a.key), ...WARDEN_ACTIONS.map((a) => [a.key])];
  for (const active of combos) {
    for (const r of runWarden(state.message, { seed: `${state.seed}:warden`, active }).rows) {
      if (r.verdict !== 'rate-limited') continue;
      assert.ok(r.before.residualBps > 0,
        `${r.label} is reported rate-limited from a zero baseline — that verdict claims every bit still arrives`);
      assert.ok(r.after.residualBps > 0,
        `${r.label} is reported rate-limited with nothing left — that is 'closed'`);
    }
  }
});
