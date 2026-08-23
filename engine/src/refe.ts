// REFA logika po RULES.md sekcija 7

import { DEFAULT_REFE_PER_PLAYER } from './constants.js';
import type { Game, Position } from './types.js';

export interface RefeContext {
  refeCount: [number, number, number];
  bulas: [number, number, number];
  game: Game | null;
}

// 7.2 — Kad se refe NE piše
export function canWriteRefe(ctx: RefeContext): boolean {
  // Bar jedan igrač u šeširu (negativne bule)
  const anyInHat = ctx.bulas.some(b => b < 0);
  if (anyInHat) return false;
  // Igrač iskoristio maksimalan broj refea
  const maxRefe = DEFAULT_REFE_PER_PLAYER;
  const allExhausted = ctx.refeCount.every(r => r >= maxRefe);
  if (allExhausted) return false;
  return true;
}

// 7.1 — Kad se refe upisuje (dobija se množilac)
export interface RefeResult {
  active: boolean;
  multiplier: 1 | 2;
}

export function shouldApplyRefe(
  ctx: RefeContext,
  reason: 'ALL_PASSED' | 'PIK_NO_KONTRA',
): RefeResult {
  if (!canWriteRefe(ctx)) return { active: false, multiplier: 1 };
  // Za "Pik bez kontre", ako nosilac nema refe-a, ništa
  if (reason === 'PIK_NO_KONTRA') {
    const declarer = ctx.game ? guessDeclarerFromContext(ctx) : null;
    if (declarer === null) return { active: false, multiplier: 1 };
    if (ctx.refeCount[declarer] >= DEFAULT_REFE_PER_PLAYER) {
      return { active: false, multiplier: 1 };
    }
  }
  return { active: true, multiplier: 2 };
}

// Placeholder: u game.ts ćemo pravilno odrediti
function guessDeclarerFromContext(_ctx: RefeContext): Position | null {
  return null;
}

// 7.3 — Posle partije pod refeom, nosilac otpisuje refe
export function consumeRefe(refeCount: [number, number, number], declarer: Position): [number, number, number] {
  const next = [...refeCount] as [number, number, number];
  next[declarer] = next[declarer] + 1;
  return next;
}
