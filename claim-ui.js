// "Nosim sve štihove do kraja" (korisnikov zahtev 2026-10-20): igrač koji
// misli da nosi sve preostale štihove skraćuje ruku, a ostali moraju da se
// slože. Online odlučuje server (claimEvents.ts) i šalje state.claim; lokalno
// računar odmah proverava da li je tvrdnja sigurna (claimIsCertain u app.js).

import { el } from './dom.js';
import { isRed, sortHand } from './card-order.js';
import { isPlayerActive } from './engine/dist/turnOrder.js';

const TRICKS_PER_HAND = 10;

/** Može li `seat` sada da kaže "nosim sve" (samo između dva štiha, ne u Betlu). */
export function canClaim(state, seat) {
  if (seat === null || state.phase !== 'PLAYING' || state.currentTrick.length > 0) return false;
  if (state.claim || state.trickCount >= TRICKS_PER_HAND) return false;
  if (state.declaredGame === 'Betl' || state.declaredGame === 'Igra-Betl') return false;
  return isPlayerActive(state, seat);
}

function cardsRow(cards) {
  const row = el('div', 'claim-cards');
  for (const c of sortHand(cards)) {
    const span = el('span', `mini-card${isRed(c.suit) ? ' red' : ''}`);
    span.textContent = `${c.rank}${c.suit}`;
    row.appendChild(span);
  }
  return row;
}

function button(id, cls, text, onClick) {
  const b = el('button', cls);
  b.id = id;
  b.textContent = text;
  b.onclick = onClick;
  return b;
}

/**
 * Crta dugme ili pitanje u `container`.
 * seat: moje mesto (null za kibicera); nameOf(seat) daje ime igrača.
 */
export function renderClaim(container, { state, seat, nameOf, onClaim, onVote }) {
  container.innerHTML = '';
  const claim = state.claim;
  if (!claim) {
    if (canClaim(state, seat)) {
      container.appendChild(button('claimBtn', 'bid-btn claim-btn', '🏁 Nosim sve štihove', onClaim));
    }
    return;
  }
  const box = el('div', 'claim-box');
  const text = el('div', 'claim-text');
  box.appendChild(text);
  if (claim.by === seat) {
    text.textContent = 'Rekao si da nosiš sve — čeka se da se ostali slože…';
  } else {
    text.textContent = `${nameOf(claim.by)} kaže da nosi sve preostale štihove:`;
    if (claim.hand) box.appendChild(cardsRow(claim.hand));
    const canVote = seat !== null && isPlayerActive(state, seat) && !claim.accepted.includes(seat);
    if (canVote) {
      const actions = el('div', 'claim-actions');
      actions.appendChild(button('claimAcceptBtn', 'bid-btn primary', 'Slažem se', () => onVote(true)));
      actions.appendChild(button('claimDeclineBtn', 'bid-btn danger', 'Ne slažem se', () => onVote(false)));
      box.appendChild(actions);
    } else if (seat !== null && claim.accepted.includes(seat)) {
      box.appendChild(el('div', 'claim-status', 'Složio si se — čeka se ostali.'));
    }
  }
  container.appendChild(box);
}
