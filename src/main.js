// UI layer: renders game state and turns clicks and keys into game actions.

import { Game, GUESS_STEPS } from './game.js';
import { SUITS } from './deck.js';

const BEST_KEY = 'fuckthebus.best';
const REVEAL_MS = 420;   // long enough to read the card that just landed
const BUS_RESET_MS = 950; // let a losing card sink in before the row is redealt

const el = (id) => document.getElementById(id);

const dom = {
  sips: el('stat-sips'),
  phase: el('stat-phase'),
  best: el('stat-best'),
  prompt: el('prompt'),
  hint: el('hint'),
  controls: el('controls'),
  log: el('log'),
  restart: el('restart'),
  boards: {
    guess: el('board-guess'),
    pyramid: el('board-pyramid'),
    bus: el('board-bus'),
    done: el('board-done'),
  },
  handRow: el('hand-row'),
  pyramid: el('pyramid'),
  pyramidHand: el('pyramid-hand'),
  busRow: el('bus-row'),
  busMeta: el('bus-meta'),
  doneTitle: el('done-title'),
  summary: el('summary'),
};

const SUIT_BY_KEY = Object.fromEntries(SUITS.map((s) => [s.key, s]));
const SUIT_NAMES = { spades: 'Spades', hearts: 'Hearts', diamonds: 'Diamonds', clubs: 'Clubs' };

const GUESS_HINTS = [
  'Guess the colour of your first card. A miss costs 1 sip.',
  'Higher or lower than your first card? Ace is high, and a tie loses. 2 sips.',
  'Inside or outside your first two cards? Landing on either one loses. 3 sips.',
  'Name the suit of your last card. 4 sips.',
];

let game = new Game();
let busy = false;
let keyHandlers = [];

// --- card rendering -----------------------------------------------------

function cardEl(card, { revealed = false, onFlip = null, classes = [] } = {}) {
  const node = document.createElement(onFlip ? 'button' : 'div');
  node.className = ['card', ...classes].join(' ');
  if (revealed) node.classList.add('revealed');

  const inner = document.createElement('div');
  inner.className = 'card-inner';

  const back = document.createElement('div');
  back.className = 'card-back';

  const front = document.createElement('div');
  front.className = `card-front ${card ? card.color : ''}`;
  if (card) {
    front.innerHTML =
      `<span class="rank">${card.rank}</span><span class="suit">${card.symbol}</span>`;
  }

  inner.append(back, front);
  node.append(inner);

  if (onFlip) {
    node.type = 'button';
    node.classList.add('clickable');
    node.addEventListener('click', onFlip);
    node.setAttribute('aria-label', revealed && card ? `${card.rank} of ${SUIT_NAMES[card.suit]}` : 'Face-down card, flip it');
  } else if (revealed && card) {
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', `${card.rank} of ${SUIT_NAMES[card.suit]}`);
  }
  return node;
}

// --- shared chrome ------------------------------------------------------

const PHASE_LABEL = { guess: 'Guesses', pyramid: 'Pyramid', bus: 'The bus', done: 'Done' };

function renderChrome() {
  dom.sips.textContent = game.penalties;
  dom.phase.textContent = PHASE_LABEL[game.phase];

  for (const [name, node] of Object.entries(dom.boards)) {
    node.classList.toggle('hidden', name !== game.phase);
  }

  dom.log.replaceChildren(
    ...game.log.slice(-8).map((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      return li;
    })
  );
  dom.log.scrollTop = dom.log.scrollHeight;
}

function button(label, { primary = false, key = null, pip = null, onClick }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn${primary ? ' primary' : ''}`;
  if (pip) btn.insertAdjacentHTML('afterbegin', `<span class="pip ${pip.color}">${pip.symbol}</span>`);
  btn.insertAdjacentHTML('beforeend', `<span>${label}</span>`);
  if (key) btn.insertAdjacentHTML('beforeend', `<span class="key">${key}</span>`);
  btn.addEventListener('click', () => { if (!busy) onClick(); });
  if (key) keyHandlers.push({ key: key.toLowerCase(), run: () => { if (!busy) onClick(); } });
  return btn;
}

function setControls(buttons) {
  keyHandlers = [];
  dom.controls.replaceChildren();
  for (const make of buttons) dom.controls.append(make());
}

// --- phase 1: guesses ---------------------------------------------------

function renderGuess() {
  const step = game.currentGuess;
  dom.prompt.textContent = step.prompt;
  dom.hint.textContent = GUESS_HINTS[game.guessStep];

  dom.handRow.replaceChildren(
    ...Array.from({ length: GUESS_STEPS.length }, (_, i) => {
      const result = game.guessResults[i];
      return cardEl(result?.card ?? null, {
        revealed: Boolean(result),
        classes: result ? [result.correct ? 'match' : 'hit'] : [],
      });
    })
  );

  const options = step.options.map((option, i) => () =>
    button(labelFor(step.key, option), {
      primary: step.key !== 'suit',
      key: String(i + 1),
      pip: step.key === 'color'
        ? { symbol: option === 'red' ? '♥' : '♠', color: option }
        : step.key === 'suit'
          ? { symbol: SUIT_BY_KEY[option].symbol, color: SUIT_BY_KEY[option].color }
          : null,
      onClick: () => takeGuess(option),
    })
  );
  setControls(options);
}

function labelFor(stepKey, option) {
  if (stepKey === 'suit') return SUIT_NAMES[option];
  return option.charAt(0).toUpperCase() + option.slice(1);
}

function takeGuess(option) {
  busy = true;
  const wasStep = game.guessStep;
  game.submitGuess(option);

  // Re-render the hand so the new card flips, then move on to the next prompt.
  const pending = game.phase;
  renderChrome();
  if (pending === 'guess') {
    renderGuess();
  } else {
    // The board swapped to the pyramid, but show the fourth card first.
    dom.boards.guess.classList.remove('hidden');
    dom.boards.pyramid.classList.add('hidden');
    dom.phase.textContent = PHASE_LABEL.guess;
    dom.handRow.replaceChildren(
      ...game.guessResults.map((r) => cardEl(r.card, { revealed: true, classes: [r.correct ? 'match' : 'hit'] }))
    );
    dom.prompt.textContent = `${game.guessesCorrect} of 4 right.`;
    dom.hint.textContent = `${game.penalties} sip${game.penalties === 1 ? '' : 's'} so far.`;
    dom.controls.replaceChildren();
  }
  setTimeout(() => {
    busy = false;
    if (pending !== 'guess') render();
  }, wasStep === GUESS_STEPS.length - 1 ? REVEAL_MS + 700 : REVEAL_MS);
}

// --- phase 2: pyramid ---------------------------------------------------

function renderPyramid() {
  const left = game.pyramidTotal - game.pyramidFlipped;
  dom.prompt.textContent = 'Work the pyramid';
  dom.hint.textContent = `Flip all ten cards. A rank you hold shortens the bus row by that row's value. ${left} left, ${game.pyramidReduction} off the row so far.`;

  dom.pyramid.replaceChildren(
    ...game.pyramid.map((row, rowIndex) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'pyramid-row';
      rowEl.append(
        ...row.cards.map((slot, cardIndex) =>
          cardEl(slot.card, {
            revealed: slot.revealed,
            classes: slot.matched ? ['match'] : [],
            onFlip: slot.revealed ? null : () => flipPyramid(rowIndex, cardIndex),
          })
        )
      );
      return rowEl;
    })
  );

  dom.pyramidHand.replaceChildren(
    ...game.hand.map((card, i) =>
      cardEl(card, { revealed: true, classes: game.handSpent[i] ? ['spent'] : [] })
    )
  );
  setControls([]);
}

function flipPyramid(rowIndex, cardIndex) {
  busy = true;
  game.flipPyramid(rowIndex, cardIndex);
  const moved = game.phase !== 'pyramid';
  renderChrome();
  renderPyramid();
  setTimeout(() => {
    busy = false;
    if (moved) render();
  }, moved ? REVEAL_MS + 500 : REVEAL_MS);
}

// --- phase 3: the bus ---------------------------------------------------

function renderBus(lastHit = null) {
  dom.prompt.textContent = 'Ride the bus';
  dom.hint.textContent = 'Number cards pass. J, Q, K or A costs sips and you start over on a fresh row.';

  dom.busRow.replaceChildren(
    ...game.busRow.map((slot, i) => {
      const isNext = i === game.busPosition && !slot.revealed;
      const classes = [];
      if (isNext) classes.push('current');
      if (slot.revealed) classes.push(lastHit === i ? 'hit' : 'match');
      return cardEl(slot.card, {
        revealed: slot.revealed,
        classes,
        onFlip: isNext ? flipBus : null,
      });
    })
  );

  dom.busMeta.textContent =
    `Row of ${game.busLength} · attempt ${game.busAttempts} · ${game.busFlips} flip${game.busFlips === 1 ? '' : 's'}`;

  setControls([
    () => button('Flip next', { primary: true, key: 'space', onClick: flipBus }),
  ]);
}

function flipBus() {
  busy = true;
  const position = game.busPosition;
  const result = game.flipBus();
  if (!result) { busy = false; return; }

  renderChrome();
  renderBus(result.survived ? null : position);

  if (result.reset) {
    dom.hint.textContent = `${result.card.rank}${result.card.symbol} — ${result.penalty} sip${result.penalty === 1 ? '' : 's'}. Back to the start.`;
    setTimeout(() => {
      game.resetBusRow();
      busy = false;
      render();
    }, BUS_RESET_MS);
    return;
  }

  setTimeout(() => {
    busy = false;
    if (result.escaped) render();
  }, result.escaped ? REVEAL_MS + 400 : REVEAL_MS);
}

// --- done ---------------------------------------------------------------

function renderDone() {
  const s = game.summary;
  const best = saveBest(s);
  dom.prompt.textContent = `Off the bus in ${s.busFlips} flip${s.busFlips === 1 ? '' : 's'}`;
  dom.hint.textContent =
    best.isNew ? 'Best run yet.' : `Best so far: ${best.penalties} sips in ${best.busFlips} flips.`;
  dom.doneTitle.textContent = `${s.penalties} sip${s.penalties === 1 ? '' : 's'} total`;

  const rows = [
    ['Guesses right', `${s.guessesCorrect} / 4`],
    ['Pyramid cut off the row', s.pyramidReduction],
    ['Bus row length', s.busLength],
    ['Bus attempts', s.busAttempts],
    ['Cards flipped on the bus', s.busFlips],
    ['Sips', s.penalties],
  ];
  dom.summary.replaceChildren(
    ...rows.flatMap(([label, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      return [dt, dd];
    })
  );

  setControls([
    () => button('Play again', { primary: true, key: 'space', onClick: newRun }),
  ]);
}

// --- best run (localStorage, best effort) --------------------------------

function loadBest() {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveBest(summary) {
  const previous = loadBest();
  const better =
    !previous ||
    summary.penalties < previous.penalties ||
    (summary.penalties === previous.penalties && summary.busFlips < previous.busFlips);

  const best = better ? { penalties: summary.penalties, busFlips: summary.busFlips } : previous;
  if (better) {
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(best));
    } catch {
      // Private mode or blocked storage: the run still counts, it just is not kept.
    }
  }
  renderBest();
  return { ...best, isNew: better };
}

function renderBest() {
  const best = loadBest();
  dom.best.textContent = best ? `${best.penalties} sips` : '—';
}

// --- wiring -------------------------------------------------------------

function render() {
  renderChrome();
  if (game.phase === 'guess') renderGuess();
  else if (game.phase === 'pyramid') renderPyramid();
  else if (game.phase === 'bus') renderBus();
  else renderDone();
}

function newRun() {
  game.reset();
  busy = false;
  render();
}

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key === ' ' ? 'space' : event.key.toLowerCase();
  const handler = keyHandlers.find((h) => h.key === key);
  if (!handler) return;
  event.preventDefault();
  handler.run();
});

dom.restart.addEventListener('click', newRun);

renderBest();
render();
