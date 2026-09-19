// Game rules for the single-player version of Fuck the Bus.
//
// Three phases:
//   1. guess   - the four classic guesses, each miss costs sips
//   2. pyramid - matches against your four cards shorten the bus row
//   3. bus     - flip a row of cards; a face card or ace sends you back to the start
//
// The class holds all state and exposes one method per player action. It never
// touches the DOM so the rules stay testable on their own.

import { createDeck, shuffle, isFaceOrAce, busPenalty } from './deck.js';

export const GUESS_STEPS = [
  { key: 'color', prompt: 'Red or black?', penalty: 1, options: ['red', 'black'] },
  { key: 'highLow', prompt: 'Higher or lower?', penalty: 2, options: ['higher', 'lower'] },
  { key: 'inOut', prompt: 'Inside or outside?', penalty: 3, options: ['inside', 'outside'] },
  { key: 'suit', prompt: 'Pick the suit', penalty: 4, options: ['spades', 'hearts', 'diamonds', 'clubs'] },
];

// Bottom row is worth 1, apex is worth 4 - the usual pyramid values.
export const PYRAMID_ROWS = [
  { size: 4, value: 1 },
  { size: 3, value: 2 },
  { size: 2, value: 3 },
  { size: 1, value: 4 },
];

// A full 10-card row clears about 3% of the time, which is authentic but
// unplayable solo. Six cards keeps it a real gamble (~12% a run) and the
// pyramid can pull it down to three.
export const MAX_BUS_LENGTH = 6;
export const MIN_BUS_LENGTH = 3;

export class Game {
  constructor({ random = Math.random } = {}) {
    this.random = random;
    this.reset();
  }

  reset() {
    this.deck = shuffle(createDeck(), this.random);
    this.phase = 'guess';
    this.hand = [];
    this.guessStep = 0;
    this.guessResults = [];
    this.penalties = 0;
    this.pyramid = [];
    this.pyramidFlipped = 0;
    this.busRow = [];
    this.busPosition = 0;
    this.busAttempts = 1;
    this.busFlips = 0;
    this.busLength = MAX_BUS_LENGTH;
    this.log = [];
  }

  // The deck is small enough that a long bus run can drain it, so top it up
  // with a freshly shuffled deck rather than ending the game early.
  draw() {
    if (this.deck.length === 0) {
      this.deck = shuffle(createDeck(), this.random);
      this.note('Deck ran out - shuffling a fresh one.');
    }
    return this.deck.pop();
  }

  note(text) {
    this.log.push(text);
  }

  get currentGuess() {
    return GUESS_STEPS[this.guessStep] ?? null;
  }

  get guessesCorrect() {
    return this.guessResults.filter((r) => r.correct).length;
  }

  // --- Phase 1: the four guesses ------------------------------------------

  submitGuess(choice) {
    if (this.phase !== 'guess') return null;
    const step = this.currentGuess;
    if (!step || !step.options.includes(choice)) return null;

    const card = this.draw();
    const correct = this.checkGuess(step.key, choice, card);
    this.hand.push(card);

    if (!correct) this.penalties += step.penalty;
    const result = { step: step.key, choice, card, correct, penalty: correct ? 0 : step.penalty };
    this.guessResults.push(result);
    this.note(
      correct
        ? `${step.prompt} ${choice} - right, ${card.rank}${card.symbol}.`
        : `${step.prompt} ${choice} - wrong, ${card.rank}${card.symbol}. ${step.penalty} sip${step.penalty === 1 ? '' : 's'}.`
    );

    this.guessStep += 1;
    if (this.guessStep >= GUESS_STEPS.length) this.startPyramid();
    return result;
  }

  checkGuess(key, choice, card) {
    switch (key) {
      case 'color':
        return card.color === choice;
      case 'highLow': {
        // A tie counts against you, same as at a real table.
        const first = this.hand[0].value;
        if (card.value === first) return false;
        return choice === 'higher' ? card.value > first : card.value < first;
      }
      case 'inOut': {
        const low = Math.min(this.hand[0].value, this.hand[1].value);
        const high = Math.max(this.hand[0].value, this.hand[1].value);
        // Matching either bookend is not inside and not outside - it loses.
        if (card.value === low || card.value === high) return false;
        const inside = card.value > low && card.value < high;
        return choice === 'inside' ? inside : !inside;
      }
      case 'suit':
        return card.suit === choice;
      default:
        return false;
    }
  }

  // --- Phase 2: the pyramid ----------------------------------------------

  startPyramid() {
    this.phase = 'pyramid';
    this.pyramid = PYRAMID_ROWS.map((row, rowIndex) => ({
      value: row.value,
      cards: Array.from({ length: row.size }, () => ({
        card: this.draw(),
        revealed: false,
        matched: false,
        rowIndex,
      })),
    }));
    // Hand cards get spent on matches, so track which are still live.
    this.handSpent = this.hand.map(() => false);
    this.note(`Guesses done: ${this.guessesCorrect}/4. Pyramid time - every match shortens the bus.`);
  }

  get pyramidReduction() {
    return this.pyramid.reduce(
      (total, row) => total + row.cards.filter((slot) => slot.matched).length * row.value,
      0
    );
  }

  get pyramidTotal() {
    return PYRAMID_ROWS.reduce((n, row) => n + row.size, 0);
  }

  flipPyramid(rowIndex, cardIndex) {
    if (this.phase !== 'pyramid') return null;
    const slot = this.pyramid[rowIndex]?.cards[cardIndex];
    if (!slot || slot.revealed) return null;

    slot.revealed = true;
    this.pyramidFlipped += 1;

    // Spend the first unspent hand card of the same rank.
    const handIndex = this.hand.findIndex(
      (card, i) => !this.handSpent[i] && card.rank === slot.card.rank
    );
    if (handIndex !== -1) {
      this.handSpent[handIndex] = true;
      slot.matched = true;
      slot.handIndex = handIndex;
      const value = this.pyramid[rowIndex].value;
      this.note(
        `${slot.card.rank}${slot.card.symbol} matches your ${this.hand[handIndex].rank}${this.hand[handIndex].symbol} - bus row shorter by ${value}.`
      );
    }

    if (this.pyramidFlipped >= this.pyramidTotal) this.startBus();
    return slot;
  }

  // --- Phase 3: riding the bus -------------------------------------------

  startBus() {
    this.phase = 'bus';
    this.busLength = Math.max(MIN_BUS_LENGTH, MAX_BUS_LENGTH - this.pyramidReduction);
    this.dealBusRow();
    this.note(`Riding the bus: ${this.busLength} card${this.busLength === 1 ? '' : 's'} to clear.`);
  }

  dealBusRow() {
    this.busRow = Array.from({ length: this.busLength }, () => ({
      card: this.draw(),
      revealed: false,
    }));
    this.busPosition = 0;
  }

  flipBus() {
    if (this.phase !== 'bus') return null;
    const slot = this.busRow[this.busPosition];
    if (!slot || slot.revealed) return null;

    slot.revealed = true;
    this.busFlips += 1;

    if (!isFaceOrAce(slot.card)) {
      this.busPosition += 1;
      if (this.busPosition >= this.busRow.length) {
        this.phase = 'done';
        this.note(`Clear! Off the bus in ${this.busFlips} flips.`);
        return { card: slot.card, survived: true, escaped: true, penalty: 0 };
      }
      return { card: slot.card, survived: true, escaped: false, penalty: 0 };
    }

    const penalty = busPenalty(slot.card);
    this.penalties += penalty;
    this.busAttempts += 1;
    this.note(
      `${slot.card.rank}${slot.card.symbol} - ${penalty} sip${penalty === 1 ? '' : 's'} and back to the start. Attempt ${this.busAttempts}.`
    );
    return { card: slot.card, survived: false, escaped: false, penalty, reset: true };
  }

  // Called by the UI after it has shown the losing card, so the reset reads
  // as a consequence rather than happening mid-animation.
  resetBusRow() {
    if (this.phase !== 'bus') return;
    this.dealBusRow();
  }

  get summary() {
    return {
      penalties: this.penalties,
      guessesCorrect: this.guessesCorrect,
      pyramidReduction: this.pyramidReduction,
      busLength: this.busLength,
      busFlips: this.busFlips,
      busAttempts: this.busAttempts,
    };
  }
}
