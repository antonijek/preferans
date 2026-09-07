// Racuna CEO razdel (sve 3 ruke + talon) za dati seed — MORA da koristi
// stvarni engine (ne rucnu reimplementaciju) da bi se tacno poklopilo sa
// onim sto app.js stvarno deli kad se otvori sa ?seed=N u URL-u. Koristi se
// za uzivo kalibraciju igranja karata (korisnik igra u browseru, ja unapred
// znam sve karte pa mozemo komentarisati poteze bez rucnog prepisivanja).
import { Game } from '../dist/game.js';
import { RANK_VALUE } from '../dist/constants.js';

const seed = parseInt(process.argv[2] || '1', 10);
// app.js startGame() UVEK zove game.newHand(0) na pocetku nove partije —
// dealer=0 je podrazumevano ovde da bi se tacno poklopilo (prvi na potezu u
// licitaciji je onda Istok/P1, ne Jug, jer je bidStartPlayer=nextPlayer(dealer)).
const dealer = parseInt(process.argv[3] || '0', 10);

const game = new Game({ seed });
game.newHand(dealer);

const SUIT_ORDER = ['♠', '♥', '♦', '♣'];
const POS = ['Jug (P0)', 'Istok (P1)', 'Zapad (P2)'];
console.log(`Seed ${seed}, dealer=${dealer}, prvi na potezu (licitacija) = ${POS[(dealer + 1) % 3]}`);
for (let p = 0; p < 3; p++) {
  const hand = game.state.players[p].hand
    .slice()
    .sort((a, b) => SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit) || RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
  const bySuit = {};
  for (const c of hand) (bySuit[c.suit] ??= []).push(c.rank);
  const line = ['♠', '♥', '♦', '♣']
    .filter((s) => bySuit[s]?.length)
    .map((s) => `${s}${bySuit[s].join(',')}`)
    .join('  ');
  console.log(`  ${POS[p]}: ${line}`);
}
console.log(`  Talon: ${game.state.talon.map((c) => c.rank + c.suit).join(' ')}`);
