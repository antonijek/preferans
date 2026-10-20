import type { RoomState } from '../rooms/RoomState.js';
import type { Position } from '../../../engine/dist/types.js';
import { redactStateFor } from '../redact.js';
import type { Viewer } from '../redact.js';
import { playAiTurn } from '../ai/botTurn.js';
import { getUserRating, updateUserRating, saveMatchLog } from '../db.js';
import { calculateRatingDeltas } from '../../../engine/dist/scoring.js';
import type { HandSnapshot, ChatMessage } from '../rooms/RoomState.js';
import { CHAT_LOG_LIMIT } from '../rooms/RoomState.js';
import { persistRoom } from '../rooms/RoomManager.js';
import { notifyUser } from '../push.js';
import { countsForLeague, MIN_HANDS_FOR_EARLY_END } from '../leagueStandings.js';
import { initialHands } from '../handRecord.js';

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
    // racunar nema rejting (partija sa njim se i ne racuna za rejting)
    rating: room.botSeats.has(i as Position) ? null : room.seatRatings[i]!,
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
    // Mesta koja od pocetka drzi racunar — klijent dodaje "(AI)" uz ime.
    botSeats: Array.from(room.botSeats),
    unrated: room.hadBots,
    // Vreme za potez: preostalo racunato SAD (ne apsolutni rok) — sat
    // klijenta i servera ne moraju da se slazu.
    // ko je na potezu (i bez vremena za potez) — klijent menja naslov
    // kartice u "Tvoj potez" dok je stranica u pozadini
    actorSeat: turnActor(room),
    league: room.leagueId !== null ? { id: room.leagueId, name: room.leagueName } : null,
    turnSeat: room.turnDeadline !== null ? turnActor(room) : null,
    turnRemainingMs: room.turnDeadline !== null ? Math.max(0, room.turnDeadline - Date.now()) : null,
    turnTotalMs: room.turnTotalMs,
    // Uzivo prijavljen bag (2026-09-20): "kad udjem na tabelu nema istorije
    // ruku, sve prazno" — klijentski handHistory (app.js) je CISTO
    // akumuliran u browseru, nikad se nije obnavljao sa servera, pa je
    // svaki reconnect (ostavi tab, vrati se kasnije) brisao celu istoriju
    // iako je server (room.handsHistory, koristi se i za match_log) sve
    // vreme imao kompletne podatke. Klijent ovo koristi da obnovi
    // handHistory kad primeti da mu fali.
    // bez pocetnih ruku/licitacije/skarta — klijentu ne trebaju, a ovo ide
    // uz SVAKO stanje (te podatke cita samo pregled partije, iz match_log)
    handsHistory: room.handsHistory.map(({ hands, bids, discard, kontraPlayer, ...h }) => h),
  };
}

export function broadcastRoomState(room: RoomState): void {
  // pre slanja stanja, da klijenti dobiju vec postavljen sat za potez
  maybeScheduleTurnTimer(room);
  maybeNotifyTurn(room);
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
  // Ruka kojom partija prirodno zavrsava ide pravo u MATCH_OVER (bez
  // GAME_OVER) — i nju treba snimiti, inace poslednja ruka fali u istoriji.
  const s = room.game.state;
  const handJustEnded = s.phase === 'GAME_OVER' || (s.phase === 'MATCH_OVER' && s.matchEndReason === 'natural');
  if (handJustEnded && !room.handSnapshotTaken) {
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
  room.lastActivityAt = Date.now();
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
    dealer: s.dealer,
    bids: s.bids.map((b) => ({ ...b })),
    hands: initialHands(s),
    discard: s.discard.map((c) => ({ suit: c.suit, rank: c.rank })),
    kontraPlayer: s.kontraPlayer,
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
const NEXT_HAND_DELAY_MS = 5000;

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
  return ([0, 1, 2] as Position[]).filter((s) => s !== room.abandonedSeat && !room.botSeats.has(s));
}

// Poruka "Sistem" u chatu sobe — bez io parametra (isto kao adminKickSeat),
// salje se direktno preko room.sockets/room.spectators.
export function postSystemMessage(room: RoomState, text: string): void {
  const message: ChatMessage = { name: 'Sistem', role: 'system', seat: null, text, ts: Date.now() };
  room.chatLog.push(message);
  if (room.chatLog.length > CHAT_LOG_LIMIT) {
    room.chatLog.splice(0, room.chatLog.length - CHAT_LOG_LIMIT);
  }
  room.sockets.forEach((sk) => sk?.emit('chat:message', message));
  room.spectators.forEach((sp) => sp.socket?.emit('chat:message', message));
}

// Korisnikov zahtev (2026-09-10) — kraj partije (bilo prirodan, "predlog za
// kraj", ili napustanje-pa-kraj) uvek zavrsava istim korakom: izracunaj
// plasman, azuriraj trajni rejting sve trojice (ukljucujuci eventualno
// napustenog — i on dobija/gubi bodove), i obavesti sobu.
function resolveMatchRanking(room: RoomState): void {
  const scores = room.game.getMatchScores();
  // Partija u kojoj je igrao racunar ne menja rejting — upisuje se u
  // istoriju partija, ali sa nultim promenama.
  if (room.hadBots) {
    const zero: [number, number, number] = [0, 0, 0];
    const current = [0, 1, 2].map((p) => room.seatRatings[p]!) as [number, number, number];
    const payload = { scores, unrated: true };
    room.sockets.forEach((socket) => socket?.emit('game:matchRankingResult', payload));
    room.spectators.forEach((spectator) => spectator.socket?.emit('game:matchRankingResult', payload));
    saveMatchLog({
      room_code: room.code,
      match_end_reason: room.game.state.matchEndReason ?? 'natural',
      rounds_played: room.game.state.round,
      player0_user_id: room.seatUserIds[0],
      player1_user_id: room.seatUserIds[1],
      player2_user_id: room.seatUserIds[2],
      player0_name: room.seatNames[0],
      player1_name: room.seatNames[1],
      player2_name: room.seatNames[2],
      final_bulas: [...room.game.state.bulas] as [number, number, number],
      final_scores: scores,
      rating_deltas: zero,
      new_ratings: current,
      hands_json: JSON.stringify(room.handsHistory),
    });
    return;
  }
  const ratings: [number, number, number] = [0, 0, 0];
  for (const seat of [0, 1, 2] as Position[]) {
    const uid = room.seatUserIds[seat];
    ratings[seat] = uid !== null ? getUserRating(uid) : 1000;
  }
  // (do ovde se stize samo bez racunara — partija ide u tabelu lige ako je ligaska)
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
  // matchEndReason je uvek postavljen engine-om (natural/agreed/leave) kad dodjemo dovde.
  const reason = room.game.state.matchEndReason ?? 'natural';
  // klijent pise "upisano u tabelu lige" ili zasto nije (prekid pre 10 ruku)
  const league = room.leagueId !== null
    ? { name: room.leagueName, counted: countsForLeague(reason, room.game.state.round), minHands: MIN_HANDS_FOR_EARLY_END }
    : null;
  const payload = { scores, deltas, newRatings, league };
  room.sockets.forEach((socket) => socket?.emit('game:matchRankingResult', payload));
  room.spectators.forEach((spectator) => spectator.socket?.emit('game:matchRankingResult', payload));

  // Istorija partija (korisnikov zahtev 2026-09-11) — snima JEDAN red u
  // match_log sa JSON-serijalizovanim nizovima.
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
    league_id: room.leagueId,
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
// Posle restarta servera (svaki deploy) sobe se vracaju iz baze, ali
// tajmeri (potez racunara, automatsko deljenje sledece ruke) ne zive u
// bazi — bez ovoga bi sto na kome je racunar na potezu stajao zauvek.
export function resumeRoomTimers(room: RoomState): void {
  maybeDriveAiTurn(room);
  maybeAutoAdvanceHand(room);
}

// === Obavestenja igracima (korisnikov zahtev 2026-10-14) ===
// Igrac "nije tu" = nema zive veze, ili je njegov pregledac javio da je
// stranica u pozadini (presence:visibility, ugasen ekran / druga aplikacija).
export function isAway(room: RoomState, seat: Position): boolean {
  const sk = room.sockets[seat];
  return !sk || sk.data.hidden === true;
}

// "Tvoj potez" coveku koji nije na stranici. force: igrac je upravo (pre
// ~10 s) otisao u pozadinu dok je bio na potezu — javi i za vec zapocetu
// odluku.
export function maybeNotifyTurn(room: RoomState, force = false): void {
  const actor = turnActor(room);
  if (actor === null || actor === room.abandonedSeat || room.botSeats.has(actor)) return;
  const uid = room.seatUserIds[actor];
  if (uid === null || !isAway(room, actor)) return;
  const key = turnDecisionKey(room, actor);
  if (!force && room.notifiedTurnKey === key) return;
  room.notifiedTurnKey = key;
  notifyUser(uid, 'turn', 'Tvoj potez — Preferans', `Za stolom ${room.code} se čeka tvoj potez.`);
}

// === Vreme za potez ===
// Ko je na potezu (bilo ko, i covek i racunar), null kad niko (kraj ruke).
export function turnActor(room: RoomState): Position | null {
  const actions = room.game.getLegalActions();
  return actions.length > 0 ? actions[0]!.player : null;
}

// Kljuc jedne odluke — dok se ne promeni, sat tece dalje (ponovno slanje
// stanja, npr. reconnect ili chat, ne vraca sat na pocetak).
export function turnDecisionKey(room: RoomState, actor: Position): string {
  const s = room.game.state;
  return [
    s.phase, s.round, actor, s.bids.length, s.trickCount, s.currentTrick.length,
    s.followChoices.join(','), s.kontraLevel ?? '', s.players[actor]!.hand.length,
  ].join('|');
}

function clearTurnTimer(room: RoomState): void {
  if (room.turnTimeout) clearTimeout(room.turnTimeout);
  room.turnTimeout = null;
  room.turnKey = null;
  room.turnDeadline = null;
}

function anyHumanConnected(room: RoomState): boolean {
  return room.sockets.some((s) => s !== null);
}

function maybeScheduleTurnTimer(room: RoomState): void {
  // svi ljudi ispali — sat stoji (inace bi racunar sam odigrao celu partiju
  // za odsutne); krece ponovo cim se neko vrati (reconnect salje stanje svima)
  const actor = room.turnSeconds > 0 && anyHumanConnected(room) ? turnActor(room) : null;
  // racunar i napusteno mesto igraju sami (maybeDriveAiTurn), nemaju sat
  if (actor === null || actor === room.abandonedSeat || room.botSeats.has(actor)) {
    clearTurnTimer(room);
    return;
  }
  const key = turnDecisionKey(room, actor);
  if (key === room.turnKey && room.turnTimeout) return;
  clearTurnTimer(room);
  // odbacivanje i izbor igre traze vise razmisljanja
  const slow = room.game.state.phase === 'DISCARDING' || room.game.state.phase === 'DECLARING';
  const ms = room.turnSeconds * 1000 * (slow ? 2 : 1);
  room.turnKey = key;
  room.turnTotalMs = ms;
  room.turnDeadline = Date.now() + ms;
  room.turnTimeout = setTimeout(() => {
    room.turnTimeout = null;
    // u medjuvremenu odigrao sam, ili se stanje promenilo — nista
    if (turnActor(room) !== actor || turnDecisionKey(room, actor) !== key) return;
    if (!anyHumanConnected(room)) {
      room.turnKey = null;
      room.turnDeadline = null;
      return;
    }
    playAiTurn(room.game, actor);
    postSystemMessage(room, `⏱ Isteklo vreme za potez — računar je odigrao za: ${room.seatNames[actor] ?? 'igrača'}.`);
    broadcastRoomState(room);
  }, ms);
}

// Ko je trenutno na potezu a vozi ga server AI: napusteno mesto ili
// racunar koji od pocetka sedi za stolom.
function aiDrivenActor(room: RoomState): Position | null {
  const actions = room.game.getLegalActions();
  if (actions.length === 0) return null;
  const actor = actions[0]!.player;
  return actor === room.abandonedSeat || room.botSeats.has(actor) ? actor : null;
}

function maybeDriveAiTurn(room: RoomState): void {
  if (room.aiTurnTimeout !== null || aiDrivenActor(room) === null) return;
  room.aiTurnTimeout = setTimeout(() => {
    room.aiTurnTimeout = null;
    // stanje je moglo da se promeni (covek seo umesto racunara, ruka gotova)
    const actor = aiDrivenActor(room);
    if (actor === null) return;
    playAiTurn(room.game, actor);
    broadcastRoomState(room);
  }, 600);
}
