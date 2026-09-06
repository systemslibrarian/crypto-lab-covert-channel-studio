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

/** A simulated-data marker chip. */
export function simChip(text = 'All traffic below is generated locally — nothing is sent.') {
  return div({ class: 'sim-note' }, span({ text })); // the ::before adds the SIMULATED tag
}
