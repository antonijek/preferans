import type { Server, Socket } from 'socket.io';
import {
  createRoom,
  getRoomByCode,
  getUserLocation,
  setUserLocation,
  clearUserLocation,
  listOpenRooms,
  removeRoom,
} from '../rooms/RoomManager.js';
import type { RoomState, ChatMessage } from '../rooms/RoomState.js';
import { CHAT_LOG_LIMIT } from '../rooms/RoomState.js';
import type { Position } from '../../../engine/dist/types.js';
import { redactStateFor } from '../redact.js';
import type { Viewer } from '../redact.js';
import { applyAction, withAuthenticatedActor } from './gameEvents.js';
import type { GameAction } from './gameEvents.js';
import { listOnlineUsers, getSocketIdsForUser } from '../presence.js';
import { computeAiAction } from '../ai/aiSeat.js';

type Ack = (response: Record<string, unknown>) => void;

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function sendChatBacklog(socket: Socket, room: RoomState): void {
  socket.emit('chat:backlog', room.chatLog);
}

// A couple of small values (whose turn it is to kontra, which of MY OWN
// cards are currently legal to play) require private engine logic
// (`followersInKontraOrder`, trick-following rules) that isn't worth
// duplicating client-side — the server already has the authoritative `Game`
// instance right here, so it just computes them once and rides along with
// the redacted state. Neither leaks anything: expectedKontraPlayer is public
// (same visibility as currentBidder/currentPlayer), and legalCards is
// derived purely from cards the viewer can already see (their own hand).
function buildClientState(room: RoomState, viewer: Viewer) {
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
  })) as typeof redacted.players;
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
  };
}

function broadcastRoomState(room: RoomState): void {
  // PRIVREMENO dijagnosticko logovanje (uzivo prijavljeno: "sva trojica udju
  // u sobu, karte se podele samo jednom, ostali ostaju u predsoblju") —
  // ukloniti posle potvrde uzroka. connected=false bi znacio da server MISLI
  // da je sediste popunjeno ali socket vise nije zivo (npr. tih disconnect
  // koji nije ocistio seat) — upravo ono sto bi objasnilo "stuck" klijente.
  console.log(
    `[JOIN DEBUG] broadcastRoomState room=${room.code} phase=${room.game.state.phase} ` +
    `seats=${room.sockets.map((s, i) => `${i}:${room.seatUserIds[i] ?? '-'}:${s ? (s.connected ? 'live' : 'dead') : 'empty'}`).join(',')}`
  );
  // PRIVREMENO dijagnosticko logovanje (uzivo prijavljeno VISE puta: tabela
  // "Pratnja" kolona prazna na rukama gde je stvarno bilo pratilaca) —
  // ukloniti posle potvrde uzroka. Belezi TACNO stanje koje SERVER salje
  // klijentu na svaki GAME_OVER broadcast — ako OVDE followChoices/caller/
  // tricksWon vec izgledaju pogresno, bag je server-side (ili u samom
  // engine-u); ako izgledaju ISPRAVNO ovde a klijent i dalje prikazuje
  // prazno, bag je sigurno u app.js-u (recordHandIfNew/computeFollowSeats).
  if (room.game.state.phase === 'GAME_OVER') {
    const s = room.game.state;
    console.log(
      `[TABELA DEBUG] room=${room.code} round=${s.round} winner=${s.winner} ` +
      `declaredGame=${s.declaredGame} followChoices=${JSON.stringify(s.followChoices)} ` +
      `caller=${s.caller} callee=${s.callee} tricksLen=${s.tricks.length} ` +
      `tricksWon=${JSON.stringify(s.players.map(p => p.tricksWon))} ` +
      `lastHandResult.passed=${s.lastHandResult?.passed}`
    );
  }
  room.sockets.forEach((socket, seat) => {
    socket?.emit('game:state', buildClientState(room, { type: 'player', seat: seat as Position }));
  });
  room.spectators.forEach((spectator) => {
    spectator.socket?.emit(
      'game:state',
      buildClientState(room, { type: 'spectator', kibicSeats: spectator.kibicSeats })
    );
  });
  maybeDriveAiTurn(room);
  maybeAutoAdvanceHand(room);
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
function dealNextHand(room: RoomState): void {
  room.dealNextReady = new Set();
  room.game.state.round++;
  room.game.newHand(((room.game.state.dealer + 1) % 3) as Position);
  broadcastRoomState(room);
}

// Sedista koja MORAJU kliknuti "Deli" pre nego sto se prevremeno (pre
// isteka auto-tajmera) predje na sledecu rundu — napusteno sediste (AI
// preuzeo) ne moze kliknuti nista, pa se ne racuna.
function activeSeatsForRoom(room: RoomState): Position[] {
  return ([0, 1, 2] as Position[]).filter((s) => s !== room.abandonedSeat);
}

function maybeAutoAdvanceHand(room: RoomState): void {
  if (room.game.state.phase !== 'GAME_OVER' || room.nextHandScheduled) return;
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

/** Seats `userId` into `room`, reusing their existing seat if they already have one (rejoin). */
function joinAsPlayer(room: RoomState, userId: number, socket: Socket, name: string): Position | null {
  const existingSeat = room.seatUserIds.findIndex((u) => u === userId);
  let seat: Position;
  if (existingSeat !== -1) {
    seat = existingSeat as Position;
  } else {
    const openSeat = room.seatUserIds.findIndex((u) => u === null);
    if (openSeat === -1) return null;
    seat = openSeat as Position;
    room.seatUserIds[seat] = userId;
  }
  room.seatNames[seat] = name;
  room.sockets[seat] = socket;
  socket.join(room.code);
  setUserLocation(userId, { code: room.code, role: 'player', seat });

  // Uzivo prijavljen bag: igrac koji se vrati posle "napusti partiju" je
  // dobijao ispravno ime nazad (gore), ali room.abandonedSeat NIGDE nije
  // bio ciscen — maybeDriveAiTurn() gleda SAMO tu zastavicu (ne da li je
  // neko stvarno seo nazad), pa je AI zauvek nastavljao da igra za njega,
  // ukljucujuci i licitaciju (klijent nikad nije dobijao dugmad jer je
  // server vec sam odgovarao za to sediste). Ciscenje SAMO kad se VRATI
  // BAS taj napusteni igrac (ne bilo koji rejoin) — abandonedSeat i dalje
  // vazi normalno dok god je taj konkretan covek odsutan.
  if (room.abandonedSeat === seat) {
    room.abandonedSeat = null;
    room.frozenBula = null;
  }

  const filled = room.seatUserIds.every((u) => u !== null);
  if (filled && room.game.state.phase === 'WAITING') {
    room.game.newHand();
  }
  return seat;
}

export function registerRoomHandlers(io: Server, socket: Socket): void {
  const userId: number = socket.data.userId;
  const name: string = socket.data.name;

  function currentRoom(): RoomState | undefined {
    const loc = getUserLocation(userId);
    return loc ? getRoomByCode(loc.code) : undefined;
  }

  // M6 reconnect: if this user already has an active room (seat reserved
  // indefinitely — nothing frees it in this MVP, see TODO.md), rejoin them
  // automatically and push their current state without waiting for the
  // client to ask. Kibic grants live on the spectator's RoomState entry,
  // keyed by userId, so they survive this reattachment untouched.
  // Uzivo prijavljen bag (mobilni korisnik, "svako malo ispadanje iz sobe"):
  // klijent je ranije MORAO da NAGADJA (kratak tajmer) da li ce server
  // poslati room:info/game:state, jer nista drugo nije stizalo kad korisnik
  // NEMA aktivnu sobu — na losoj mobilnoj vezi, sam handshake+ovaj kod moze
  // trajati duze od bilo kog razumnog tajmera, pa bi klijent prerano
  // odlucio "nema sobe" i vratio na pocetni ekran USRED partije. Sad server
  // UVEK eksplicitno odgovara — 'room:none' kad STVARNO nema sta da se
  // nastavi, inace room:info/game:state kao i do sad — pa klijent nikad ne
  // mora da pogadja na osnovu odsustva poruke.
  const existingLocation = getUserLocation(userId);
  let resumed = false;
  if (existingLocation) {
    const room = getRoomByCode(existingLocation.code);
    if (room) {
      if (existingLocation.role === 'player') {
        const seat = joinAsPlayer(room, userId, socket, name);
        if (seat !== null) {
          socket.emit('room:info', { code: room.code, seat, locked: room.locked });
          socket.emit('game:state', buildClientState(room, { type: 'player', seat }));
          sendChatBacklog(socket, room);
          resumed = true;
          // Korisnikov zahtev: ostali nisu imali NIKAKAV signal da je neko
          // ispao pa se vratio — samo bi im se soba/dugmad "sama" ispravila
          // na sledecem game:state, bez objasnjenja sta se desilo.
          if (room.game.state.phase !== 'WAITING') {
            io.to(room.code).emit('room:playerReconnected', { seat, name });
          }
        }
      } else {
        const spectator = room.spectators.get(userId);
        if (spectator) {
          spectator.socket = socket;
          socket.join(room.code);
          socket.emit('room:info', { code: room.code, seat: null, locked: room.locked });
          socket.emit(
            'game:state',
            buildClientState(room, { type: 'spectator', kibicSeats: spectator.kibicSeats })
          );
          sendChatBacklog(socket, room);
          resumed = true;
        }
      }
    }
  }
  if (!resumed) socket.emit('room:none');

  socket.on('room:list', (_payload: unknown, ack?: Ack) => {
    ack?.({ rooms: listOpenRooms() });
  });

  // Korisnikov zahtev: "ustani od stola" (peekHomeScreen, klijent) treba da
  // se vidi ostalima ISTO kao pravi disconnect — sediste se prazni dok se
  // korisnik sam ne vrati. Ovo NE menja server-side stanje (soket ostaje
  // ziv, sediste ostaje njihovo) — samo relejuje isti vizuelni signal koji
  // pravi disconnect/reconnect vec koriste.
  socket.on('room:setAway', (_payload: unknown) => {
    const room = currentRoom();
    const loc = getUserLocation(userId);
    if (!room || loc?.role !== 'player') return;
    io.to(room.code).emit('room:playerDisconnected', { seat: loc.seat, name });
  });
  socket.on('room:setBack', (_payload: unknown) => {
    const room = currentRoom();
    const loc = getUserLocation(userId);
    if (!room || loc?.role !== 'player') return;
    io.to(room.code).emit('room:playerReconnected', { seat: loc.seat, name });
  });

  socket.on('presence:list', (_payload: unknown, ack?: Ack) => {
    // Korisnikov zahtev: "dugme Pozovi pored svog imena je preglupo" — "ko
    // je online" znaci ko je DRUGI online, sopstveni unos se filtrira ovde
    // (jedno mesto, pokriva i buducu upotrebu ove liste, ne samo sobu).
    ack?.({ users: listOnlineUsers().filter((u) => u.userId !== userId) });
  });

  // "Pozovi igraca" — korisnikov zahtev: umesto da se kod sobe deli rucno
  // (chat/spolja), direktno pozovi nekog ko je trenutno online. Cilja se
  // SAMO userId (klijent ne salje kod sobe) — server vec zna posiljaocevu
  // sobu preko currentRoom(), isti obrazac kao svaki drugi handler ovde.
  socket.on('room:invite', (payload: { userId?: unknown }, ack?: Ack) => {
    const room = currentRoom();
    if (!room) { ack?.({ error: 'Prvo napravi ili se pridruži sobi' }); return; }
    const targetUserId = Number(payload?.userId);
    if (!Number.isInteger(targetUserId)) { ack?.({ error: 'Nevažeći poziv' }); return; }
    const targetSocketIds = getSocketIdsForUser(targetUserId);
    // PRIVREMENO dijagnosticko logovanje (uzivo prijavljeno: "kad se uputi
    // poziv, igracu nikako ne stize") — ukloniti posle potvrde uzroka.
    console.log(
      `[INVITE DEBUG] from=${userId}(${name}) target=${targetUserId} ` +
      `foundSockets=${targetSocketIds.length} room=${room.code}`
    );
    if (targetSocketIds.length === 0) { ack?.({ error: 'Igrač više nije online' }); return; }
    for (const sid of targetSocketIds) {
      io.to(sid).emit('room:invited', { code: room.code, fromName: name });
    }
    ack?.({ ok: true });
  });

  socket.on('room:create', (payload: { initialBule?: number; refePerPlayer?: number }, ack?: Ack) => {
    // Client-supplied config is just a preference — always clamp server-side
    // rather than trust it, same principle as withAuthenticatedActor() for
    // game actions.
    const initialBule = clamp(Number(payload?.initialBule), 50, 300, 100);
    // Max refe zavisi od bule (RULES 7.2: "2 refea za 100 bula" je
    // podrazumevana razmera) — korisnikov zahtev, ne sme se partija od 50
    // bula podesiti na 5 refea preko klijenta cak i ako HTML input to
    // dozvoli/ne stigne da klampuje na vreme.
    const refeMax = Math.max(1, Math.min(5, Math.round(initialBule / 50)));
    const refePerPlayer = clamp(Number(payload?.refePerPlayer), 0, refeMax, Math.min(2, refeMax));
    const room = createRoom({ initialBule, refePerPlayer });
    const seat = joinAsPlayer(room, userId, socket, name)!;
    ack?.({ code: room.code, seat });
    broadcastRoomState(room);
    sendChatBacklog(socket, room);
  });

  socket.on('room:join', (payload: { code?: string }, ack?: Ack) => {
    const room = getRoomByCode(payload?.code ?? '');
    if (!room) {
      ack?.({ error: 'Room not found' });
      return;
    }
    const seat = joinAsPlayer(room, userId, socket, name);
    if (seat === null) {
      ack?.({ error: 'Room is full' });
      return;
    }
    ack?.({ code: room.code, seat });
    broadcastRoomState(room);
    sendChatBacklog(socket, room);
  });

  socket.on('room:join-as-spectator', (payload: { code?: string }, ack?: Ack) => {
    const room = getRoomByCode(payload?.code ?? '');
    if (!room) {
      ack?.({ error: 'Room not found' });
      return;
    }
    const existing = room.spectators.get(userId);
    if (room.locked && !existing) {
      ack?.({ error: 'Room is locked' });
      return;
    }
    const kibicSeats = existing?.kibicSeats ?? new Set<Position>();
    room.spectators.set(userId, { userId, name, socket, kibicSeats });
    socket.join(room.code);
    setUserLocation(userId, { code: room.code, role: 'spectator' });
    ack?.({ code: room.code });
    socket.emit('game:state', buildClientState(room, { type: 'spectator', kibicSeats }));
    sendChatBacklog(socket, room);
  });

  socket.on('room:toggle-lock', (_payload: unknown, ack?: Ack) => {
    const room = currentRoom();
    const loc = getUserLocation(userId);
    if (!room || loc?.role !== 'player') {
      ack?.({ error: 'Only seated players can toggle the room lock' });
      return;
    }
    room.locked = !room.locked;
    ack?.({ locked: room.locked });
    io.to(room.code).emit('room:lock-changed', { locked: room.locked });
  });

  socket.on('kibic:request', (payload: { targetSeat?: Position }) => {
    const room = currentRoom();
    const loc = getUserLocation(userId);
    if (!room || loc?.role !== 'spectator' || payload?.targetSeat === undefined) return;
    room.sockets[payload.targetSeat]?.emit('kibic:incoming-request', {
      spectatorUserId: userId,
      name,
    });
  });

  socket.on('kibic:respond', (payload: { spectatorUserId?: number; approve?: boolean }) => {
    const room = currentRoom();
    const loc = getUserLocation(userId);
    if (!room || loc?.role !== 'player' || payload?.spectatorUserId === undefined) return;
    const spectator = room.spectators.get(payload.spectatorUserId);
    if (!spectator || !payload.approve) return;
    spectator.kibicSeats.add(loc.seat);
    spectator.socket?.emit(
      'game:state',
      buildClientState(room, { type: 'spectator', kibicSeats: spectator.kibicSeats })
    );
  });

  socket.on('game:action', (action: GameAction) => {
    const room = currentRoom();
    const loc = getUserLocation(userId);
    if (!room || loc?.role !== 'player') {
      socket.emit('game:error', 'You are not seated in a room');
      return;
    }
    const safeAction = withAuthenticatedActor(action, loc.seat);
    const accepted = applyAction(room.game, safeAction);
    if (safeAction.type === 'bid' || safeAction.type === 'pass') {
      // PRIVREMENO dijagnosticko logovanje (uzivo prijavljen bag: "dalje, 2,
      // dalje" je zavrsilo u refe umesto da igrac koji je rekao 2 pobedi) —
      // ukloniti posle potvrde uzroka.
      const s = room.game.state;
      console.log(
        `[BID DEBUG] room=${room.code} action=${JSON.stringify(safeAction)} accepted=${accepted} ` +
        `phase=${s.phase} winner=${s.winner} currentBid=${s.currentBid} currentBidder=${s.currentBidder} ` +
        `passed=${s.players.map(p => p.hasPassedBid)} bidLevels=${s.players.map(p => p.bidLevel)}`
      );
    }
    if (accepted) {
      broadcastRoomState(room);
    } else {
      socket.emit('game:action-rejected', action);
    }
  });

  // "Pogledaj karte" — korisnikov zahtev: neko posle rune zeli da vidi sve
  // tri ruke. RANIJE je ovo TRAJNO otkazivalo automatski nastavak
  // (autoAdvancePaused) — ako gledalac posle toga nikad ne klikne "Deli"
  // rucno, runda bi ostala zaglavljena zauvek cak i kad su OSTALA dvojica
  // vec kliknula. Korisnikov zahtev: gledanje karata ne sme da blokira ni
  // 9-sekundni tajmer ni "svi kliknuli Deli" — samo prikazuje karte
  // PRIVATNO, ne dira tajmer/dealNextReady uopste.
  socket.on('game:viewCards', (_payload: unknown, ack?: Ack) => {
    const room = currentRoom();
    if (!room || room.game.state.phase !== 'GAME_OVER') {
      ack?.({ error: 'Nema zavrsene ruke za pregled' });
      return;
    }
    // Obavesti OSTALE (ne posiljaoca) da neko gleda karte — korisnikov
    // zahtev: "ostalima neka pise igrac X gleda karte, sacekajte".
    const viewerLoc = getUserLocation(userId);
    if (viewerLoc?.role === 'player') {
      socket.to(room.code).emit('game:viewingCards', { seat: viewerLoc.seat, name });
    }
    // Rekonstruisi punu ruku svakog igraca za rundu koja je upravo zavrsena:
    // karte koje je taj igrac odigrao (iz tricks) + sta mu je eventualno
    // ostalo neodigrano (rano-prekinuta ruka, "nosilac sigurno pao").
    const hands = ([0, 1, 2] as Position[]).map((seat) => {
      const played = room.game.state.tricks.flatMap((trick) =>
        trick.filter((tc) => tc.player === seat).map((tc) => tc.card)
      );
      return { seat, name: room.seatNames[seat], cards: [...played, ...room.game.state.players[seat]!.hand] };
    });
    // Korisnikov zahtev: "kad jedan igrac klikne Pogledaj karte treba samo
    // njemu da se pokazu, ne svima" — ranije se io.to(room.code) slalo SVIMA
    // u sobi cim BILO KO klikne. Auto-advance pauza iznad ostaje deljena
    // (razumno — dok neko cita, runda ne treba automatski da produzi), sama otkrivena
    // ruka je sad privatna, samo posiljaocu.
    // Korisnikov zahtev: talon nije bio prikazan na ovom ekranu.
    socket.emit('game:handsRevealed', { hands, talon: room.game.state.talon });
    ack?.({ ok: true });
  });

  // Rucni nastavak — korisnikov zahtev: JEDAN igrac ranije je ovim klikom
  // odmah delio sledecu rundu ZA SVE, sto je bilo neprijatno iznenadjenje za
  // ostale ("deli ako samo jedan klikne, to nije dobro"). Sad samo OZNACAVA
  // to sediste kao spremno — stvarno deljenje ceka da SVI aktivni (ne
  // napusteni) igraci kliknu, ili da istekne auto-tajmer (postojeci
  // fallback, NEXT_HAND_DELAY_MS) kao i do sad.
  socket.on('game:dealNext', (_payload: unknown, ack?: Ack) => {
    const room = currentRoom();
    if (!room || room.game.state.phase !== 'GAME_OVER') {
      ack?.({ error: 'Nema zavrsene ruke za nastavak' });
      return;
    }
    const loc = getUserLocation(userId);
    if (!loc || loc.role !== 'player' || loc.seat === null) {
      ack?.({ error: 'Samo igraci mogu potvrditi sledecu rundu' });
      return;
    }
    room.dealNextReady.add(loc.seat);
    const active = activeSeatsForRoom(room);
    if (active.every((s) => room.dealNextReady.has(s))) {
      if (room.nextHandTimeout) {
        clearTimeout(room.nextHandTimeout);
        room.nextHandTimeout = null;
      }
      room.nextHandScheduled = false;
      dealNextHand(room);
    } else {
      io.to(room.code).emit('game:dealNextStatus', { ready: Array.from(room.dealNextReady) });
    }
    ack?.({ ok: true });
  });

  socket.on('chat:send', (payload: { text?: string }) => {
    const room = currentRoom();
    const loc = getUserLocation(userId);
    if (!room || !loc || typeof payload?.text !== 'string' || !payload.text.trim()) return;

    const message: ChatMessage = {
      name,
      role: loc.role,
      seat: loc.role === 'player' ? loc.seat : null,
      text: payload.text.trim().slice(0, 500),
      ts: Date.now(),
    };

    room.chatLog.push(message);
    if (room.chatLog.length > CHAT_LOG_LIMIT) {
      room.chatLog.splice(0, room.chatLog.length - CHAT_LOG_LIMIT);
    }

    io.to(room.code).emit('chat:message', message);
  });

  // Explicit, permanent leave — distinct from `disconnect` below, which
  // keeps the seat reserved indefinitely for reconnect. Leaving freezes the
  // player's current bula, hands their seat to the server AI (aiSeat.ts) —
  // `abandonedSeat` carries over hand-to-hand via the auto-continue
  // mechanism (maybeAutoAdvanceHand) added 2026-09-05, so the AI keeps
  // covering that seat across the REST of the match now, not just the one
  // hand in progress when they left (see [[project-preferans-ranking-system-design]]
  // for the still-outstanding match-end capping rule for this case) — and
  // frees the user to join/create a different room.
  socket.on('game:leave', (_payload: unknown, ack?: Ack) => {
    const room = currentRoom();
    const loc = getUserLocation(userId);
    if (!room || loc?.role !== 'player') {
      ack?.({ error: 'Not seated in an active room' });
      return;
    }
    if (room.game.state.phase === 'WAITING') {
      ack?.({ error: 'Game has not started' });
      return;
    }
    const seat = loc.seat;
    const frozenBula = room.game.state.bulas[seat];
    room.frozenBula = frozenBula;
    room.abandonedSeat = seat;
    room.seatNames[seat] = `${room.seatNames[seat] ?? name} (napustio)`;
    room.sockets[seat] = null;
    socket.leave(room.code);
    clearUserLocation(userId);
    ack?.({ frozenBula });

    const message: ChatMessage = {
      name: 'Sistem',
      role: 'spectator',
      seat: null,
      text: `${name} je napustio partiju na buli ${frozenBula}. AI preuzima do kraja ove ruke.`,
      ts: Date.now(),
    };
    room.chatLog.push(message);
    if (room.chatLog.length > CHAT_LOG_LIMIT) {
      room.chatLog.splice(0, room.chatLog.length - CHAT_LOG_LIMIT);
    }
    io.to(room.code).emit('chat:message', message);

    broadcastRoomState(room);
  });

  socket.on('disconnect', () => {
    const loc = getUserLocation(userId);
    if (!loc) return;
    const room = getRoomByCode(loc.code);
    if (!room) return;
    if (loc.role === 'player') {
      if (room.sockets[loc.seat] === socket) {
        room.sockets[loc.seat] = null;
        // Korisnikov zahtev: "nema notifikacije kad neko ispadne sa mreze
        // ili greskom zatvori browser" — dosad je SAMO eksplicitno "napusti
        // partiju" obavestavalo ikoga. Seat ostaje rezervisan (M6 reconnect
        // ceka ih neogranicano, namerno — ne postaje abandonedSeat/AI ovde),
        // ali ostali makar znaju STA se desilo umesto da samo vide da neko
        // "cuti".
        if (room.game.state.phase !== 'WAITING') {
          io.to(room.code).emit('room:playerDisconnected', { seat: loc.seat, name });
        }
      }
    } else {
      const spectator = room.spectators.get(userId);
      if (spectator?.socket === socket) spectator.socket = null;
    }

    // Uzivo prijavljen bag: soba u cekanju (igra jos nije ni pocela) je
    // ostajala zauvek "otvorena" u lobiju cak i kad je svako ko ju je
    // napravio davno diskonektovan i nikad se nece vratiti — nema sta da
    // se izgubi (nikakva partija jos nije ni pocela), pa je bezbedno
    // obrisati je cim NIKO vise nije prikacen. Ne dira sobe SA vec
    // pocetom igrom — tamo je diskonekcija normalna (M6 reconnect ceka ih).
    if (room.game.state.phase === 'WAITING') {
      const anyoneConnected =
        room.sockets.some((s) => s !== null) ||
        Array.from(room.spectators.values()).some((s) => s.socket !== null);
      if (!anyoneConnected) removeRoom(room.code);
    }
  });
}
