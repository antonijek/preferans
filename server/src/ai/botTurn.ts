// Potez racunara za stolom (botSeats, napusteno mesto, isteklo vreme).
// Analiza korisnikove partije #9 (2026-10-20): racunari na serveru su
// igrali SAMO pravilima (computeAiAction), dok lokalna igra u pregledacu
// koristi pretragu (Monte Carlo) — kad se korisnik i pravila razlikuju u
// igranju karata, pretraga se 45 od 50 puta slagala sa korisnikom. Sad i
// server koristi pretragu kad ima stvarnog izbora; skart ostaje na
// pravilima (pretraga ga ne nabraja), a greska u pretrazi pada nazad na
// pravila umesto da zaustavi sto.

import type { Game } from '../../../engine/dist/game.js';
import type { Position } from '../../../engine/dist/types.js';
import { searchChooseAction, applyLegalAction } from '../../../engine/dist/aiSearch.js';
import { computeAiAction } from './aiSeat.js';
import { applyAction } from '../socket/gameEvents.js';

export const BOT_SEARCH_SAMPLES = Number(process.env.BOT_SEARCH_SAMPLES ?? 150);

export function playAiTurn(game: Game, seat: Position): boolean {
  const s = game.state;
  const options = game.getLegalActions().filter((a) => a.player === seat && a.type !== 'discard-info');
  if (BOT_SEARCH_SAMPLES > 0 && s.phase !== 'DISCARDING' && options.length > 1) {
    try {
      if (applyLegalAction(game, searchChooseAction(s, seat, BOT_SEARCH_SAMPLES))) return true;
      console.error(`[bot] pretraga je izabrala potez koji engine ne prihvata (faza ${s.phase}) — igram po pravilima`);
    } catch (e) {
      console.error('[bot] pretraga pala, igram po pravilima:', e);
    }
  }
  const action = computeAiAction(game, seat);
  return action ? applyAction(game, action) : false;
}
