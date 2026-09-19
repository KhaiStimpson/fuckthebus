# Fuck the Bus

A pass-and-play pyramid drinking game for one phone. No build step, no dependencies.

Live at **https://khaistimpson.github.io/fuckthebus/** &mdash; pushes to the default branch
redeploy it via `.github/workflows/pages.yml`.

## The idea

The pyramid is dealt face down and everyone gets five cards. Flip a pyramid card and
anyone can tell someone to drink, claiming they hold that rank. **The claim is pure table
talk &mdash; the app never asks what you are claiming and never stops you lying.** It holds
everyone's hand for exactly one reason: to settle it when someone calls bullshit.

- **Nobody calls it** &mdash; they drink, and nobody learns anything.
- **They call it** &mdash; the app shows the single card that settles the argument,
  and nothing else in your hand.
  - You had it: the challenger drinks double.
  - You didn't: you drink double.

**Your five cards are yours for the whole game.** Nothing is ever spent, so a card you
prove in a challenge stays in your hand &mdash; the table simply now knows you hold it.
What moves is the drink tally, and when the pyramid runs out whoever took the most
drinks is the loser.

## Passing the phone

Every look at a hand goes through a "pass the phone to X" gate, so nobody sees anyone
else's cards. The deal walks each player through in turn; afterwards **Check my cards**
reaches the same gate. Hands are removed from the page, not just hidden, when you tap away.

The drink tally stays public on the table. Everyone's hand is the same size all game, so
the read on people comes from what they have already been caught doing &mdash; a card
proved once is known for the rest of the round.

## Playing it

```sh
npx http-server -p 8080 .   # any static server
```

Opening `index.html` off disk will not work: the code is split into ES modules, which
browsers refuse to load over `file://`.

## Details

- 2&ndash;8 players. The pyramid is the biggest the deck can still cover after five cards
  each &mdash; five rows up to seven players, four rows at eight.
- Bottom row is worth 1 drink, each row up is worth one more.
- One give per player per flipped card.
- Hands are fixed at five from the deal. Cards are never spent or replaced.
- The round is saved to `localStorage` on every action, so a locked screen or an
  accidental reload does not lose the game.

## Layout

| File | What it holds |
| --- | --- |
| `src/deck.js` | Cards and shuffling |
| `src/game.js` | Rules and state. No DOM access, so it can be driven headlessly |
| `src/main.js` | Screens, the privacy gates, and the challenge reveal |
| `styles.css` | Felt table, cards, phone-first layout |
