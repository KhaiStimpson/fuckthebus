// UI layer: screens, the pass-the-phone privacy gates, and the challenge reveal.

import { PartyGame, MIN_PLAYERS, MAX_PLAYERS } from './game.js';

const SAVE_KEY = 'fuckthebus.party';

const el = (id) => document.getElementById(id);
const screens = {
  setup: el('screen-setup'),
  pass: el('screen-pass'),
  hand: el('screen-hand'),
  table: el('screen-table'),
  give: el('screen-give'),
  respond: el('screen-respond'),
  reveal: el('screen-reveal'),
  over: el('screen-over'),
};

let game = new PartyGame();
let names = ['', ''];
// Where the privacy gate should go once the right person confirms: the deal
// walk-through, or a one-off peek from the table.
let passIntent = null;
let handOwner = null;
let giverId = null;

// --- storage (best effort: private mode and blocked storage must not break) --

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game.toJSON()));
  } catch {
    /* ignore */
  }
}

function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

function restore() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const revived = PartyGame.fromJSON(JSON.parse(raw));
    if (!revived || revived.phase === 'setup' || revived.phase === 'over') return false;
    game = revived;
    return true;
  } catch {
    return false;
  }
}

// --- cards ---------------------------------------------------------------

function cardEl(card, { small = false } = {}) {
  const node = document.createElement('div');
  node.className = `card${small ? ' small' : ''}`;
  node.innerHTML =
    `<span class="rank ${card.color}">${card.rank}</span><span class="suit ${card.color}">${card.symbol}</span>`;
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', `${card.rank} of ${card.suit}`);
  return node;
}

function faceDownEl({ onFlip = null, next = false } = {}) {
  const node = document.createElement(onFlip ? 'button' : 'div');
  node.className = `card back${next ? ' next' : ''}`;
  if (onFlip) {
    node.type = 'button';
    node.addEventListener('click', onFlip);
    node.setAttribute('aria-label', 'Face-down pyramid card');
  }
  return node;
}

// --- setup ---------------------------------------------------------------

function renderSetup() {
  const wrap = el('names');
  wrap.replaceChildren(
    ...names.map((value, i) => {
      const row = document.createElement('div');
      row.className = 'name-row';

      const input = document.createElement('input');
      input.type = 'text';
      input.value = value;
      input.placeholder = `Player ${i + 1}`;
      input.maxLength = 14;
      input.autocomplete = 'off';
      input.addEventListener('input', () => {
        names[i] = input.value;
        el('start').disabled = !validNames().length || validNames().length < MIN_PLAYERS;
      });
      row.append(input);

      if (names.length > MIN_PLAYERS) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn ghost tiny';
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => {
          names.splice(i, 1);
          renderSetup();
        });
        row.append(remove);
      }
      return row;
    })
  );

  el('add-player').disabled = names.length >= MAX_PLAYERS;
  el('setup-warn').textContent = '';
  el('start').disabled = validNames().length < MIN_PLAYERS;
}

function validNames() {
  return names.map((n) => n.trim()).filter(Boolean);
}

// --- the table -----------------------------------------------------------

function renderTable() {
  const card = game.currentCard;
  el('current-label').textContent = card
    ? `${card.rank}${card.symbol} — worth ${game.currentValue}`
    : game.cardsLeft
      ? 'Flip the first card'
      : 'Pyramid finished';
  el('current-card').replaceChildren(...(card ? [cardEl(card)] : []));

  // Drawn top row first so the apex sits at the top of the screen.
  const pyramid = el('pyramid');
  pyramid.replaceChildren(
    ...[...game.pyramid].reverse().map((row) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'pyramid-row';

      const value = document.createElement('span');
      value.className = 'row-value';
      value.textContent = row.value;
      rowEl.append(value);

      row.cards.forEach((slot) => {
        rowEl.append(slot.revealed ? cardEl(slot.card, { small: true }) : faceDownEl());
      });

      // Mirror the value label on the right so each row stays centred.
      const spacer = document.createElement('span');
      spacer.className = 'row-value';
      spacer.setAttribute('aria-hidden', 'true');
      rowEl.append(spacer);
      return rowEl;
    })
  );

  // Hands never change size, so the drink tally is the only public number.
  el('roster').replaceChildren(
    ...game.players.map((p) => {
      const li = document.createElement('li');
      li.className = game.hasGiven(p.id) ? 'given' : '';
      li.innerHTML =
        `<span class="who">${p.name}</span>` +
        `<span class="count">${game.hasGiven(p.id) ? 'gave this card' : ''}</span>` +
        `<span class="drinks">${p.drinks}</span>`;
      return li;
    })
  );

  const done = game.cardsLeft === 0;
  el('flip').disabled = done;
  el('flip').textContent = done ? 'No cards left' : 'Flip next card';
  el('open-give').disabled = !game.currentCard;
  el('finish').classList.toggle('hidden', !game.canFinish);

  el('log').replaceChildren(
    ...game.log.slice(-6).map((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      return li;
    })
  );
}

// --- screen routing ------------------------------------------------------

function show(name) {
  for (const [key, node] of Object.entries(screens)) node.classList.toggle('hidden', key !== name);
  window.scrollTo(0, 0);
}

function render() {
  switch (game.phase) {
    case 'setup':
      renderSetup();
      show('setup');
      break;
    case 'deal': {
      const next = game.dealTarget;
      if (!next) { game.phase = 'table'; render(); return; }
      passIntent = 'deal';
      el('pass-name').textContent = next.name;
      el('pass-note').textContent = 'Everyone else, look away.';
      el('pass-cancel').classList.add('hidden');
      show('pass');
      break;
    }
    case 'table':
      renderTable();
      show('table');
      break;
    case 'respond': {
      const { giverId: gid, targetId, value } = game.pending;
      el('respond-title').textContent = `${game.players[targetId].name}, drink ${value}?`;
      el('respond-note').textContent =
        `${game.players[gid].name} says they have it. Take it, or make them show you.`;
      el('respond-card').replaceChildren(cardEl(game.currentCard));
      show('respond');
      break;
    }
    case 'reveal': {
      const r = game.lastResolution;
      const giver = game.players[r.giverId];
      const challenger = game.players[r.targetId];
      el('reveal-title').textContent = r.truthful ? `${giver.name} had it` : `${giver.name} was lying`;
      screens.reveal.classList.toggle('caught', !r.truthful);
      screens.reveal.classList.toggle('proved', r.truthful);
      el('reveal-card').replaceChildren(
        r.proof ? cardEl(r.proof) : Object.assign(document.createElement('div'), {
          className: 'card empty',
          textContent: 'nothing',
        })
      );
      el('reveal-note').textContent = r.truthful
        ? `${challenger.name} drinks ${r.penalty}.`
        : `${giver.name} drinks ${r.penalty}.`;
      show('reveal');
      break;
    }
    case 'over': {
      const losers = game.losers;
      el('over-note').textContent =
        losers.length === 1
          ? `${losers[0].name} took the most — ${losers[0].drinks} drinks.`
          : `Tied on ${losers[0].drinks} drinks: ${losers.map((p) => p.name).join(', ')}.`;
      el('reveal-all').replaceChildren(
        ...game.standings.map((p) => {
          const block = document.createElement('div');
          block.className = `final${losers.includes(p) ? ' loser' : ''}`;
          const head = document.createElement('p');
          head.className = 'final-head';
          head.textContent = `${p.name} · ${p.drinks} drink${p.drinks === 1 ? '' : 's'}`;
          const row = document.createElement('div');
          row.className = 'card-row';
          row.append(...p.hand.map((c) => cardEl(c, { small: true })));
          block.append(head, row);
          return block;
        })
      );
      show('over');
      break;
    }
    default:
      show('setup');
  }
  save();
}

// --- wiring --------------------------------------------------------------

el('add-player').addEventListener('click', () => {
  if (names.length < MAX_PLAYERS) names.push('');
  renderSetup();
});

el('start').addEventListener('click', () => {
  const clean = validNames();
  if (clean.length < MIN_PLAYERS) {
    el('setup-warn').textContent = `Need at least ${MIN_PLAYERS} names.`;
    return;
  }
  if (new Set(clean.map((n) => n.toLowerCase())).size !== clean.length) {
    el('setup-warn').textContent = 'Two people have the same name - make them different.';
    return;
  }
  game = new PartyGame();
  game.start(clean);
  render();
});

el('pass-confirm').addEventListener('click', () => {
  if (passIntent === 'deal') {
    const next = game.dealTarget;
    if (!next) { render(); return; }
    handOwner = next;
    game.markSeen(next.id);
  }
  el('hand-owner').textContent = `${handOwner.name}'s hand`;
  el('hand-cards').replaceChildren(...handOwner.hand.map((c) => cardEl(c)));
  show('hand');
  save();
});

el('pass-cancel').addEventListener('click', () => render());

el('hand-done').addEventListener('click', () => {
  // Clear the cards out of the DOM before the screen changes, so a slow
  // repaint can never flash someone else's hand.
  el('hand-cards').replaceChildren();
  handOwner = null;
  render();
});

el('flip').addEventListener('click', () => {
  game.flipNext();
  render();
});

el('open-give').addEventListener('click', () => {
  giverId = null;
  renderPicker();
  show('give');
});

el('give-cancel').addEventListener('click', () => {
  if (giverId !== null) { giverId = null; renderPicker(); return; }
  render();
});

function renderPicker() {
  const choosingTarget = giverId !== null;
  el('give-title').textContent = choosingTarget ? 'Who drinks?' : "Who's giving?";
  el('give-note').textContent = choosingTarget
    ? `${game.players[giverId].name} is giving ${game.currentValue}. Pick a victim.`
    : 'Tap your own name. Nobody has to prove anything yet.';

  el('give-picker').replaceChildren(
    ...game.players.map((p) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn pick';
      btn.textContent = p.name;
      const blocked = choosingTarget ? p.id === giverId : !game.canGive(p.id);
      btn.disabled = blocked;
      if (!choosingTarget && game.hasGiven(p.id)) btn.textContent = `${p.name} (already gave)`;
      btn.addEventListener('click', () => {
        if (choosingTarget) {
          game.give(giverId, p.id);
          giverId = null;
          render();
        } else {
          giverId = p.id;
          renderPicker();
        }
      });
      return btn;
    })
  );
}

el('respond-drink').addEventListener('click', () => { game.accept(); render(); });
el('respond-call').addEventListener('click', () => { game.challenge(); render(); });
el('reveal-done').addEventListener('click', () => { game.dismissReveal(); render(); });

el('open-peek').addEventListener('click', () => {
  passIntent = 'peek';
  el('pass-name').textContent = 'whoever wants a look';
  el('pass-note').textContent = 'Tap your own name.';
  el('pass-cancel').classList.remove('hidden');
  el('give-title').textContent = '';
  // Reuse the picker markup for choosing who is peeking.
  el('give-picker').replaceChildren(
    ...game.players.map((p) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn pick';
      btn.textContent = p.name;
      btn.addEventListener('click', () => {
        handOwner = p;
        passIntent = 'peek';
        el('pass-name').textContent = p.name;
        el('pass-note').textContent = 'Everyone else, look away.';
        show('pass');
      });
      return btn;
    })
  );
  el('give-title').textContent = 'Whose cards?';
  el('give-note').textContent = 'Tap your own name, then confirm on the next screen.';
  show('give');
});

el('finish').addEventListener('click', () => { game.finish(); render(); });

el('again').addEventListener('click', () => {
  clearSave();
  game = new PartyGame();
  giverId = null;
  handOwner = null;
  render();
});

if (!restore()) game = new PartyGame();
renderSetup();
render();
