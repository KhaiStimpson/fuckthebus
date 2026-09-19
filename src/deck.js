// Card model and deck helpers. No DOM access in here.

export const SUITS = [
  { key: 'spades', symbol: '♠', color: 'black' },
  { key: 'hearts', symbol: '♥', color: 'red' },
  { key: 'diamonds', symbol: '♦', color: 'red' },
  { key: 'clubs', symbol: '♣', color: 'black' },
];

// Ace is high everywhere in this game: higher/lower, inside/outside, and the
// bus (where an ace is the worst card you can flip).
export const RANKS = [
  { key: '2', value: 2 },
  { key: '3', value: 3 },
  { key: '4', value: 4 },
  { key: '5', value: 5 },
  { key: '6', value: 6 },
  { key: '7', value: 7 },
  { key: '8', value: 8 },
  { key: '9', value: 9 },
  { key: '10', value: 10 },
  { key: 'J', value: 11 },
  { key: 'Q', value: 12 },
  { key: 'K', value: 13 },
  { key: 'A', value: 14 },
];

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        rank: rank.key,
        value: rank.value,
        suit: suit.key,
        symbol: suit.symbol,
        color: suit.color,
      });
    }
  }
  return deck;
}

// Fisher-Yates, in place.
export function shuffle(deck, random = Math.random) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function cardLabel(card) {
  return `${card.rank}${card.symbol}`;
}

// A bus row only lets you past the number cards.
export function isFaceOrAce(card) {
  return card.value >= 11;
}

// J = 1, Q = 2, K = 3, A = 4.
export function busPenalty(card) {
  return isFaceOrAce(card) ? card.value - 10 : 0;
}
