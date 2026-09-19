// Rules for the pass-and-play party game. No DOM access in here, so the rules
// can be driven headlessly.
//
// The claim itself is pure table talk: you tap your name to say "I have this,
// drink". The app never asks what you are claiming and never stops you lying.
// It only holds everyone's hand so it can settle a challenge - and it reveals
// exactly one card when it does, never the rest of your hand.

import { createDeck, shuffle } from './deck.js';

export const HAND_SIZE = 5;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const DECK_SIZE = 52;

// Bottom row is 1 drink and each row up is worth one more. Deal the biggest
// pyramid the deck can still cover once everyone has their five cards.
export function pyramidRowsFor(playerCount) {
  for (let rows = 5; rows >= 3; rows--) {
    const cards = (rows * (rows + 1)) / 2;
    if (cards + playerCount * HAND_SIZE <= DECK_SIZE) return rows;
  }
  return 3;
}

export class PartyGame {
  constructor({ random = Math.random } = {}) {
    this.random = random;
    this.phase = 'setup';
    this.players = [];
    this.pyramid = [];
    this.log = [];
    this.currentSlot = null;
    this.gives = [];
    this.pending = null;
    this.lastResolution = null;
  }

  // --- setup ------------------------------------------------------------

  start(names) {
    const clean = names.map((n) => n.trim()).filter(Boolean);
    if (clean.length < MIN_PLAYERS || clean.length > MAX_PLAYERS) return false;

    const deck = shuffle(createDeck(), this.random);
    this.players = clean.map((name, id) => ({
      id,
      name,
      hand: deck.splice(0, HAND_SIZE),
      drinks: 0,
      seen: false,
    }));

    const rows = pyramidRowsFor(this.players.length);
    // Row 0 is the wide bottom row worth 1; the apex is worth `rows`.
    this.pyramid = Array.from({ length: rows }, (_, i) => ({
      value: i + 1,
      cards: Array.from({ length: rows - i }, () => ({ card: deck.pop(), revealed: false })),
    }));

    this.phase = 'deal';
    this.log = [`${this.players.length} players, ${rows}-row pyramid. Pass the phone around.`];
    return true;
  }

  get dealTarget() {
    return this.players.find((p) => !p.seen) ?? null;
  }

  markSeen(playerId) {
    const player = this.players[playerId];
    if (player) player.seen = true;
    if (!this.dealTarget && this.phase === 'deal') this.phase = 'table';
  }

  // --- the pyramid ------------------------------------------------------

  get flipOrder() {
    const slots = [];
    this.pyramid.forEach((row, rowIndex) => {
      row.cards.forEach((slot, cardIndex) => slots.push({ rowIndex, cardIndex, slot, value: row.value }));
    });
    return slots;
  }

  get cardsLeft() {
    return this.flipOrder.filter((s) => !s.slot.revealed).length;
  }

  flipNext() {
    if (this.phase !== 'table') return null;
    const next = this.flipOrder.find((s) => !s.slot.revealed);
    if (!next) return null;

    next.slot.revealed = true;
    this.currentSlot = next;
    this.gives = [];
    this.note(`${next.slot.card.rank}${next.slot.card.symbol} is up - worth ${next.value}.`);

    if (this.cardsLeft === 0) this.note('Last card of the pyramid.');
    return next;
  }

  get currentCard() {
    return this.currentSlot?.slot.card ?? null;
  }

  get currentValue() {
    return this.currentSlot?.value ?? 0;
  }

  // One give per player per flipped card, so nobody can machine-gun the table.
  hasGiven(playerId) {
    return this.gives.some((g) => g.giverId === playerId);
  }

  canGive(playerId) {
    return Boolean(this.currentSlot) && !this.hasGiven(playerId);
  }

  // --- giving and challenging -------------------------------------------

  give(giverId, targetId) {
    if (this.phase !== 'table' || !this.currentSlot) return false;
    if (giverId === targetId || !this.canGive(giverId)) return false;
    this.pending = { giverId, targetId, value: this.currentValue };
    this.phase = 'respond';
    return true;
  }

  cancelGive() {
    this.pending = null;
    if (this.phase === 'respond') this.phase = 'table';
  }

  // Does the giver actually hold the flipped rank? Only ever consulted here.
  proofIndex(playerId) {
    const rank = this.currentCard?.rank;
    if (!rank) return -1;
    return this.players[playerId].hand.findIndex((c) => c.rank === rank);
  }

  accept() {
    if (this.phase !== 'respond' || !this.pending) return null;
    const { giverId, targetId, value } = this.pending;
    const giver = this.players[giverId];
    const target = this.players[targetId];

    target.drinks += value;

    // Truthful gives quietly spend the card; a bluff that goes unchallenged
    // costs the bluffer nothing but leaves them still holding everything.
    const index = this.proofIndex(giverId);
    const truthful = index !== -1;
    if (truthful) giver.hand.splice(index, 1);

    this.note(`${target.name} drinks ${value} from ${giver.name}.`);
    this.gives.push({ giverId, targetId, challenged: false, truthful });
    this.pending = null;
    this.lastResolution = null;
    this.phase = 'table';
    return { truthful, value };
  }

  challenge() {
    if (this.phase !== 'respond' || !this.pending) return null;
    const { giverId, targetId, value } = this.pending;
    const giver = this.players[giverId];
    const challenger = this.players[targetId];

    const index = this.proofIndex(giverId);
    const truthful = index !== -1;
    const penalty = value * 2;
    // Reveal exactly the one card that settles it, never the whole hand.
    const proof = truthful ? giver.hand.splice(index, 1)[0] : null;

    if (truthful) {
      challenger.drinks += penalty;
      this.note(`${challenger.name} called it and was wrong - ${penalty} drinks.`);
    } else {
      giver.drinks += penalty;
      this.note(`${giver.name} was bluffing - ${penalty} drinks.`);
    }

    this.gives.push({ giverId, targetId, challenged: true, truthful });
    this.lastResolution = { giverId, targetId, truthful, penalty, proof };
    this.pending = null;
    this.phase = 'reveal';
    return this.lastResolution;
  }

  dismissReveal() {
    this.lastResolution = null;
    if (this.phase === 'reveal') this.phase = 'table';
  }

  // --- finishing --------------------------------------------------------

  get canFinish() {
    return this.cardsLeft === 0 && Boolean(this.currentSlot);
  }

  finish() {
    if (this.phase !== 'table') return false;
    this.phase = 'over';
    const most = Math.max(...this.players.map((p) => p.hand.length));
    const losers = this.players.filter((p) => p.hand.length === most);
    this.note(
      losers.length === 1
        ? `${losers[0].name} is left holding ${most} - they lose.`
        : `Tied on ${most} cards: ${losers.map((p) => p.name).join(', ')}.`
    );
    return true;
  }

  get losers() {
    if (!this.players.length) return [];
    const most = Math.max(...this.players.map((p) => p.hand.length));
    return this.players.filter((p) => p.hand.length === most);
  }

  note(text) {
    this.log.push(text);
  }

  // --- persistence ------------------------------------------------------
  // A party game lives on one phone that will get locked, dropped and
  // answered mid-round, so the whole state round-trips through localStorage.

  toJSON() {
    return {
      phase: this.phase,
      players: this.players,
      pyramid: this.pyramid,
      log: this.log,
      gives: this.gives,
      pending: this.pending,
      lastResolution: this.lastResolution,
      currentSlotRef: this.currentSlot
        ? { rowIndex: this.currentSlot.rowIndex, cardIndex: this.currentSlot.cardIndex }
        : null,
    };
  }

  static fromJSON(data) {
    const game = new PartyGame();
    if (!data || !Array.isArray(data.players) || !data.players.length) return null;
    Object.assign(game, {
      phase: data.phase,
      players: data.players,
      pyramid: data.pyramid,
      log: data.log ?? [],
      gives: data.gives ?? [],
      pending: data.pending ?? null,
      lastResolution: data.lastResolution ?? null,
    });
    if (data.currentSlotRef) {
      const { rowIndex, cardIndex } = data.currentSlotRef;
      const row = game.pyramid[rowIndex];
      if (row) {
        game.currentSlot = { rowIndex, cardIndex, slot: row.cards[cardIndex], value: row.value };
      }
    }
    return game;
  }
}
