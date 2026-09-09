/**
 * views/widgets.js — shared presentational widgets composed from dom + charts.
 */

import { el, div, span } from './dom.js';
import { para, inline } from './blocks.js';
import { anomalyGauge } from './charts.js';

/** A list of metric rows. @param {Array<{name:string, value:string, hi?:boolean, title?:string}>} entries */
export function metricList(entries) {
  return div({ class: 'metric-list' },
    ...entries.map((e) => div({ class: 'metric-row', attrs: e.title ? { title: e.title } : {} },
      span({ class: 'metric-name', text: e.name }),
      span({ class: `metric-val${e.hi ? ' hi' : ''}` },
        e.value,
        e.hi ? span({ class: 'metric-flag', 'aria-hidden': 'true', text: ' ▲' }) : null,
        e.hi ? span({ class: 'visually-hidden', text: ' (elevated)' }) : null))));
}

/** Render detector observations (what / why / what-else). */
export function observationList(observations) {
  return div({ class: 'observation-list' },
    ...observations.map((o) => div({ class: `observation${o.triggered === false ? ' quiet' : ''}` },
      div({ class: 'obs-what' }, ...inline(o.what)),
      div({ class: 'obs-line why' }, span({ class: 'obs-tag', text: 'Why' }), span({}, ...inline(o.why))),
      div({ class: 'obs-line else' }, span({ class: 'obs-tag', text: 'But' }), span({}, ...inline(o.alsoCouldBe))))));
}

/** Full defender anomaly panel: gauge + observations. */
export function anomalyPanel(detector, opts = {}) {
  return div({ class: 'anomaly-panel' },
    anomalyGauge(detector.score, detector.anomalyLevel, { disclaimer: detector.disclaimer }),
    opts.hideObs ? null : observationList(detector.observations));
}

/** The recovered-message box, coloured by success. */
export function recoveredBox(text, { ok, label = 'Recovered message' } = {}) {
  const shown = text == null || text === '' ? '∅ (nothing recovered)' : text;
  return div({},
    el('p', { class: 'ctrl label-line', text: label, style: { fontSize: 'var(--fs-xs)', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--sp-2)' } }),
    div({ class: `recovered-box ${ok ? 'ok' : 'err'}` }, shown));
}

/** A row of small stat tiles. @param {Array<{val:string, lab:string, tone?:'good'|'bad'}>} tiles */
export function statTiles(tiles) {
  return div({ class: 'stat-tiles' },
    ...tiles.map((t) => div({ class: `stat-tile${t.tone ? ' ' + t.tone : ''}` },
      div({ class: 'st-val', text: t.val }),
      div({ class: 'st-lab', text: t.lab }))));
}

/** The Sender/Receiver vs Defender context banner. */
export function modeBanner(viewMode) {
  const isDef = viewMode === 'defender';
  return div({ class: `mode-banner${isDef ? ' defender' : ''}` },
    span({ class: 'dot', 'aria-hidden': 'true' }),
    isDef
      ? span({}, ...inline('**Defender / Analyst view** — you do not know the message. You see only the observable traffic and its statistics.'))
      : span({}, ...inline('**Sender / Receiver view** — you know the encoding rule, so you can watch the message be represented and reconstructed.')));
}

/**
 * The SIMULATED marker.
 *
 * The word is emitted from the DOM rather than left to `.sim-note::before`.
 * It is the exhibit's central honesty claim — that nothing here is real traffic
 * — and a claim of that weight should not be a stylesheet's to make: a
 * pseudo-element's text is exposed to the accessibility tree by today's engines
 * but is not guaranteed to be, and it disappears entirely if the stylesheet
 * fails to load. `.sim-note:has(.sim-tag)::before` stands the pseudo-element
 * down when this span is present, so the label neither doubles nor vanishes.
 */
export function simTag() {
  return span({ class: 'sim-tag', text: 'SIMULATED' });
}

/** A simulated-data marker chip. */
export function simChip(text = 'All traffic below is generated locally — nothing is sent.') {
  return div({ class: 'sim-note' }, simTag(), span({ text }));
}

/** The bare marker, for a card title that carries its own wording. */
export function simNote() {
  return span({ class: 'sim-note' }, simTag());
}

/* ---- the section outcome announcer (4.1.3 Status Messages) ---------------- */

/**
 * ONE polite status region per section, and a deliberately narrow one.
 *
 * The problem it solves: dragging the jitter slider re-renders the whole centre
 * and right panels, so the bit-error count, the recovered message and the
 * anomaly level all change with nothing announced. Those are results of the
 * user's action presented without receiving focus — status messages under 4.1.3.
 *
 * The problem it must NOT create: a range `input` event fires once per pixel of
 * a drag, and the panels it rewrites contain an 80-row DNS log, several charts
 * and a page of prose. Marking those panels live would read a table aloud on
 * every tick and make the exhibit *less* usable with a screen reader than
 * silence. So the design is the opposite of "wrap the output":
 *
 *   - The region is created once, at section-build time, and lives BESIDE the
 *     panels — never inside anything that gets replace()d, because replacing a
 *     live region's node de-registers it and it stops announcing at all.
 *   - It is written from refresh(), not from the control handlers, so it
 *     describes a settled state rather than an in-flight drag.
 *   - It carries one short outcome sentence — the two or three headline numbers
 *     a reader is actually experimenting on — and nothing else. Charts, logs,
 *     metric lists and observation prose stay inert and are read on demand.
 *   - Two gates stop the chatter: a trailing debounce (a whole drag produces one
 *     announcement) and an identity check (nudging a slider without changing the
 *     outcome says nothing).
 *
 * Visually hidden, because the same information is already on screen.
 */
const STATUS_DEBOUNCE_MS = 500;

export function statusRegion(opts = {}) {
  const node = el('p', {
    class: 'visually-hidden',
    attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
  });
  let spoken = '';     // what the node currently holds
  let pending = null;  // what the next tick would write
  let timer = null;
  let primed = false;

  function announce(text) {
    const s = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (s === spoken) {
      // Includes the A → B → A case: cancel the scheduled write rather than
      // announcing a value the reader is already sitting on.
      pending = null;
      if (timer) { clearTimeout(timer); timer = null; }
      return;
    }
    pending = s;
    if (!primed) {
      // The first write happens while the section is still detached from the
      // document, so it seeds the region without speaking on every navigation.
      primed = true;
      spoken = s;
      node.textContent = s;
      return;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (pending !== null && pending !== spoken) { spoken = pending; node.textContent = spoken; }
    }, opts.debounceMs ?? STATUS_DEBOUNCE_MS);
    // Node keeps the event loop alive for pending timers; test runs must not hang.
    if (timer && typeof timer.unref === 'function') timer.unref();
  }

  return { node, announce };
}

/** "0 bit errors" / "7 bit errors of 40". Shared by every sender panel summary. */
export function errorPhrase(bitErrors, totalBits) {
  if (!bitErrors) return 'no bit errors';
  return `${bitErrors} bit error${bitErrors === 1 ? '' : 's'}${totalBits ? ` of ${totalBits}` : ''}`;
}

/** Sentence-initial: "Recovered “HELLO”" / "Nothing recovered". */
export function recoveredPhrase(text) {
  return text ? `Recovered “${text}”` : 'Nothing recovered';
}

/** Sentence-initial: "Anomaly indicator moderate, 48 of 100". */
export function anomalyPhrase(det) {
  if (!det) return '';
  return `Anomaly indicator ${det.anomalyLevel}, ${Math.round(det.score)} of 100`;
}
