import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const navigation = html.slice(html.indexOf('    function goTo(index)'), html.indexOf('    function finish()'));

function setup() {
  const events = [];
  const cards = Array.from({ length: 6 }, (_, index) => {
    const card = { active: index === 0 };
    card.classList = {
      add() { card.active = true; events.push('render'); },
      remove() { card.active = false; },
    };
    card.textarea = {
      value: '',
      focus(options) { events.push(['focus', options]); },
    };
    card.querySelector = () => card.textarea;
    return card;
  });
  const list = { innerHTML: '', appendChild() {} };
  const context = vm.createContext({
    questions: Array.from({ length: 5 }, (_, i) => `Question ${i}`),
    answers: Array(5).fill(''),
    current: 0,
    stepper: { style: {} },
    reviewCard: cards[5],
    updateStepper() { events.push('stepper'); },
    document: {
      querySelector() { return cards.slice(0, 5).find(card => card.active)?.textarea; },
      querySelectorAll() { return cards; },
      getElementById(id) { return id === 'review-list' ? list : cards[Number(id.slice(1))]; },
      createElement() { return {}; },
    },
    window: {
      scrollTo(options) { events.push(['scroll', options]); },
    },
  });
  vm.runInContext(navigation, context);
  return { context, cards, events };
}

function navigate(state, index) {
  state.events.length = 0;
  state.context.goTo(index);
  assert.equal(state.context.current, index);
  assert.equal(state.cards.filter(card => card.active).length, 1);
  assert.equal(state.cards[index].active, true);
  assert.equal(JSON.stringify(state.events.at(-1)), JSON.stringify(['scroll', { top: 0, left: 0, behavior: 'instant' }]));
  assert.equal(state.events.filter(event => event[0] === 'scroll').length, 1);
  if (index < 5) {
    const focus = state.events.find(event => event[0] === 'focus');
    assert.equal(focus[1].preventScroll, true);
  }
}

test('every Next and Back resets scroll after rendering and focus, including review', () => {
  const state = setup();
  for (const index of [1, 2, 3, 4, 5, 4, 3, 2, 1, 0]) navigate(state, index);
});

test('repeated and interrupted navigation preserves answers and leaves no delayed scroll work', () => {
  const state = setup();
  state.cards[0].textarea.value = 'A beautiful walk';
  for (const index of [1, 0, 1, 1, 2, 1, 0]) navigate(state, index);
  assert.equal(state.cards[0].textarea.value, 'A beautiful walk');
  assert.equal(state.context.answers[0], 'A beautiful walk');
  state.cards[0].textarea.value = 'A beautiful walk, edited';
  navigate(state, 1);
  navigate(state, 0);
  assert.equal(state.cards[0].textarea.value, 'A beautiful walk, edited');
});

test('question minimum height is 80 percent while mobile text size and resizing remain usable', () => {
  const css = html.match(/\n    textarea \{([^}]+)\}/)[1];
  assert.match(css, /min-height: 112px;/);
  assert.equal(112 / 140, 0.8);
  assert.match(css, /font-size: 16px;/);
  assert.match(css, /resize: vertical;/);
  assert.match(html, /\.share-panel textarea \{\s*min-height: 0;/);
});
