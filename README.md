# Fuck the Bus

A single-player, browser version of the card game **Fuck the Bus** (also known as Ride the Bus).
No build step, no dependencies &mdash; open `index.html` and play.

## Playing it

```sh
# any static server works
npx http-server -p 8080 .
# then open http://localhost:8080
```

Opening `index.html` straight off disk will not work: the code is split into ES modules,
which browsers refuse to load over `file://`.

## Rules

The table game is built around handing out drinks, which does not survive the trip to
single player. Here the drinks are kept as **sips** &mdash; a penalty score you are trying to
keep down &mdash; and the pyramid, which exists only to punish other people, instead buys you
a shorter bus row.

1. **Four guesses.** Red or black (1 sip for a miss), higher or lower (2), inside or
   outside (3), then the suit (4). Ace is high. A tie on higher/lower, or landing on either
   bookend on inside/outside, loses.
2. **The pyramid.** Ten cards in rows of 4&ndash;3&ndash;2&ndash;1, worth 1 to 4 from the bottom up.
   Flip them all; each one matching a rank still in your hand shortens the bus row by that
   row's value. Each card in your hand can only be spent once.
3. **Riding the bus.** A row of face-down cards, flipped one at a time. Number cards pass.
   J, Q, K, A cost 1, 2, 3, 4 sips and send you back to the start of a freshly dealt row.
   Clear the row and you are off the bus.

The row is six cards by default, down to a floor of three. A full ten-card row &mdash; what a
real table would deal &mdash; clears about 3% of the time, which is faithful but not a game.

Your best run (fewest sips, then fewest flips) is kept in `localStorage`.

## Layout

| File | What it holds |
| --- | --- |
| `src/deck.js` | Cards, shuffling, and the card-value rules |
| `src/game.js` | All the game rules and phase state. No DOM access, so it can be driven headlessly |
| `src/main.js` | Rendering, clicks, keyboard, and the best-run store |
| `styles.css` | Table felt, card flip animation, responsive layout |

Keyboard: `1`&ndash;`4` pick a guess option, `space` flips the next bus card and starts a new run.
