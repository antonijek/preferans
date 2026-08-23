// PREFERANS UI — koristi engine iz ./engine/dist/game.js

import { Game } from './engine/dist/game.js';
import { GAME_VALUES, STANDARD_GAMES, IGRA_GAMES } from './engine/dist/constants.js';

const POS_LABELS = ['Jug', 'Istok', 'Zapad'];
const SUIT_NAMES = { '♠': 'Pik', '♥': 'Herc', '♦': 'Karo', '♣': 'Tref' };
const SUIT_GLYPH = { '♠': '♠', '♥': '♥', '♦': '♦', '♣': '♣' };
const RANK_ORDER = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const game = new Game({ seed: Date.now() & 0xffff });
let mode = '1v2';

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const fmt = c => `${c.rank}${c.suit}`;
const rankValue = r => RANK_ORDER.indexOf(r);
const isRed = s => s === '♥' || s === '♦';
const cardEl = (c, opts = {}) => {
  const klass = ['card', isRed(c.suit) ? 'red' : 'black'];
  if (opts.size === 'tiny') klass.push('tiny');
  else if (opts.size === 'small') klass.push('small');
  if (opts.playable) klass.push('playable');
  if (opts.disabled) klass.push('disabled');
  if (opts.selected) klass.push('selected');
  const node = el('div', klass.join(' '));
  node.innerHTML = `<div class="rank">${c.rank}</div><div class="suit">${c.suit}</div>`;
  return node;
};

// === SEDENJA (fiksne pozicije u DOM-u) ===
// P0 = Jug  → jug dole (south)
// P1 = Istok → istok desno (east)
// P2 = Zapad → zapad gore (west)
// Za layout: SEAT_INDEX = pozicija u DOM-u; POSITION = position u igri
const SEAT_OF = {
  0: 'south', // Jug dole
  1: 'east',  // Istok desno
  2: 'west',  // Zapad gore
};
const SEAT_PLAYER_NAME = ['Vi (Jug)', 'Istok', 'Zapad'];
const SEAT_PLAYER_CLASS = ['p0', 'p1', 'p2'];

// === RENDER: STO & SEDENJA ===

function renderSeats() {
  // Postavi statička imena jednom
  $('name-south').textContent = SEAT_PLAYER_NAME[0];
  $('name-east').textContent = SEAT_PLAYER_NAME[1];
  $('name-west').textContent = SEAT_PLAYER_NAME[2];

  // Update bule / tricks / cards
  for (let pos = 0; pos < 3; pos++) {
    const seat = SEAT_OF[pos];
    const p = game.state.players[pos];
    $(`bule-${seat}`).textContent = p.bulas?.[0] ?? p.bula ?? 100; // fallback ako nema bula
    // Bule će doći iz game.state.bulas; popravi dole
  }
}

function renderState() {
  const s = game.state;
  // Aktivan igrač highlight — currentBidder tokom BIDDING, winner tokom DISCARD/DECLARE, currentPlayer tokom igranja
  let activePos = s.currentPlayer;
  if (s.phase === 'BIDDING') activePos = s.currentBidder;
  else if (s.phase === 'DISCARDING' || s.phase === 'DECLARING') activePos = s.winner;
  else if (s.phase === 'KONTRA_DECLARING') activePos = game.expectedKontraPlayerPublic();
  for (let pos = 0; pos < 3; pos++) {
    const seat = SEAT_OF[pos];
    const el = $(`seat-${seat}`);
    el.classList.toggle('active', activePos === pos);
  }

  // Bule
  $('buleInfo').textContent = `${s.bulas[0]} / ${s.bulas[1]} / ${s.bulas[2]}`;
  $('trickInfo').textContent = `${s.trickCount}/10`;

  // Pojedinačne bule na sedenja
  $('bule-south').textContent = s.bulas[0];
  $('bule-east').textContent = s.bulas[1];
  $('bule-west').textContent = s.bulas[2];
  $('tricks-south').textContent = s.players[0].tricksWon;
  $('tricks-east').textContent = s.players[1].tricksWon;
  $('tricks-west').textContent = s.players[2].tricksWon;
  $('cards-south').textContent = s.players[0].hand.length;
  $('cards-east').textContent = s.players[1].hand.length;
  $('cards-west').textContent = s.players[2].hand.length;

  // Potez info
  $('turnName').textContent = phaseText(s);

  // Trump
  const banner = $('trumpBanner');
  if (s.trump) {
    banner.style.display = 'block';
    banner.textContent = `${s.trump} ${SUIT_NAMES[s.trump]}`;
  } else if (s.declaredGame && (s.declaredGame.includes('Sans') || s.declaredGame.includes('Betl'))) {
    banner.style.display = 'block';
    banner.textContent = `Bez aduta (${s.declaredGame})`;
  } else {
    banner.style.display = 'none';
  }
}

function phaseText(s) {
  if (s.phase === 'BIDDING') return `${POS_LABELS[s.currentBidder]} licitira`;
  if (s.phase === 'DISCARDING') return `${POS_LABELS[s.winner]} baca`;
  if (s.phase === 'DECLARING') return `${POS_LABELS[s.winner]} bira igru`;
  if (s.phase === 'FOLLOW_DECLARING') return 'Praćenje';
  if (s.phase === 'KONTRA_DECLARING') return 'Kontra';
  if (s.phase === 'PLAYING') return `${POS_LABELS[s.currentPlayer]} na redu`;
  if (s.phase === 'GAME_OVER') return 'Kraj';
  if (s.phase === 'REFE') return 'Refe';
  return '-';
}

// === TRICK SLOTOVI ===

function renderTrick() {
  const s = game.state;
  // Očisti slotove
  for (const seat of ['west', 'east', 'south']) {
    const slot = $(`slot-${seat}`);
    slot.innerHTML = '';
    slot.classList.remove('has-card', 'current-turn', 'led');
  }

  // Dodaj karte iz currentTrick
  if (s.currentTrick.length > 0) {
    const leadSuit = s.currentTrick[0].card.suit;
    for (const tc of s.currentTrick) {
      const seat = SEAT_OF[tc.player];
      const slot = $(`slot-${seat}`);
      slot.appendChild(cardEl(tc.card, { size: 'small' }));
      slot.classList.add('has-card');
      if (tc.player === s.currentTrick[0].player) slot.classList.add('led');
    }
  }

  // Highlight za trenutnog igrača
  if (s.phase === 'PLAYING' && s.currentTrick.length < 3) {
    const seat = SEAT_OF[s.currentPlayer];
    $(`slot-${seat}`).classList.add('current-turn');
  }
}

// === BIDDING PANEL ===

function renderBiddingPanel() {
  const s = game.state;
  const log = $('bidLog');
  log.innerHTML = '';

  if (s.bids.length === 0) {
    log.innerHTML = `<span class="bid-log-empty">Licitacija još nije počela...</span>`;
  } else {
    for (const b of s.bids) {
      const cls = `bid-entry p${b.player}`;
      const seat = SEAT_OF[b.player];
      const seatLabel = SEAT_PLAYER_NAME[b.player];
      let txt = '';
      if (b.type === 'PASS') txt = `<strong>dalje</strong>`;
      else if (b.type === 'IGRA') txt = `<strong>Igra ${b.game}</strong>`;
      else if (b.type === 'MOGU') txt = `<strong>mogu ${b.value}</strong>`;
      else txt = `<strong>${b.value}</strong>`;
      const extraCls = b.type === 'PASS' ? 'dalje' : (b.type === 'IGRA' ? 'igra' : (b.type === 'MOGU' ? 'mogu' : ''));
      log.innerHTML += `<span class="${cls} ${extraCls}">${seatLabel}: ${txt}</span>`;
    }
    // Skroluj na kraj
    log.scrollLeft = log.scrollWidth;
  }

  const ctrl = $('bidControls');
  ctrl.innerHTML = '';

  const player = s.currentBidder;
  const isHumanTurn = (s.phase === 'BIDDING' && player === 0 && mode === '1v2');
  const isAITurn = (s.phase === 'BIDDING' && !(player === 0 && mode === '1v2'));

  if (s.phase === 'BIDDING' && isHumanTurn) {
    // Čovek bira
    ctrl.appendChild(el('div', 'section-label', 'TVOJ POTEZ'));

    const passBtn = el('button', 'bid-btn danger', 'Dalje');
    passBtn.onclick = () => userBid('pass');
    ctrl.appendChild(passBtn);

    if (s.currentBid >= 2) {
      const moguBtn = el('button', 'bid-btn primary', `Mogu ${s.currentBid}`);
      moguBtn.onclick = () => userBid('mogu');
      ctrl.appendChild(moguBtn);
    }

    for (let v = Math.max(2, s.currentBid + 1); v <= 7; v++) {
      const btn = el('button', 'bid-btn', String(v));
      btn.onclick = () => userBid(String(v));
      ctrl.appendChild(btn);
    }

    ctrl.appendChild(el('div', 'section-label', 'IGRA'));
    const igraBtn = el('button', 'bid-btn igra', 'Igra (bez talona)');
    igraBtn.onclick = () => userSayIgra();
    ctrl.appendChild(igraBtn);
  } else if (isAITurn) {
    ctrl.appendChild(el('div', 'section-label', `AI (${SEAT_PLAYER_NAME[player]}) razmišlja...`));
    setTimeout(() => aiBidTurn(player), 500);
  } else if (s.phase !== 'BIDDING') {
    ctrl.innerHTML = '';
  }
}

// === DISCARD PANEL ===

let discardSelected = new Set();

function renderDiscarding() {
  const s = game.state;
  const ctrl = $('bidControls');
  ctrl.innerHTML = '';

  const winner = s.winner;
  const isAI = (mode === '1v2' && winner !== 0) || (mode === '3ai');

  if (isAI) {
    ctrl.appendChild(el('div', 'section-label', `${POS_LABELS[winner]} baci 2 karte...`));
    setTimeout(() => {
      const [id1, id2] = aiDiscard(winner);
      game.discard(winner, [id1, id2]);
      discardSelected = new Set();
      render();
    }, 500);
    return;
  }

  // Čovek bira karte za odbacivanje
  const winnerHand = s.players[winner].hand;
  const log = $('bidLog');
  log.innerHTML = `<span class="bid-entry p${winner}"><strong>${POS_LABELS[winner]} baci 2 karte (odaberi)</strong></span>`;

  // Prikaz ruke za discard — overlay na hand area
  const handArea = $('handArea');
  handArea.innerHTML = `<div class="hand-title">Odaberi 2 karte za odbacivanje (${discardSelected.size}/2)</div>`;
  for (const c of winnerHand) {
    const isSel = discardSelected.has(c.id);
    const card = cardEl(c, { selected: isSel });
    card.onclick = () => {
      if (discardSelected.has(c.id)) discardSelected.delete(c.id);
      else if (discardSelected.size < 2) discardSelected.add(c.id);
      else {
        const first = discardSelected.values().next().value;
        discardSelected.delete(first);
        discardSelected.add(c.id);
      }
      render();
    };
    handArea.appendChild(card);
  }
  const confirm = el('button', 'bid-btn primary', `Baci (${discardSelected.size}/2)`);
  confirm.disabled = discardSelected.size !== 2;
  confirm.style.opacity = discardSelected.size === 2 ? '1' : '0.5';
  confirm.onclick = () => {
    const ids = [...discardSelected];
    game.discard(winner, [ids[0], ids[1]]);
    discardSelected = new Set();
    render();
  };
  ctrl.appendChild(confirm);
}

// === DECLARING PANEL ===

function renderDeclaring() {
  const s = game.state;
  const ctrl = $('bidControls');
  ctrl.innerHTML = '';

  const winner = s.winner;
  const isAI = (mode === '1v2' && winner !== 0) || (mode === '3ai');
  const isIgra = s.igraPlayer === winner;

  if (isAI) {
    if (isIgra) {
      ctrl.appendChild(el('div', 'section-label', `${POS_LABELS[winner]} proglašava igru (Igra)...`));
      setTimeout(() => {
        const g = aiChooseIgraGame(winner);
        game.declareIgra(g);
        render();
      }, 600);
    } else {
      ctrl.appendChild(el('div', 'section-label', `${POS_LABELS[winner]} bira igru...`));
      setTimeout(() => {
        const g = aiChooseGame(winner);
        game.declareGame(winner, g);
        render();
      }, 500);
    }
    return;
  }

  const log = $('bidLog');
  if (isIgra) {
    log.innerHTML = `<span class="bid-entry p${winner}"><strong>${POS_LABELS[winner]}</strong> proglašava igru (Igra)</span>`;
  } else {
    log.innerHTML = `<span class="bid-entry p${winner}"><strong>${POS_LABELS[winner]}</strong> bira igru</span>`;
  }

  ctrl.appendChild(el('div', 'section-label', isIgra ? 'IGRA (bez talona)' : 'Dostupne igre'));

  const games = isIgra
    ? ['Igra-Pik', 'Igra-Karo', 'Igra-Herc', 'Igra-Tref', 'Igra-Betl', 'Igra-Sans']
    : STANDARD_GAMES.filter(g => GAME_VALUES[g] >= s.currentBid);

  for (const g of games) {
    const displayName = isIgra ? g.replace('Igra-', '') : `${g} (${GAME_VALUES[g]})`;
    const btn = el('button', 'bid-btn', displayName);
    btn.onclick = () => {
      if (isIgra) game.declareIgra(g);
      else game.declareGame(winner, g);
      render();
    };
    ctrl.appendChild(btn);
  }
}

// === FOLLOW PANEL ===

function renderFollowing() {
  const s = game.state;
  const ctrl = $('bidControls');
  ctrl.innerHTML = '';

  const followers = [0, 1, 2].filter(p => p !== s.winner);
  const undecided = followers.find(p => s.followChoices[p] === null);
  if (undecided === undefined) return;

  const isHumanTurn = undecided === 0 && mode === '1v2';
  const log = $('bidLog');
  const entries = [`<span class="bid-entry p${undecided}"><strong>${POS_LABELS[undecided]}</strong> — Dodjem ili Ne dodjem?</span>`];
  for (let p = 0; p < 3; p++) {
    if (s.followChoices[p] !== null && p !== s.winner) {
      const cls = s.followChoices[p] === 'DODJEM' ? 'mogu' : 'dalje';
      entries.push(`<span class="bid-entry p${p} ${cls}">${POS_LABELS[p]}: ${s.followChoices[p] === 'DODJEM' ? 'Dodjem' : 'Ne dodjem'}</span>`);
    }
  }
  log.innerHTML = entries.join('');

  if (isHumanTurn) {
    ctrl.appendChild(el('div', 'section-label', 'TVOJ POTEZ'));
    const dodjem = el('button', 'bid-btn primary', 'Dodjem');
    dodjem.onclick = () => { game.follow(0, 'DODJEM'); render(); };
    ctrl.appendChild(dodjem);
    const ne = el('button', 'bid-btn', 'Ne dodjem');
    ne.onclick = () => { game.follow(0, 'NE_DODJEM'); render(); };
    ctrl.appendChild(ne);

    // Poziv
    const neDodjem = followers.find(p => s.followChoices[p] === 'NE_DODJEM');
    const callerCandidate = followers.find(p => s.followChoices[p] === 'DODJEM');
    if (neDodjem !== undefined && callerCandidate !== undefined && undecided === callerCandidate) {
      const call = el('button', 'bid-btn', `Pozovi ${POS_LABELS[neDodjem]}`);
      call.onclick = () => { game.call(callerCandidate, neDodjem); render(); };
      ctrl.appendChild(call);
    }
  } else {
    ctrl.appendChild(el('div', 'section-label', `${POS_LABELS[undecided]} razmišlja...`));
    // Auto-decide for AI: prati ako ima <4 karte u ruci
    const hand = s.players[undecided].hand.length;
    const willFollow = hand >= 4;
    setTimeout(() => {
      game.follow(undecided, willFollow ? 'DODJEM' : 'NE_DODJEM');
      render();
    }, 400);
  }
}

// === KONTRA PANEL ===

function renderKontra() {
  const s = game.state;
  const ctrl = $('bidControls');
  ctrl.innerHTML = '';

  const expected = game.expectedKontraPlayerPublic();
  if (expected === null) return;

  const isHumanTurn = expected === 0 && mode === '1v2';
  const log = $('bidLog');
  log.innerHTML = `<span class="bid-entry p${expected}"><strong>${POS_LABELS[expected]}</strong> — Kontra ili Moze?</span>`;

  if (s.kontraLevel) {
    log.innerHTML += `<span class="bid-entry"><strong>Nivo: ${s.kontraLevel}</strong></span>`;
  }

  if (isHumanTurn) {
    const nextLevel = {
      null: 'KONTRA',
      'KONTRA': 'REKONTRA',
      'REKONTRA': 'SUBKONTRA',
      'SUBKONTRA': 'MORTKONTRA',
    }[s.kontraLevel ?? 'null'];
    const kontraBtn = el('button', 'bid-btn danger', nextLevel);
    kontraBtn.onclick = () => { game.kontra(expected, nextLevel); render(); };
    ctrl.appendChild(kontraBtn);
    const mozeBtn = el('button', 'bid-btn primary', 'Moze');
    mozeBtn.onclick = () => { game.moze(expected); render(); };
    ctrl.appendChild(mozeBtn);
  } else {
    ctrl.appendChild(el('div', 'section-label', `${POS_LABELS[expected]} razmišlja...`));
    // AI strategija: kontra samo ako misli da može pobediti (>=5 aduta)
    const trump = s.trump;
    const hand = s.players[expected].hand;
    const trumps = trump ? hand.filter(c => c.suit === trump).length : 0;
    const willKontra = s.kontraLevel !== 'MORTKONTRA' && Math.random() < trumps / 8;
    setTimeout(() => {
      if (willKontra) {
        const nextLevel = { null: 'KONTRA', 'KONTRA': 'REKONTRA', 'REKONTRA': 'SUBKONTRA', 'SUBKONTRA': 'MORTKONTRA' }[s.kontraLevel ?? 'null'];
        game.kontra(expected, nextLevel);
      } else {
        game.moze(expected);
      }
      render();
    }, 500);
  }
}

// === TVOJ HAND (PLAYING PHASE) ===

function renderHand() {
  const s = game.state;
  const handArea = $('handArea');
  handArea.innerHTML = '';

  if (s.phase === 'DISCARDING' && s.winner === 0 && mode === '1v2') {
    // Discard UI već renderovan
    return;
  }

  handArea.innerHTML = `<div class="hand-title">Tvoja ruka — ${s.players[0].hand.length} karata</div>`;

  const isMyTurn = (s.phase === 'PLAYING' && s.currentPlayer === 0 && mode === '1v2');

  for (const c of s.players[0].hand) {
    const legal = !isMyTurn || isCardLegal(c);
    const card = cardEl(c, { playable: isMyTurn && legal, disabled: isMyTurn && !legal });
    if (isMyTurn && legal) {
      card.onclick = () => userPlayCard(c.id);
    }
    handArea.appendChild(card);
  }
}

function isCardLegal(card) {
  const legal = game.getLegalCards(0);
  return legal.some(c => c.id === card.id);
}

// === MAIN RENDER ===

function render() {
  renderState();
  renderTrick();
  renderBiddingPanel();

  if (game.state.phase === 'DISCARDING') renderDiscarding();
  else if (game.state.phase === 'DECLARING') renderDeclaring();
  else if (game.state.phase === 'FOLLOW_DECLARING') renderFollowing();
  else if (game.state.phase === 'KONTRA_DECLARING') renderKontra();
  else {
    discardSelected = new Set();
  }

  renderHand();

  if (game.state.phase === 'GAME_OVER' || game.state.phase === 'REFE') {
    setTimeout(renderResult, 800);
  }
}

// === AI ===

function aiBidTurn(player) {
  const hand = game.state.players[player].hand;
  const suits = ['♠', '♥', '♦', '♣'];
  let bestSuit = suits[0], bestCount = 0, bestHigh = 0;
  for (const s of suits) {
    const cards = hand.filter(c => c.suit === s);
    const high = cards.reduce((max, c) => Math.max(max, rankValue(c.rank)), 0);
    if (cards.length > bestCount || (cards.length === bestCount && high > bestHigh)) {
      bestCount = cards.length; bestSuit = s; bestHigh = high;
    }
  }
  // Igra samo ako ima 6+ iste boje I visoke karte
  if (bestCount >= 6 && bestHigh >= 4) {
    game.sayIgra(player);
    render();
    return;
  }
  if (bestCount < 4) {
    game.pass(player);
    render();
    return;
  }
  const value = { '♠': 2, '♦': 3, '♥': 4, '♣': 5 }[bestSuit];
  if (value <= game.state.currentBid) {
    game.pass(player);
    render();
  } else {
    game.bid(player, value);
    render();
  }
}

function aiChooseGame(player) {
  const s = game.state;
  const hand = s.players[player].hand;
  const suits = ['♠', '♥', '♦', '♣'];
  let bestSuit = suits[0], bestCount = 0;
  for (const su of suits) {
    const c = hand.filter(card => card.suit === su).length;
    if (c > bestCount) { bestCount = c; bestSuit = su; }
  }
  const suitMap = { '♠': 'Pik', '♥': 'Herc', '♦': 'Karo', '♣': 'Tref' };
  const candidate = suitMap[bestSuit];
  if (GAME_VALUES[candidate] >= s.currentBid) return candidate;
  for (const g of STANDARD_GAMES) {
    if (GAME_VALUES[g] >= s.currentBid) return g;
  }
  return 'Pik';
}

function aiChooseIgraGame(player) {
  const hand = game.state.players[player].hand;
  const suits = ['♠', '♥', '♦', '♣'];
  let bestSuit = suits[0], bestCount = 0;
  for (const su of suits) {
    const c = hand.filter(card => card.suit === su).length;
    if (c > bestCount) { bestCount = c; bestSuit = su; }
  }
  const igraMap = { '♠': 'Igra-Pik', '♥': 'Igra-Herc', '♦': 'Igra-Karo', '♣': 'Igra-Tref' };
  return igraMap[bestSuit];
}

function aiDiscard(player) {
  const hand = game.state.players[player].hand;
  const sorted = hand.slice().sort((a, b) => rankValue(a.rank) - rankValue(b.rank));
  return [sorted[0].id, sorted[1].id];
}

// === USER ACTIONS ===

function userBid(action) {
  if (action === 'pass') game.pass(0);
  else if (action === 'mogu') game.bid(0, game.state.currentBid);
  else game.bid(0, parseInt(action));
  render();
}

function userSayIgra() {
  game.sayIgra(0);
  render();
}

function userPlayCard(cardId) {
  if (!game.playCard(0, cardId)) return;
  render();
  if (game.state.phase === 'PLAYING' && game.state.currentPlayer !== 0 && mode === '1v2') {
    setTimeout(aiPlayTurn, 400);
  }
}

function aiPlayTurn() {
  if (game.state.phase !== 'PLAYING') return;
  const player = game.state.currentPlayer;
  if (player === 0) return;
  const cardId = aiPlayCard(player);
  if (cardId) {
    game.playCard(player, cardId);
    render();
    if (game.state.phase === 'PLAYING' && game.state.currentPlayer !== 0 && mode === '1v2') {
      setTimeout(aiPlayTurn, 500);
    }
  }
}

function aiPlayCard(player) {
  const legal = game.getLegalCards(player);
  if (legal.length === 0) return null;
  const sorted = legal.slice().sort((a, b) => rankValue(a.rank) - rankValue(b.rank));
  return sorted[0].id;
}

// === RESULT ===

function renderResult() {
  const s = game.state;
  if (s.phase !== 'GAME_OVER' && s.phase !== 'REFE') return;
  $('resultScreen').classList.add('active');
  const title = s.phase === 'REFE' ? '🤝 Refe' : '🏁 Kraj partije';
  $('resultTitle').textContent = title;
  let msg = '';
  if (s.declaredGame) {
    const declarer = POS_LABELS[s.winner];
    const tricks = s.players[s.winner].tricksWon;
    const passed = (s.declaredGame.includes('Betl'))
      ? tricks === 0
      : tricks >= 6;
    msg = `<strong>${declarer}</strong> je igrao <strong>${s.declaredGame}</strong><br>`;
    msg += passed ? '✓ <strong style="color:#a5d6a7">PROŠAO</strong>' : '✗ <strong style="color:#ff8a80">PAO</strong>';
    msg += ` (${tricks} štihova)<br><br>`;
  } else {
    msg = 'Svi su rekli dalje.<br><br>';
  }
  msg += `<strong>Bule:</strong> ${s.bulas[0]} / ${s.bulas[1]} / ${s.bulas[2]}<br>`;
  msg += `<strong>Štihovi:</strong> ${s.players.map(p => p.tricksWon).join(' / ')}`;
  $('resultMsg').innerHTML = msg;
}

// === GAME FLOW ===

function startGame() {
  $('setupScreen').classList.remove('active');
  $('resultScreen').classList.remove('active');
  discardSelected = new Set();
  game.newHand(0);
  renderSeats();
  render();
  if (game.state.phase === 'BIDDING' && game.state.currentBidder !== 0) {
    setTimeout(() => aiBidTurn(game.state.currentBidder), 500);
  }
}

function nextRound() {
  $('resultScreen').classList.remove('active');
  game.state.round++;
  game.newHand((game.state.dealer + 1) % 3);
  discardSelected = new Set();
  renderSeats();
  render();
  if (game.state.phase === 'BIDDING' && game.state.currentBidder !== 0) {
    setTimeout(() => aiBidTurn(game.state.currentBidder), 500);
  }
}

function setGameMode(m) {
  mode = m;
  $('mode3ai').classList.toggle('active', m === '3ai');
  $('mode1v2').classList.toggle('active', m === '1v2');
}

// Global exposure
window.startGame = startGame;
window.nextRound = nextRound;
window.setGameMode = setGameMode;
window.userBid = userBid;
window.userSayIgra = userSayIgra;
window.game = game;
window.restart = () => {
  discardSelected = new Set();
  game.newHand(0);
  render();
  if (game.state.phase === 'BIDDING' && game.state.currentBidder !== 0) {
    setTimeout(() => aiBidTurn(game.state.currentBidder), 500);
  }
};

// INIT
renderSeats();
$('setupScreen').classList.add('active');
