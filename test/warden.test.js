/**
 * Tests for js/analysis/warden.js — the Active Warden / Normalizer Laboratory.
 *
 * The lab's value is that its verdicts are MEASURED by re-running the real
 * simulation, not looked up from a table, so these tests pin the three results
 * the module exists to teach:
 *
 *   1. Each normaliser action closes exactly the carrier it targets and leaves
 *      every other in-path carrier alone. This is driven from WARDEN_ACTIONS
 *      itself rather than a hardcoded expectation, so adding an action cannot
 *      quietly acquire side effects on channels it never named.
 *   2. Turning everything on still leaves the timing channel as a RESIDUAL
 *      channel. Shaping blurs a gap; it cannot delete one.
 *   3. The air-gap and shared-cache carriers are 'out-of-path' no matter what
 *      is switched on, because a normaliser rewrites packets and neither of
 *      those carriers is made of packets.
 *   4. The PCAW is a THROTTLE, not a normaliser: it lowers the hopping
 *      channel's bitrate without touching a single bit. The tests below pin
 *      that as a property — capacity strictly down, error rate NOT up, message
 *      still decoding — because it is the one place in the lab where those
 *      three can be true at once, and the 'rate-limited' verdict exists only to
 *      keep it from being scored as damage.
 *
 * Also locked down: residual capacity is reported as zero at or past a coin
 * flip. A textbook binary symmetric channel credits fully-inverted bits with
 * full capacity, which would be the wrong model here — the errors are a mix of
 * flips, erasures and desynchronisation, and a receiver at p ≥ 0.5 cannot tell
 * an inverted channel from a destroyed one.
 *
 * Node built-in runner only. Deterministic: every run is seeded.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runWarden, WARDEN_ACTIONS, WARDEN_CHANNELS } from '../js/analysis/warden.js';
import { binaryEntropy } from '../js/utils/statistics.js';

const MESSAGE = 'HELLO WORLD';
const SEED = 'warden-test';
const ALL_ACTIONS = WARDEN_ACTIONS.map((a) => a.key);

const run = (active) => runWarden(MESSAGE, { seed: SEED, active });
const byChannel = (res) => Object.fromEntries(res.rows.map((r) => [r.channel, r]));

/** Carriers a network warden is actually positioned to act on. */
const IN_PATH = WARDEN_CHANNELS.filter((c) => c.inPath).map((c) => c.key);
const OUT_OF_PATH = WARDEN_CHANNELS.filter((c) => !c.inPath).map((c) => c.key);

// ---------------------------------------------------------------------------
// Shape and determinism
// ---------------------------------------------------------------------------

test('the lab covers every declared channel and reports a verdict for each', () => {
  const res = run(ALL_ACTIONS);
  assert.equal(res.rows.length, WARDEN_CHANNELS.length);
  assert.deepEqual(res.rows.map((r) => r.channel), WARDEN_CHANNELS.map((c) => c.key));
  for (const r of res.rows) {
    assert.ok(typeof r.verdict === 'string' && r.verdict.length > 0);
    assert.ok(Number.isFinite(r.before.residualBps));
    assert.ok(Number.isFinite(r.after.residualBps));
    assert.ok(Number.isFinite(r.observabilityDelta));
  }
  assert.ok(OUT_OF_PATH.length >= 2, 'at least the air-gap and cache carriers sit off-path');
});

test('determinism: two runs with the same arguments are deeply equal', () => {
  assert.deepEqual(run(ALL_ACTIONS), run(ALL_ACTIONS));
  assert.deepEqual(run(['shapeTiming']), run(['shapeTiming']));
  assert.deepEqual(run([]), run([]));
});

test('every action names at least one channel, and only known channels', () => {
  const known = new Set(WARDEN_CHANNELS.map((c) => c.key));
  for (const a of WARDEN_ACTIONS) {
    const targets = Object.keys(a.patch);
    assert.ok(targets.length >= 1, `${a.key} patches nothing`);
    for (const t of targets) assert.ok(known.has(t), `${a.key} patches unknown channel ${t}`);
    // Each action has to explain itself and its cost — this is a teaching lab.
    assert.ok(a.label && a.what && a.cost);
  }
});

// ---------------------------------------------------------------------------
// The idle state
// ---------------------------------------------------------------------------

test('with no actions active nothing is touched and after === before', () => {
  const res = run([]);
  assert.deepEqual(res.activeActions, []);
  for (const r of res.rows) {
    assert.ok(
      r.verdict === 'untouched' || r.verdict === 'out-of-path',
      `${r.channel} should be idle, got ${r.verdict}`,
    );
    assert.equal(r.touched, false);
    assert.deepEqual(r.after, r.before);
    assert.equal(r.observabilityDelta, 0);
    assert.deepEqual(r.appliedActions, []);
  }
  assert.deepEqual(res.silentKills, []);
});

test('with no actions active every in-path channel is carrying information', () => {
  // The baselines have to be working channels, or "closed" would mean nothing.
  const rows = byChannel(run([]));
  for (const key of IN_PATH) {
    assert.ok(rows[key].before.residualBps > 0, `${key} baseline should carry bits`);
    assert.ok(rows[key].before.ber < 0.5, `${key} baseline should decode`);
  }
});

// ---------------------------------------------------------------------------
// One action at a time: exactly its target, nothing else
// ---------------------------------------------------------------------------

for (const action of WARDEN_ACTIONS) {
  test(`'${action.key}' alone affects only the channels it patches`, () => {
    const rows = byChannel(run([action.key]));
    const targets = new Set(Object.keys(action.patch));

    for (const key of IN_PATH) {
      const r = rows[key];
      if (targets.has(key)) {
        assert.equal(r.touched, true, `${key} should be targeted by ${action.key}`);
        assert.deepEqual(r.appliedActions, [action.key]);
        assert.ok(
          r.verdict === 'closed' || r.verdict === 'residual' || r.verdict === 'rate-limited',
          `${action.key} should close, degrade or throttle ${key}, got ${r.verdict}`,
        );
      } else {
        assert.equal(r.touched, false, `${key} must be untouched by ${action.key}`);
        assert.equal(r.verdict, 'untouched');
        assert.deepEqual(r.after, r.before, `${key} must be unchanged by ${action.key}`);
      }
    }
  });
}

test('each action closes its target outright, with two named exceptions', () => {
  // The exceptions are the whole point of the page, so they are spelled out
  // here rather than allowed as a loose "closed or something else":
  //   shapeTiming  — blurs a gap, cannot delete one, so a residual is left.
  //   switchDelay  — the PCAW throttles rather than corrupts, so nothing is
  //                  left over: the channel is intact and merely slower.
  const EXPECTED = { shapeTiming: { timing: 'residual' }, switchDelay: { hopping: 'rate-limited' } };
  for (const action of WARDEN_ACTIONS) {
    const rows = byChannel(run([action.key]));
    for (const target of Object.keys(action.patch)) {
      const expected = EXPECTED[action.key]?.[target] ?? 'closed';
      assert.equal(
        rows[target].verdict, expected,
        `${action.key} on ${target}: expected ${expected}, got ${rows[target].verdict}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// The rate-limiting defence
// ---------------------------------------------------------------------------

test("'rate-limited' is a verdict only the PCAW earns", () => {
  // Every other action attacks the SYMBOL and shows up as a rising error rate.
  // If a second action ever starts producing this verdict, either the action
  // is mis-modelled or verdictFor's test is too loose — both worth catching.
  for (const action of WARDEN_ACTIONS) {
    for (const r of run([action.key]).rows) {
      if (r.verdict !== 'rate-limited') continue;
      assert.equal(action.key, 'switchDelay', `${action.key} produced rate-limited on ${r.channel}`);
      assert.equal(r.channel, 'hopping');
    }
  }
});

test('the PCAW lowers capacity WITHOUT raising the error rate', () => {
  // The defining property, and the reason this action needs its own verdict:
  // a bitrate limit is not damage. Asserted as a strict inequality on capacity
  // and a strict non-increase on errors, in the same measurement.
  const r = byChannel(run(['switchDelay'])).hopping;

  assert.equal(r.touched, true);
  assert.ok(r.after.rawBps < r.before.rawBps, 'the throttle must actually slow the channel');
  assert.ok(r.after.residualBps < r.before.residualBps, 'and that must show up as capacity');

  assert.ok(r.after.ber <= r.before.ber, `error rate must not rise: ${r.before.ber} -> ${r.after.ber}`);
  assert.equal(r.before.ber, 0, 'the clean hopping baseline decodes exactly');
  assert.equal(r.after.ber, 0, 'and so does the throttled one — nothing is corrupted');

  // Per-symbol capacity is untouched; only symbols per second moved. This is
  // precisely the distinction 'residual' would have hidden.
  assert.equal(r.after.residualBitsPerSymbol, r.before.residualBitsPerSymbol);
  assert.equal(r.verdict, 'rate-limited');
});

test('the throttled hopping channel still delivers the message intact', () => {
  // A degraded channel loses text; a throttled one does not. Compare against
  // the shaped timing channel, which is the lab's other non-closing defence.
  const rows = byChannel(run(['switchDelay']));
  assert.equal(rows.hopping.before.decodedText, MESSAGE);
  assert.equal(rows.hopping.after.decodedText, MESSAGE, 'a rate limit costs time, not bits');

  const timing = byChannel(run(['shapeTiming'])).timing;
  assert.notEqual(timing.after.decodedText, MESSAGE, 'whereas shaping does cost bits');
});

test('a rate limit is not a hiding place: the anomaly score does not fall', () => {
  // The counterpart to silentKills. Slowing a channel leaves the transition
  // statistic exactly as visible as it was, so unlike the normalisers this
  // defence disrupts nothing AND conceals nothing.
  const res = run(['switchDelay']);
  const r = byChannel(res).hopping;
  assert.equal(r.observabilityDelta, 0, 'delaying hops does not change what the detector sees');
  assert.ok(!res.silentKills.includes('hopping'), 'a throttled channel was never killed');
});

test('the throttle scales: a harder delay means proportionally less capacity', () => {
  // Reads the modelled delay straight off the action, so the assertion tracks
  // the patch rather than a copied constant.
  const action = WARDEN_ACTIONS.find((a) => a.key === 'switchDelay');
  const factor = action.patch.hopping.gapMs / 900; // 900 ms is the clean baseline gap
  assert.ok(factor > 1, 'the PCAW has to actually add delay');

  const r = byChannel(run(['switchDelay'])).hopping;
  assert.ok(
    Math.abs(r.after.rawBps - r.before.rawBps / factor) < 1e-9,
    `bitrate should fall by exactly ${factor}x: ${r.before.rawBps} -> ${r.after.rawBps}`,
  );
});

test('the PCAW gives way to the allow-list when both are on', () => {
  // Stacking a throttle on a blocker does not produce a throttled verdict: the
  // allow-list destroys symbols, and destroyed beats slow. This pins the
  // ordering inside verdictFor, which checks 'rate-limited' first.
  const r = byChannel(run(['switchDelay', 'allowList'])).hopping;
  assert.deepEqual(r.appliedActions.slice().sort(), ['allowList', 'switchDelay']);
  assert.ok(r.after.ber > 0, 'the allow-list still corrupts the walk');
  assert.equal(r.verdict, 'closed');
});

// ---------------------------------------------------------------------------
// Off-path carriers
// ---------------------------------------------------------------------------

test("physical and cache are always 'out-of-path', whatever is switched on", () => {
  const sets = [[], ALL_ACTIONS, ['shapeTiming'], ['scrubHeaders', 'allowList']];
  for (const active of sets) {
    const rows = byChannel(run(active));
    for (const key of OUT_OF_PATH) {
      const r = rows[key];
      assert.equal(r.verdict, 'out-of-path', `${key} with [${active}] -> ${r.verdict}`);
      assert.equal(r.touched, false);
      assert.deepEqual(r.after, r.before);
      assert.ok(r.whyNot && r.whyNot.length > 0, `${key} must explain why it is out of reach`);
    }
  }
});

test('an off-path carrier keeps its full capacity even with every action on', () => {
  const rows = byChannel(run(ALL_ACTIONS));
  for (const key of OUT_OF_PATH) {
    assert.equal(rows[key].after.residualBps, rows[key].before.residualBps);
    assert.equal(rows[key].after.ber, rows[key].before.ber);
  }
});

// ---------------------------------------------------------------------------
// Everything on: timing is the lone survivor
// ---------------------------------------------------------------------------

test('with every action on, timing is the ONLY residual channel', () => {
  const res = run(ALL_ACTIONS);
  const rows = byChannel(res);
  const residual = res.rows.filter((r) => r.verdict === 'residual').map((r) => r.channel);
  assert.deepEqual(residual, ['timing'], 'a shaper blurs a gap; it cannot delete one');

  for (const key of IN_PATH) {
    if (key === 'timing') continue;
    assert.equal(rows[key].verdict, 'closed', `${key} should be closed, got ${rows[key].verdict}`);
  }
});

test('the residual timing channel still has measurable Shannon capacity', () => {
  const t = byChannel(run(ALL_ACTIONS)).timing;
  assert.ok(t.after.ber > 0, 'shaping raises the error rate');
  assert.ok(t.after.ber < 0.5, 'but not to a coin flip');
  assert.ok(t.after.residualBitsPerSymbol > 0, 'so capacity survives');
  assert.ok(t.after.residualBps > 0);
  assert.ok(t.after.residualBps < t.before.residualBps, 'degraded, not untouched');
});

// ---------------------------------------------------------------------------
// The residual-capacity model
// ---------------------------------------------------------------------------

test('residual capacity is zero at or past a coin flip, and 1 − H₂(BER) below it', () => {
  // A textbook BSC gives p = 1 full capacity, because a receiver could just
  // relabel. That is the wrong model once a warden is involved, so anything at
  // or past 0.5 is reported as a destroyed channel instead.
  let sawErased = 0;
  let sawPartial = 0;
  for (const active of [[], ALL_ACTIONS, ...ALL_ACTIONS.map((a) => [a])]) {
    for (const r of run(active).rows) {
      for (const side of [r.before, r.after]) {
        if (side.ber >= 0.5) {
          sawErased++;
          assert.equal(side.residualBitsPerSymbol, 0, `${r.channel}: BER ${side.ber} must give zero capacity`);
          assert.equal(side.residualBps, 0);
        } else {
          sawPartial++;
          const expected = 1 - binaryEntropy(side.ber);
          assert.ok(
            Math.abs(side.residualBitsPerSymbol - expected) < 1e-9,
            `${r.channel}: expected 1 − H₂(${side.ber}) = ${expected}, got ${side.residualBitsPerSymbol}`,
          );
        }
      }
    }
  }
  assert.ok(sawErased > 0, 'the benchmark must exercise the erased branch');
  assert.ok(sawPartial > 0, 'and the partial branch');
});

test('residual capacity never exceeds the raw rate, and is never negative', () => {
  for (const r of run(ALL_ACTIONS).rows) {
    for (const side of [r.before, r.after]) {
      assert.ok(side.residualBps >= 0);
      assert.ok(side.residualBps <= side.rawBps + 1e-9);
      assert.ok(side.residualBitsPerSymbol >= 0 && side.residualBitsPerSymbol <= 1);
    }
  }
});

// ---------------------------------------------------------------------------
// Disruption without detection
// ---------------------------------------------------------------------------

test('silentKills contains only channels that were closed AND made less visible', () => {
  for (const active of [[], ALL_ACTIONS, ['scrubHeaders'], ['scrubIcmp', 'canonicalHeaders']]) {
    const res = run(active);
    const rows = byChannel(res);
    for (const key of res.silentKills) {
      assert.equal(rows[key].verdict, 'closed', `${key} in silentKills but verdict ${rows[key].verdict}`);
      assert.ok(rows[key].observabilityDelta < 0, `${key} in silentKills but got no quieter`);
    }
    // And nothing qualifying was left out.
    const expected = res.rows
      .filter((r) => r.verdict === 'closed' && r.observabilityDelta < 0)
      .map((r) => r.channel);
    assert.deepEqual(res.silentKills, expected);
  }
});

test('with every action on, several channels are closed without leaving an alert behind', () => {
  // The teaching point: normalisation is disruption, not detection. A defender
  // running this gets a network where the attempts fail and no record that
  // anyone made them.
  const res = run(ALL_ACTIONS);
  assert.ok(res.silentKills.length >= 2, `expected several silent kills, got ${res.silentKills.length}`);
});

test('counts tallies the verdicts exactly', () => {
  const res = run(ALL_ACTIONS);
  const tally = {};
  for (const r of res.rows) tally[r.verdict] = (tally[r.verdict] || 0) + 1;
  assert.deepEqual(res.counts, tally);
  const total = Object.values(res.counts).reduce((s, v) => s + v, 0);
  assert.equal(total, WARDEN_CHANNELS.length);
});
