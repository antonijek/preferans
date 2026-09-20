import type { RoomState } from '../rooms/RoomState.js';
import type { Position } from '../../../engine/dist/types.js';
import { redactStateFor } from '../redact.js';
import type { Viewer } from '../redact.js';
import { applyAction } from './gameEvents.js';
import { computeAiAction } from '../ai/aiSeat.js';
import { getUserRating, updateUserRating, saveMatchLog } from '../db.js';
import { calculateRatingDeltas } from '../../../engine/dist/scoring.js';
import type { HandSnapshot } from '../rooms/RoomState.js';
import { persistRoom } from '../rooms/RoomManager.js';

// A couple of small values (whose turn it is to kontra, which of MY OWN
// cards are currently legal to play) require private engine logic
// (`followersInKontraOrder`, trick-following rules) that isn't worth
// duplicating client-side — the server already has the authoritative `Game`
// instance right here, so it just computes them once and rides along with
// the redacted state. Neither leaks anything: expectedKontraPlayer is public
// (same visibility as currentBidder/currentPlayer), and legalCards is
// derived purely from cards the viewer can already see (their own hand).
export function buildClientState(room: RoomState, viewer: Viewer) {
  const redacted = redactStateFor(room.game.state, viewer);
  const legalCards =
    viewer.type === 'player' && room.game.state.phase === 'PLAYING'
      ? room.game.getLegalCards(viewer.seat)
      : [];
  // The engine's Player.name is always the generic 'Jug'/'Istok'/'Zapad'
  // (the Game is constructed with no playerNames override) — swap in the
  // real registered name per seat so the client can show who's actually
  // playing instead of a fixed position label. Not secret, safe for
  // players AND spectators alike.
  const players = redacted.players.map((p, i) => ({
    ...p,
    name: room.seatNames[i] ?? p.name,
    // Ranking sistem (korisnikov zahtev 2026-09-10) — rejting keshiran u
    // room.seatRatings (osvezen na ulazak u sobu i posle svakog kraja
    // partije), ubacen ovde da klijent moze da prikaze "Ime (rejting)".
    rating: room.seatRatings[i]!,
  }));
  return {
    ...redacted,
    players,
    expectedKontraPlayer: room.game.expectedKontraPlayerPublic(),
    legalCards,
    // Korisnikov zahtev: kad neko napusti partiju, ostali nisu imali NIKAKAV
    // signal da AI sad igra za njega — izgledalo je kao da ta osoba i dalje
    // stvarno licitira/igra ("izgleda da je on licitirao Mogu 4"). Klijent
    // ovo koristi da doda "(AI)" pored imena i da jednom prikaze banner.
    abandonedSeat: room.abandonedSeat,
    // Uzivo prijavljen bag (2026-09-20): "kad udjem na tabelu nema istorije
    // ruku, sve prazno" — klijentski handHistory (app.js) je CISTO
    // akumuliran u browseru, nikad se nije obnavljao sa servera, pa je
    // svaki reconnect (ostavi tab, vrati se kasnije) brisao celu istoriju
    // iako je server (room.handsHistory, koristi se i za match_log) sve
    // vreme imao kompletne podatke. Klijent ovo koristi da obnovi
    // handHistory kad primeti da mu fali.
    handsHistory: room.handsHistory,
  };
}

export function broadcastRoomState(room: RoomState): void {
  // PRIVREMENO dijagnosticko logovanje (uzivo prijavljeno: "sva trojica udju
  // u sobu, karte se podele samo jednom, ostali ostaju u predsoblju") —
  // ukloniti posle potvrde uzroka. connected=false bi znacio da server MISLI
  // da je sediste popunjeno ali socket vise nije zivo (npr. tih disconnect
  // koji nije ocistio seat) — upravo ono sto bi objasnilo "stuck" klijente.
  console.log(
    `[JOIN DEBUG] broadcastRoomState room=${room.code} phase=${room.game.state.phase} ` +
    `seats=${room.sockets.map((s, i) => `${i}:${room.seatUserIds[i] ?? '-'}:${s ? (s.connected ? 'live' : 'dead') : 'empty'}`).join(',')}`
  );
  room.sockets.forEach((socket, seat) => {
    socket?.emit('game:state', buildClientState(room, { type: 'player', seat: seat as Position }));
  });
  room.spectators.forEach((spectator) => {
    spectator.socket?.emit(
      'game:state',
      buildClientState(room, { type: 'spectator', kibicSeats: spectator.kibicSeats })
    );
  });
  // Istorija partija (korisnikov zahtev 2026-09-11) — snapshot GameState-a
  // na kraju SVAKE ruke (pre nego sto newHand() resetuje). Guard na
  // handSnapshotTaken da spreci dupli push ako se broadcastRoomState
  // pozove vise puta dok je GAME_OVER (game:viewCards, chat, itd).
  if (room.game.state.phase === 'GAME_OVER' && !room.handSnapshotTaken) {
    room.handSnapshotTaken = true;
    room.handsHistory.push(captureHandSnapshot(room));
  }
  // newHand() ce da okrene handSnapshotTaken nazad na false (roomEvents.ts
  // dealNextHand — dodato tamo).

  // Ranking sistem (korisnikov zahtev 2026-09-10) — ovo je JEDINO mesto gde
  // se rezultat partije trajno upisuje, bez obzira KOJI put je doveo do
  // MATCH_OVER (prirodan kraj, "predlog za kraj", napustanje-pa-kraj) —
  // izbegava dupli obracun ako bi vise poziva slucajno oba vodila ovamo.
  if (room.game.state.phase === 'MATCH_OVER' && !room.matchRankingResolved) {
    room.matchRankingResolved = true;
    resolveMatchRanking(room);
  }
  // Trajno cuvanje (korisnikov zahtev 2026-09-18) — ovaj choke point vec
  // pokriva SVAKU stvarnu promenu partije, isto mesto gde se i klijentima
  // salje sveze stanje. Jeftino (samo azurira in-memory sql.js, stvarni
  // disk-upis je vec debounced preko db.ts persist()).
  persistRoom(room);
  maybeDriveAiTurn(room);
  maybeAutoAdvanceHand(room);
}

// Istorija partija (korisnikov zahtev 2026-09-11) — kompaktan snapshot
// GameState-a dovoljan za replay analizu. Cuva se u room.handsHistory i
// na kraju partije ceo niz ide u match_log.hands_json.
function captureHandSnapshot(room: RoomState): HandSnapshot {
  const s = room.game.state;
  return {
    round: s.round,
    endedAt: new Date().toISOString(),
    declarer: s.winner ?? 0,
    declaredGame: s.declaredGame ?? '',
    caller: s.caller,
    callee: s.callee,
    followChoices: [s.followChoices[0], s.followChoices[1], s.followChoices[2]],
    kontraLevel: s.kontraLevel,
    passed: s.lastHandResult?.passed ?? false,
    bulasAfter: [...s.bulas] as [number, number, number],
    supeDelta: s.lastHandResult?.supeDelta ?? [0, 0, 0],
    tricks: s.tricks.map((trick) =>
      trick.map((tc) => ({
        position: tc.player,
        suit: tc.card.suit,
        rank: tc.card.rank,
      }))
    ),
    tricksWon: [
      s.players[0]!.tricksWon,
      s.players[1]!.tricksWon,
      s.players[2]!.tricksWon,
    ],
    talon: (s.lastTalon.length ? s.lastTalon : s.talon).map((c) => ({
      suit: c.suit,
      rank: c.rank,
    })),
  };
}

// Online sobe ranije nisu imale NIKAKAV mehanizam da predju na sledecu ruku
// posle GAME_OVER (lokalni mod ima "Igraj" dugme koje zove nextRound() na
// klijentu, ali to nikad nije povezano sa serverom) — partija bi se stvarno
// zaglavila na ekranu rezultata zauvek. GAME_OVER = kraj RUKE (partija
// nastavlja dok bule ne padnu na 0, RULES 9.1); MATCH_OVER = kraj CELE
// partije, tu se namerno NE nastavlja automatski. `abandonedSeat` ostaje
// netaknut preko poziva newHand() (AI nastavlja da vozi tu poziciju u
// sledecim rukama) SVE DOK se taj isti igrac stvarno ne vrati — tad ga
// joinAsPlayer() cisti (vidi tamo). Ovo se poklapa sa onim sto potvrdno
// dugme za "Napusti partiju" korisniku obecava ("AI preuzima do kraja OVE
// ruke", ne cele partije) — uzivo prijavljen bag: `abandonedSeat` se ranije
// NIGDE nije ciscio, pa je AI ostajao zaglavljen na tom sedistu zauvek i
// posle povratka (nikad ne bi dobio ni dugmad za licitaciju).
const NEXT_HAND_DELAY_MS = 9000;

// Deljena logika za "stvarno predji na sledecu ruku" — poziva je i tajmer i
// rucni game:dealNext. Isto sto lokalni mod radi u nextRound() (app.js) —
// round++ i diler rotira na sledeceg igraca (newHand()'s podrazumevani
// parametar bez argumenta bi ponovo koristio ISTOG dilera).
export function dealNextHand(room: RoomState): void {
  room.dealNextReady = new Set();
  room.game.state.round++;
  room.game.newHand(((room.game.state.dealer + 1) % 3) as Position);
  // Istorija partija (korisnikov zahtev 2026-09-11) — nova ruka pocela,
  // dozvoli ponovni snapshot kad zavrsi.
  room.handSnapshotTaken = false;
  broadcastRoomState(room);
}

// Sedista koja MORAJU kliknuti "Deli" pre nego sto se prevremeno (pre
// isteka auto-tajmera) predje na sledecu rundu — napusteno sediste (AI
// preuzeo) ne moze kliknuti nista, pa se ne racuna.
export function activeSeatsForRoom(room: RoomState): Position[] {
  return ([0, 1, 2] as Position[]).filter((s) => s !== room.abandonedSeat);
}

// Korisnikov zahtev (2026-09-10) — kraj partije (bilo prirodan, "predlog za
// kraj", ili napustanje-pa-kraj) uvek zavrsava istim korakom: izracunaj
// plasman, azuriraj trajni rejting sve trojice (ukljucujuci eventualno
// napustenog — i on dobija/gubi bodove), i obavesti sobu.
function resolveMatchRanking(room: RoomState): void {
  const scores = room.game.getMatchScores();
  const ratings: [number, number, number] = [0, 0, 0];
  for (const seat of [0, 1, 2] as Position[]) {
    const uid = room.seatUserIds[seat];
    ratings[seat] = uid !== null ? getUserRating(uid) : 1000;
  }
  const deltas = calculateRatingDeltas(scores, ratings);
  const newRatings: [number, number, number] = [0, 0, 0];
  for (const seat of [0, 1, 2] as Position[]) {
    const uid = room.seatUserIds[seat];
    const updated = ratings[seat]! + deltas[seat]!;
    newRatings[seat] = updated;
    if (uid !== null) {
      updateUserRating(uid, updated);
      room.seatRatings[seat] = updated;
    }
  }
  const payload = { scores, deltas, newRatings };
  room.sockets.forEach((socket) => socket?.emit('game:matchRankingResult', payload));
  room.spectators.forEach((spectator) => spectator.socket?.emit('game:matchRankingResult', payload));

  // Istorija partija (korisnikov zahtev 2026-09-11) — snima JEDAN red u
  // match_log sa JSON-serijalizovanim nizovima. matchEndReason je uvek
  // postavljen engine-om (natural/agreed/leave) kad dodjemo dovde.
  const reason = room.game.state.matchEndReason ?? 'natural';
  saveMatchLog({
    room_code: room.code,
    match_end_reason: reason,
    rounds_played: room.game.state.round,
    player0_user_id: room.seatUserIds[0],
    player1_user_id: room.seatUserIds[1],
    player2_user_id: room.seatUserIds[2],
    player0_name: room.seatNames[0],
    player1_name: room.seatNames[1],
    player2_name: room.seatNames[2],
    final_bulas: [...room.game.state.bulas] as [number, number, number],
    final_scores: scores,
    rating_deltas: deltas,
    new_ratings: newRatings,
    hands_json: JSON.stringify(room.handsHistory),
  });
}

function maybeAutoAdvanceHand(room: RoomState): void {
  if (room.game.state.phase !== 'GAME_OVER' || room.nextHandScheduled) return;
  // Korisnikov zahtev (2026-09-10): "kad neko pobegne nemoj AI da
  // zamenjuje nego igraci posle nekog cekanja mogu da zavrse na prekid
  // partije" — AI zavrsava (neizbezno) rukU KOJA JE VEC U TOKU kad neko
  // ode, ali se NIKAD ne deli NOVA ruka dok je abandonedSeat postavljen.
  // Preostala dva igraca vide "Predlozi prekid partije" (game:proposeEndMatch,
  // activeSeatsForRoom vec iskljucuje napusteno sediste) umesto da partija
  // tiho nastavi sa AI na trecem mestu unedogled.
  if (room.abandonedSeat !== null) return;
  room.nextHandScheduled = true;
  room.nextHandTimeout = setTimeout(() => {
    room.nextHandScheduled = false;
    room.nextHandTimeout = null;
    // Neko je u medjuvremenu vec nastavio/promenio stanje — ne diraj nista.
    if (room.game.state.phase !== 'GAME_OVER') return;
    dealNextHand(room);
  }, NEXT_HAND_DELAY_MS);
}

// After a player leaves via game:leave, their seat is driven by the server
// AI (server/src/ai/aiSeat.ts, a port of app.js's existing AI orchestration)
// until this hand reaches a terminal phase — see plan "Leave Match With
// Consequences". getLegalActions() (engine/src/game.ts) is re-read fresh on
// every tick rather than captured in the closure: single-threaded Node means
// nothing else mutates room.game between ticks, so a plain re-check is
// enough to notice the hand ended without a separate staleness guard.
function maybeDriveAiTurn(room: RoomState): void {
  if (room.abandonedSeat === null) return;
  const actions = room.game.getLegalActions();
  if (actions.length === 0 || actions[0]!.player !== room.abandonedSeat) return;
  setTimeout(() => {
    if (room.abandonedSeat === null) return;
    const freshActions = room.game.getLegalActions();
    if (freshActions.length === 0 || freshActions[0]!.player !== room.abandonedSeat) return;
    const action = computeAiAction(room.game, room.abandonedSeat);
    if (action) applyAction(room.game, action);
    broadcastRoomState(room);
  }, 600);
}
