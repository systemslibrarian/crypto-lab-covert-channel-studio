/**
 * views/quizView.js — interactive knowledge check.
 * Feedback is never colour-only (each answered choice gets a ✓/✕ glyph plus
 * screen-reader text), and the explanation is an announced live region that
 * receives focus so keyboard and screen-reader users are taken to the result.
 */

import { el, div, span, replace } from './dom.js';
import { sectionHeader, inline } from './blocks.js';
import { button } from './controls.js';
import { statusRegion } from './widgets.js';
import { QUIZ } from '../content/quiz.js';

export function renderQuizView(state) {
  let answers = {}; // id -> chosenIndex
  const explainRefs = new Map(); // id -> explanation node (for focus)
  const list = div({ class: 'quiz-list' });
  const scoreText = div({ class: 'quiz-score' });
  const status = statusRegion();
  // Built ONCE and kept out of the replaced content. It used to be a child of
  // the node renderScore() replaced, so pressing it removed the button that was
  // holding focus and the next Tab restarted at the top of the document (2.4.3).
  const resetBtn = button({
    label: 'Reset quiz', variant: 'ghost', icon: '↺',
    onClick: () => {
      answers = {};
      renderAll();
      status.announce(`Quiz reset. Score 0 of ${QUIZ.length}, 0 answered.`);
    },
  });
  const scoreLine = div({ class: 'quiz-score-line' }, scoreText, resetBtn);

  const node = el('section', { class: 'section', id: 'sec-quiz' },
    status.node,
    sectionHeader({ title: 'Knowledge Check', eyebrow: 'Reference', lede: 'A few questions to test the distinctions this exhibit is built around.' }),
    scoreLine,
    list);

  function renderAll(focusId) {
    explainRefs.clear();
    replace(list, ...QUIZ.map(questionEl));
    renderScore();
    if (focusId && explainRefs.has(focusId)) explainRefs.get(focusId).focus();
  }

  function renderScore() {
    const answered = Object.keys(answers).length;
    const correct = QUIZ.filter((q) => answers[q.id] === q.answerIndex).length;
    // Only the score TEXT is replaced; the reset button node survives.
    // Not announced per answer — the explanation panel already speaks, and a
    // second announcement of the running score on every answer is noise.
    replace(scoreText,
      span({ text: `Score: ${correct} / ${QUIZ.length}` }),
      span({ class: 'subtle', text: `  ·  ${answered} answered` }));
  }

  function questionEl(q, i) {
    const chosen = answers[q.id];
    const locked = chosen !== undefined;
    const choices = q.choices.map((choice, idx) => {
      let cls = 'quiz-choice';
      let mark = null;
      let sr = '';
      if (locked) {
        if (idx === q.answerIndex) { cls += ' correct'; mark = '✓'; sr = ' — correct answer'; }
        else if (idx === chosen) { cls += ' wrong'; mark = '✕'; sr = ' — your incorrect answer'; }
      }
      return el('button', {
        class: cls, type: 'button', disabled: locked ? true : false,
        attrs: sr ? { 'aria-label': `${choice}${sr}` } : {},
        on: { click: () => { if (!locked) { answers[q.id] = idx; renderAll(q.id); } } },
      },
        span({ class: 'qc-key', 'aria-hidden': 'true', text: String.fromCharCode(65 + idx) }),
        span({ text: choice }),
        mark ? span({ class: 'qc-mark', 'aria-hidden': 'true', text: mark }) : null);
    });

    let explain = null;
    if (locked) {
      explain = div({ class: 'quiz-explain', attrs: { role: 'status', 'aria-live': 'polite', tabindex: '-1' } },
        el('strong', { text: chosen === q.answerIndex ? 'Correct. ' : 'Not quite. ' }),
        span({}, ...inline(q.explanation)));
      explainRefs.set(q.id, explain);
    }

    return div({ class: 'quiz-item' },
      div({ class: 'quiz-q' }, span({ class: 'quiz-num', text: `${i + 1}. ` }), span({ text: q.question })),
      div({ class: 'quiz-choices', attrs: { role: 'group', 'aria-label': `Question ${i + 1} choices` } }, ...choices),
      explain);
  }

  renderAll();
  return { node, refresh() {} };
}
