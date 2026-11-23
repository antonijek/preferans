// Licitacija, izbor igre i skart: svaku odluku iz zapisane ruke ponavljamo kroz racunarovu logiku i gledamo gde se
// covek (mesto 0) razlikuje od njega (korisnikov zahtev 2026-11-23: "najvise mi treba nacin igranja i licitacija").
// Isto ponavljamo i za racunar (mesta 1 i 2): to je provera da je ponavljanje verno, jer racunar mora da se slaze sam sa sobom.

import { chooseBidAction, chooseDeclareGame } from '../engine/dist/aiBidding.js';
import { estimatedMaxLevel, evaluateHand } from '../engine/dist/aiHandEval.js';
import { chooseDiscard } from '../engine/dist/aiDiscardPlay.js';
import { GAME_VALUES, STANDARD_GAMES } from '../engine/dist/constants.js';

const LETTER = { '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C' };
const TRUMP = { Pik: '♠', Karo: '♦', Herc: '♥', Tref: '♣' };
const toCard = (c) => ({ suit: c.suit, rank: c.rank, id: `${c.rank}${LETTER[c.suit]}` });
const toCards = (list) => list.map(toCard);
const pct = (part, total) => (total === 0 ? '-' : `${Math.round((100 * part) / total)}%`);
const who = (seat) => (seat === 0 ? 'covek' : 'racunar');

/** Svaka odluka u licitaciji sa onim sto bi racunar uradio na istom mestu. */
export function bidDecisions(hand) {
  const bids = hand.bids ?? [];
  const decisions = [];
  const seen = [];
  const passed = new Set();
  const level = [0, 0, 0];
  let current = 0;
  const start = bids[0]?.player;
  for (const bid of bids) {
    if (seen.some((b) => b.type === 'IGRA')) break; // posle "igra" licitacija ide drugim tokom
    const ctx = {
      hand: toCards(hand.hands[bid.player]),
      currentBid: current,
      bidStartPlayer: start,
      currentBidder: bid.player,
      passedPlayers: new Set(passed),
      playerBidLevel: level[bid.player],
      bids: seen.map((b) => ({ ...b })),
    };
    decisions.push({ seat: bid.player, actual: bid, ai: chooseBidAction(ctx) });
    seen.push(bid);
    if (bid.type === 'PASS') passed.add(bid.player);
    else if (bid.type === 'BID') {
      current = bid.value;
      level[bid.player] = bid.value;
    } else if (bid.type === 'MOGU') level[bid.player] = bid.value;
  }
  return decisions;
}

function compare(actual, ai) {
  if (actual.type === ai.type && (actual.value ?? 0) === (ai.value ?? 0)) return 'isto';
  if (actual.type === 'PASS') return 'dalje, a racunar bi licitirao';
  if (ai.type === 'PASS') return 'licitirao, a racunar bi rekao dalje';
  if ((actual.value ?? 0) > (ai.value ?? 0)) return 'licitirao vise od racunara';
  return 'licitirao manje od racunara';
}

function printTable(rowsByGroup, labels) {
  const groups = ['covek', 'racunar'];
  console.log(`${''.padEnd(40)}${groups.map((g) => g.padStart(10)).join('')}`);
  for (const label of labels) {
    const cells = groups.map((g) => {
      const total = Object.values(rowsByGroup[g]).reduce((a, b) => a + b, 0);
      return `${String(rowsByGroup[g][label] ?? 0).padStart(4)} ${pct(rowsByGroup[g][label] ?? 0, total).padStart(4)}`;
    });
    console.log(`${label.padEnd(40)}${cells.map((c) => c.padStart(10)).join('')}`);
  }
}

export function reportBidding(rows) {
  const hands = rows.map((row) => row.hand);

  // ---- licitacija
  console.log('\n== Licitacija: odluka po odluka, poredjenje sa racunarom na istoj ruci');
  const labels = ['isto', 'dalje, a racunar bi licitirao', 'licitirao, a racunar bi rekao dalje', 'licitirao vise od racunara', 'licitirao manje od racunara'];
  const byGroup = { covek: {}, racunar: {} };
  for (const hand of hands) {
    for (const d of bidDecisions(hand)) {
      const label = compare(d.actual, d.ai);
      byGroup[who(d.seat)][label] = (byGroup[who(d.seat)][label] ?? 0) + 1;
    }
  }
  printTable(byGroup, labels);
  const sameAi = byGroup.racunar.isto ?? 0;
  const totalAi = Object.values(byGroup.racunar).reduce((a, b) => a + b, 0);
  console.log(`(provera: racunar se slaze sam sa sobom u ${pct(sameAi, totalAi)} odluka; ako je dosta manje od 100%, ponavljanje nije verno)`);

  // ---- da li smela licitacija placa
  console.log('\n== Da li se smela licitacija isplati (nosilac, ugovor iznad procene racunara)');
  const stats = { covek: { above: [0, 0], within: [0, 0] }, racunar: { above: [0, 0], within: [0, 0] } };
  for (const hand of hands) {
    if (hand.declaredGame === '' || !hand.bids?.length) continue;
    const level = GAME_VALUES[hand.declaredGame];
    const max = estimatedMaxLevel(toCards(hand.hands[hand.declarer]), hand.bids[0].player === hand.declarer);
    const bucket = stats[who(hand.declarer)][level > max ? 'above' : 'within'];
    bucket[0] += 1;
    if (hand.passed) bucket[1] += 1;
  }
  for (const group of ['covek', 'racunar']) {
    const { above, within } = stats[group];
    console.log(`${group.padEnd(8)} ugovor u okviru procene: ${within[0]} ruku, prosao ${pct(within[1], within[0])};  iznad procene: ${above[0]} ruku, prosao ${pct(above[1], above[0])}`);
  }
  console.log('(ako covek iznad procene prolazi isto cesto kao u okviru nje, racunar je previse oprezan)');

  // ---- izbor igre i skart
  console.log('\n== Izbor igre i skart (nosilac)');
  const choice = { covek: { total: 0, sameGame: 0, discards: 0, sameDiscard: 0 }, racunar: { total: 0, sameGame: 0, discards: 0, sameDiscard: 0 } };
  for (const hand of hands) {
    if (hand.declaredGame === '' || hand.declaredGame.startsWith('Igra-') || !hand.discard?.length) continue;
    const seat = hand.declarer;
    const own = hand.hands[seat];
    const talon = hand.talon ?? [];
    if (talon.length !== 2) continue;
    const key = (c) => `${c.rank}${c.suit}`;
    const discarded = new Set(hand.discard.map(key));
    const group = choice[who(seat)];
    // skart: racunar bira iz 12 karata, sa "nameravanom" bojom po proceni ruke
    const twelve = toCards([...own, ...talon]);
    const best = evaluateHand(twelve).bestSuit;
    const [a, b] = chooseDiscard(twelve, best ? best.suit : null);
    group.discards += 1;
    if (discarded.has(key(a)) && discarded.has(key(b))) group.sameDiscard += 1;
    // igra: racunar bira iz 10 karata posle skarta, uz isti ugovor
    const ten = toCards([...own, ...talon].filter((c) => !discarded.has(key(c))));
    const level = Math.max(...hand.bids.filter((x) => x.type === 'BID' || x.type === 'MOGU').map((x) => x.value ?? 0), 2);
    const aiGame = chooseDeclareGame(ten, level, STANDARD_GAMES, hand.bids[0].player === seat);
    group.total += 1;
    if (aiGame === hand.declaredGame) group.sameGame += 1;
  }
  for (const g of ['covek', 'racunar']) {
    const c = choice[g];
    console.log(`${g.padEnd(8)} igru: isto kao racunar u ${pct(c.sameGame, c.total)} od ${c.total};  skart: isto u ${pct(c.sameDiscard, c.discards)} od ${c.discards}`);
  }
  console.log('(za racunar je 100% ocekivano; sve ispod toga kod coveka je razlika u nacinu igre)');

  // ---- gde se razlikuju: najcesce igre koje covek bira, a racunar ne
  console.log('\n== Cega se covek drzi (prva odluka na licitaciji, kad je prvi na redu)');
  const first = { PASS: 0, BID: 0, IGRA: 0 };
  const opening = {};
  for (const hand of hands) {
    const d = bidDecisions(hand).find((x) => x.seat === 0);
    if (!d || d.actual === undefined) continue;
    first[d.actual.type] = (first[d.actual.type] ?? 0) + 1;
    if (d.actual.type === 'BID') opening[d.actual.value] = (opening[d.actual.value] ?? 0) + 1;
  }
  const total = Object.values(first).reduce((a, b) => a + b, 0);
  console.log(`prva odluka: dalje ${pct(first.PASS, total)}, licitira ${pct(first.BID ?? 0, total)}, igra ${pct(first.IGRA ?? 0, total)} (od ${total})`);
  console.log('prva licitacija po visini:', opening);
}
