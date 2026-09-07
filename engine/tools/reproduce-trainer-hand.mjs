const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function makeDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ suit: s, rank: r });
  return deck;
}

function makeRng(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SEED_BASE = 5000;
const idx = parseInt(process.argv[2] || '1', 10);
const rng = makeRng(SEED_BASE + idx);
const hand = shuffle(makeDeck(), rng).slice(0, 10);

const bySuit = new Map(SUITS.map(s => [s, []]));
for (const c of hand) bySuit.get(c.suit).push(c.rank);
for (const s of SUITS) bySuit.get(s).sort((a, b) => RANKS.indexOf(b) - RANKS.indexOf(a));

console.log(`Ruka ${idx} (seed ${SEED_BASE + idx}):`);
for (const s of SUITS) {
  const ranks = bySuit.get(s);
  if (ranks.length) console.log(`  ${s} ${ranks.join(',')}`);
}
