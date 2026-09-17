// PREFERANS — ko je na potezu / ko ucestvuje u ruci. Cisti (state: GameState)
// -> vrednost helperi, izdvojeni iz Game klase jer se citaju kroz vise faza
// bez ikakvog cross-phase-transition poziva (vidi plan "Split oversized
// files"): pravi kandidat za nisko-rizicnu podelu, za razliku od
// bidding/follow/kontra/hand-lifecycle klastera koji ostaju u game.ts.

import type { GameState, Position } from './types.js';

export function nextPlayer(p: Position): Position {
  return ((p + 1) % 3) as Position;
}

// Da li igrac ucestvuje u ovoj ruci
// Aktivan: winner + DODJEM + pozvani NE_DODJEM (callee)
export function isPlayerActive(state: GameState, player: Position): boolean {
  if (state.winner === player) return true;
  if (state.followChoices[player] === 'DODJEM') return true;
  if (state.followChoices[player] === 'NE_DODJEM' && state.callee === player) return true;
  return false;
}

// Sledeci aktivni igrac (preskace NE_DODJEM koji sedi)
export function nextActivePlayer(state: GameState, from: Position): Position {
  let next = nextPlayer(from);
  let safety = 0;
  while (safety < 3) {
    if (isPlayerActive(state, next)) return next;
    next = nextPlayer(next);
    safety++;
  }
  return next;
}

// Broj aktivnih igraca (ne NE_DODJEM koji nije zvan)
export function activePlayerCount(state: GameState): number {
  let count = 0;
  for (let i = 0; i < 3; i++) {
    if (isPlayerActive(state, i as Position)) count++;
  }
  return count;
}

export function getFirstPlayerForState(state: GameState): Position {
  const game = state.declaredGame!;
  // Sans specifican (RULES 8.1.3): igra pratilac koji je NEPOSREDNO PRE
  // nosioca u redosledu bacanja karata (Jug->Istok->Zapad->Jug, potvrdjeno
  // uzivo od korisnika) — "igra se kroz nosioca", nosilac je izmedju druga
  // dva poteza te runde. "Pre nosioca" u ovom smeru = (winner + 2) % 3
  // (inverz od nextPlayer()). ISPRAVKA 2026-09-05: ranije ove sesije ovo je
  // pogresno promenjeno na (winner+1)%3 oslanjajuci se na naziv "levo" iz
  // OVOG ENGINE-A koriscen za RULES 5.1 (kontra redosled) — ta konvencija
  // NIJE ista stvar kao "levo od nosioca" u svakodnevnom/RULES.md smislu za
  // 8.1.3. Uzivo prijavljen bag (Zapad nosilac, pogresan igrac na potezu)
  // je potvrdio da je ORIGINALNA (winner+2)%3 formula bila tacna.
  if (game === 'Sans' || game === 'Igra-Sans') {
    const beforeWinner = ((state.winner! + 2) % 3) as Position;
    if (isPlayerActive(state, beforeWinner)) return beforeWinner;
    // beforeWinner ne ucestvuje u ovoj ruci (npr. samo jedan pratilac je
    // dosao i to nije on) — nosilac NIKAD ne sme da vodi u Sansu (RULES
    // 8.1.3, "nosilac je U SREDINI"), pa nextActivePlayer() ovde ne sme da
    // se koristi (moze vratiti samog nosioca, koji je uvek "aktivan").
    // Postoje samo dve ne-nosilac pozicije — jedini preostali kandidat je
    // afterWinner, i on MORA biti aktivan (odigrana ruka znaci bar jedan
    // pratilac ucestvuje).
    return ((state.winner! + 1) % 3) as Position;
  }
  // Betl i ostale: prvo licitirao
  let candidate: Position;
  if (state.players[state.bidStartPlayer]!.bidLevel > 0) {
    candidate = state.bidStartPlayer;
  } else {
    candidate = nextPlayer(state.bidStartPlayer);
  }
  // Preskoci NE_DODJEM koji nije zvan
  if (isPlayerActive(state, candidate)) return candidate;
  return nextActivePlayer(state, candidate);
}
