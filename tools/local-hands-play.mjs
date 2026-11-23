// Nacin igranja: dolazak u pratnju, prvi izlaz, davanje karata (korisnikov zahtev 2026-11-23). Covek je mesto 0,
// racunar mesta 1 i 2; svaka mera ide za oba, pa se vidi razlika. Dolazak se ponavlja i kroz racunarovu odluku.

import { chooseFollow } from '../engine/dist/aiFollowKontra.js';
import { evaluateHand } from '../engine/dist/aiHandEval.js';

const LETTER = { '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C' };
const RANK_ORDER = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const TRUMP = { Pik: '♠', Karo: '♦', Herc: '♥', Tref: '♣' };
const toCard = (c) => ({ suit: c.suit, rank: c.rank, id: `${c.rank}${LETTER[c.suit]}` });
const key = (c) => `${c.rank}${c.suit}`;
const pct = (part, total) => (total === 0 ? '-' : `${Math.round((100 * part) / total)}%`);
const who = (seat) => (seat === 0 ? 'covek' : 'racunar');
const GROUPS = ['covek', 'racunar'];
const empty = () => ({ covek: 0, racunar: 0 });
const rankOf = (card) => RANK_ORDER.indexOf(card.rank);
const trumpOf = (game) => TRUMP[game.replace('Igra-', '')] ?? null;

function row(label, values, format) {
  console.log(`${label.padEnd(46)}${GROUPS.map((g) => format(values[g]).padStart(14)).join('')}`);
}
const ratio = ([part, total]) => `${pct(part, total)} (${part}/${total})`;
const pairs = () => ({ covek: [0, 0], racunar: [0, 0] });
const tally = (target, seat, hit) => {
  const bucket = target[who(seat)];
  bucket[1] += 1;
  if (hit) bucket[0] += 1;
};

/** Karte koje svako ima pre prvog stiha: nosilac uzima talon i odbacuje (u "Igra" nema talona). */
function startingHands(hand) {
  const result = hand.hands.map((cards) => cards.map((c) => ({ ...c })));
  if (hand.discard?.length > 0) {
    const own = result[hand.declarer];
    for (const c of hand.talon ?? []) own.push({ ...c });
    const gone = new Set(hand.discard.map(key));
    result[hand.declarer] = own.filter((c) => !gone.has(key(c)));
  }
  return result;
}

export function reportPlay(rows) {
  const hands = rows.map((r) => r.hand);

  // ---- dolazak u pratnju
  console.log('\n== Dolazak u pratnju (branilac odlucuje da li prati)');
  const comes = pairs();
  const agrees = pairs();
  const strength = { covek: { came: [0, 0], stayed: [0, 0] }, racunar: { came: [0, 0], stayed: [0, 0] } };
  for (const hand of hands) {
    if (hand.declaredGame === '' || hand.declaredGame.endsWith('Betl')) continue;
    for (const seat of [0, 1, 2]) {
      if (seat === hand.declarer) continue;
      const choice = hand.followChoices[seat];
      if (choice === null || choice === undefined) continue;
      tally(comes, seat, choice === 'DODJEM');
      const cards = hand.hands[seat].map(toCard);
      const ai = chooseFollow({ hand: cards, declaredGame: hand.declaredGame });
      tally(agrees, seat, ai === choice);
      const bucket = strength[who(seat)][choice === 'DODJEM' ? 'came' : 'stayed'];
      bucket[0] += evaluateHand(cards).total;
      bucket[1] += 1;
    }
  }
  row('dolazi (prati)', comes, ratio);
  row('isto kao racunar na istoj ruci', agrees, ratio);
  for (const g of GROUPS) {
    const { came, stayed } = strength[g];
    console.log(`${g.padEnd(8)} prosek poena ruke kad dolazi: ${came[1] ? (came[0] / came[1]).toFixed(1) : '-'}, kad ne dolazi: ${stayed[1] ? (stayed[0] / stayed[1]).toFixed(1) : '-'}`);
  }

  // ---- izlaz (prva karta stiha)
  console.log('\n== Prvi izlaz u ruci (cime se krece)');
  const leadTrump = { nosilac: pairs(), branilac: pairs() };
  const leadAce = { nosilac: pairs(), branilac: pairs() };
  const leadLow = { nosilac: pairs(), branilac: pairs() };
  const leadLongest = pairs();
  for (const hand of hands) {
    if (hand.tricks.length === 0 || hand.declaredGame === '') continue;
    const trump = trumpOf(hand.declaredGame);
    const start = startingHands(hand);
    const lead = hand.tricks[0][0];
    const role = lead.position === hand.declarer ? 'nosilac' : 'branilac';
    if (trump) tally(leadTrump[role], lead.position, lead.suit === trump);
    tally(leadAce[role], lead.position, lead.rank === 'A');
    tally(leadLow[role], lead.position, rankOf(lead) <= 2);
    // najduza boja van aduta: da li se krece iz nje
    const sideCounts = ['♠', '♥', '♦', '♣'].filter((s) => s !== trump).map((s) => [s, start[lead.position].filter((c) => c.suit === s).length]);
    const longest = Math.max(...sideCounts.map(([, n]) => n));
    if (lead.suit !== trump) tally(leadLongest, lead.position, sideCounts.find(([s]) => s === lead.suit)?.[1] === longest);
  }
  for (const role of ['nosilac', 'branilac']) {
    console.log(`  kad je ${role}:`);
    row('    kreće adutom (u igrama sa adutom)', leadTrump[role], ratio);
    row('    kreće asom', leadAce[role], ratio);
    row('    kreće malom kartom (7, 8, 9)', leadLow[role], ratio);
  }
  row('kreće iz najduže boje van aduta', leadLongest, ratio);

  // ---- sve izlazne karte u ruci (svi stihovi koje neko otvara)
  console.log('\n== Svi izlazi tokom ruke (stihovi koje otvara)');
  const leadsAll = { A: empty(), K: empty(), nizak: empty(), ostalo: empty() };
  const leadsTrumpAll = pairs();
  for (const hand of hands) {
    const trump = trumpOf(hand.declaredGame ?? '');
    for (const trick of hand.tricks) {
      const lead = trick[0];
      const label = lead.rank === 'A' ? 'A' : lead.rank === 'K' ? 'K' : rankOf(lead) <= 2 ? 'nizak' : 'ostalo';
      leadsAll[label][who(lead.position)] += 1;
      if (trump) tally(leadsTrumpAll, lead.position, lead.suit === trump);
    }
  }
  const leadTotals = { covek: 0, racunar: 0 };
  for (const label of Object.keys(leadsAll)) for (const g of GROUPS) leadTotals[g] += leadsAll[label][g];
  for (const [label, text] of [['A', 'as'], ['K', 'kralj'], ['nizak', '7, 8 ili 9'], ['ostalo', 'ostale (10, J, Q)']]) {
    row(`izlaz kartom: ${text}`, { covek: [leadsAll[label].covek, leadTotals.covek], racunar: [leadsAll[label].racunar, leadTotals.racunar] }, ratio);
  }
  row('izlaz adutom', leadsTrumpAll, ratio);

  // ---- davanje karata (pratnja uz boju)
  console.log('\n== Kad prati boju (ima bar dve karte te boje)');
  const low = pairs();
  const high = pairs();
  const wins = pairs();
  for (const hand of hands) {
    if (hand.tricks.length === 0) continue;
    const remaining = startingHands(hand).map((cards) => new Map(cards.map((c) => [key(c), c])));
    for (const trick of hand.tricks) {
      const ledSuit = trick[0].suit;
      let best = trick[0];
      for (let i = 0; i < trick.length; i++) {
        const play = trick[i];
        const held = [...remaining[play.position].values()].filter((c) => c.suit === ledSuit);
        if (i > 0 && play.suit === ledSuit && held.length >= 2) {
          const ranks = held.map(rankOf);
          tally(low, play.position, rankOf(play) === Math.min(...ranks));
          tally(high, play.position, rankOf(play) === Math.max(...ranks));
          // da li je mogao da uzme stih a nije (trenutno najjaca karta u boji je ispod njegove najvise)
          if (best.suit === ledSuit) tally(wins, play.position, rankOf(play) > rankOf(best));
        }
        if (play.suit === ledSuit && rankOf(play) > rankOf(best) && best.suit === ledSuit) best = play;
        remaining[play.position].delete(key(play));
      }
    }
  }
  row('daje najmanju kartu u boji', low, ratio);
  row('daje najvecu kartu u boji', high, ratio);
  row('prebija trenutno najjacu kartu u boji', wins, ratio);

  // ---- nosilac: uspeh i skart
  console.log('\n== Uspeh kao nosilac');
  const passed = pairs();
  const asDeclarer = { covek: [0, 0], racunar: [0, 0] };
  for (const hand of hands) {
    if (hand.declaredGame === '') continue;
    tally(passed, hand.declarer, hand.passed);
    asDeclarer[who(hand.declarer)][0] += hand.tricksWon[hand.declarer];
    asDeclarer[who(hand.declarer)][1] += 1;
  }
  row('prosao', passed, ratio);
  row('prosek stihova kao nosilac', asDeclarer, ([sum, n]) => (n ? (sum / n).toFixed(1) : '-'));
  const discardStats = { covek: { n: 0, honors: 0, same: 0, trump: 0 }, racunar: { n: 0, honors: 0, same: 0, trump: 0 } };
  for (const hand of hands) {
    if (!hand.discard || hand.discard.length !== 2 || hand.declaredGame === '') continue;
    const trump = trumpOf(hand.declaredGame);
    const stat = discardStats[who(hand.declarer)];
    stat.n += 1;
    stat.honors += hand.discard.filter((c) => c.rank === 'A' || c.rank === 'K').length > 0 ? 1 : 0;
    stat.same += hand.discard[0].suit === hand.discard[1].suit ? 1 : 0;
    stat.trump += hand.discard.some((c) => c.suit === trump) ? 1 : 0;
  }
  row('skart sadrzi asa ili kralja', { covek: [discardStats.covek.honors, discardStats.covek.n], racunar: [discardStats.racunar.honors, discardStats.racunar.n] }, ratio);
  row('skart: obe karte iste boje', { covek: [discardStats.covek.same, discardStats.covek.n], racunar: [discardStats.racunar.same, discardStats.racunar.n] }, ratio);
  row('skart sadrzi adut', { covek: [discardStats.covek.trump, discardStats.covek.n], racunar: [discardStats.racunar.trump, discardStats.racunar.n] }, ratio);
}
