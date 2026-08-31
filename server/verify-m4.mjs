import { redactStateFor } from './dist/redact.js';

// Live hand-isolation over real sockets is exercised end-to-end by
// verify-m5.mjs (via real rooms) — this file focuses on the nuanced,
// hard-to-trigger-live staged visibility rules (lastTalon/discard around
// game declaration) as a direct unit test of redactStateFor.

let failed = false;

function check(label, condition) {
  console.log((condition ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!condition) failed = true;
}

function unitTest() {
  console.log('=== Unit test: redactStateFor staged talon/discard visibility ===');

  const fakeCard = (id) => ({ id, suit: '♠', rank: '7' });
  const baseState = {
    phase: 'DECLARING',
    round: 1,
    dealer: 0,
    players: [
      { id: '0', name: 'Jug', position: 0, hand: [fakeCard('a')], tricksWon: 0, stihi: [], hasPassedBid: false, bidLevel: 2, kontraLevel: null, follows: null, igraEligible: false },
      { id: '1', name: 'Istok', position: 1, hand: [fakeCard('b')], tricksWon: 0, stihi: [], hasPassedBid: true, bidLevel: 0, kontraLevel: null, follows: null, igraEligible: false },
      { id: '2', name: 'Zapad', position: 2, hand: [fakeCard('c')], tricksWon: 0, stihi: [], hasPassedBid: true, bidLevel: 0, kontraLevel: null, follows: null, igraEligible: false },
    ],
    currentPlayer: 0, currentBidder: 0, currentBid: 2, bids: [],
    winner: 0, winnerGame: null, bidStartPlayer: 1,
    declaredGame: null, trump: null,
    talon: [], lastTalon: [fakeCard('talon1'), fakeCard('talon2')],
    discard: [fakeCard('disc1'), fakeCard('disc2')],
    currentTrick: [], tricks: [], trickCount: 0,
    followChoices: [null, null, null], caller: null, callee: null,
    kontraPlayer: null, kontraLevel: null, mozeCount: 0, refeOccurred: false,
    igraPlayer: null, scores: [0, 0, 0], bulas: [0, 0, 0],
    refeCount: [0, 0, 0], refePending: [0, 0, 0],
    igraCompetitors: null, igraDeclarations: {}, lastHandResult: null,
  };

  // BEFORE declaration (declaredGame === null): lastTalon should be PUBLIC to everyone
  const beforeDeclare_nonDeclarer = redactStateFor(baseState, { type: 'player', seat: 1 });
  check('lastTalon public to non-declarer BEFORE declaration', beforeDeclare_nonDeclarer.lastTalon.length === 2);
  check('discard still hidden from non-declarer even before declaration', beforeDeclare_nonDeclarer.discard.length === 0);

  const declaredState = { ...baseState, declaredGame: 'Herc' };

  // AFTER declaration: lastTalon hidden from non-declarer, visible to declarer
  const afterDeclare_nonDeclarer = redactStateFor(declaredState, { type: 'player', seat: 1 });
  const afterDeclare_declarer = redactStateFor(declaredState, { type: 'player', seat: 0 });
  check('lastTalon HIDDEN from non-declarer AFTER declaration', afterDeclare_nonDeclarer.lastTalon.length === 0);
  check('lastTalon still visible to declarer AFTER declaration', afterDeclare_declarer.lastTalon.length === 2);
  check('discard visible ONLY to declarer', afterDeclare_declarer.discard.length === 2 && afterDeclare_nonDeclarer.discard.length === 0);

  // Spectator with no kibic grants sees nothing private
  const spectatorNoGrant = redactStateFor(declaredState, { type: 'spectator', kibicSeats: new Set() });
  check('spectator (no kibic) sees no hands', spectatorNoGrant.players.every((p) => p.hand.length === 0));
  check('spectator (no kibic) sees no discard/lastTalon', spectatorNoGrant.discard.length === 0 && spectatorNoGrant.lastTalon.length === 0);

  // Spectator granted kibic on seat 0 sees ONLY seat 0's hand
  const spectatorKibic0 = redactStateFor(declaredState, { type: 'spectator', kibicSeats: new Set([0]) });
  check('spectator with kibic(seat0) sees seat0 hand', spectatorKibic0.players[0].hand.length === 1);
  check('spectator with kibic(seat0) still hidden from seat1/seat2', spectatorKibic0.players[1].hand.length === 0 && spectatorKibic0.players[2].hand.length === 0);
}

unitTest();
console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
