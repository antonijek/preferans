// PREFERANS UI — koristi engine iz ./engine/dist/game.js

import { Game } from './engine/dist/game.js';
import { GAME_VALUES, STANDARD_GAMES, IGRA_GAMES } from './engine/dist/constants.js';
import {
  evaluateHand,
  chooseDiscard as aiChooseDiscard,
  chooseFollow as aiChooseFollow,
  chooseCallOrAlone as aiChooseCallOrAlone,
  chooseKontra as aiChooseKontra,
  choosePlayCard as aiChoosePlayCard,
} from './engine/dist/ai.js';

const POS_LABELS = ['Jug', 'Istok', 'Zapad'];
const SUIT_NAMES = { '♠': 'Pik', '♥': 'Herc', '♦': 'Karo', '♣': 'Tref' };
const SUIT_GLYPH = { '♠': '♠', '♥': '♥', '♦': '♦', '♣': '♣' };
const RANK_ORDER = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const game = new Game({ seed: Date.now() & 0xffff });
let mode = '1v2';

// Brojac "generacije" ruke — inkrementira se na SVAKI poziv newHand(), bilo
// da ga zove app.js (Sledeci krug/Restart) ILI engine INTERNO (REFE,
// "Pik bez kontre" ponistavanje ruke preko handleRefe()/
// handlePikWithoutKontra()). Ovo hvata slucaj koji app.js inace ne bi video:
// stari odlozeni AI setTimeout iz PONISTENE runde koji bi inace mogao
// pogresno da deluje u NOVOJ rundi ako se currentBidder/faza slucajno
// poklope (uzivo prijavljen bag: "pisalo je da sam rekao 3 u sledecoj
// rundi, a nisam"). Overrideovanje instance-property newHand hvata i
// this.newHand(...) pozive iznutra jer JS prvo trazi own property.
let handGeneration = 0;
const _originalNewHand = game.newHand.bind(game);
game.newHand = (...args) => {
  handGeneration++;
  return _originalNewHand(...args);
};

// === ISTORIJA RUKA / SUPE DUG-MATRICA (klijentski, za tabelu) ===
// debtMatrix[i][j] = koliko igrac i (nosilac) duguje igracu j (pratiocu) —
// kumulativno kroz celu sesiju. Izvor: game.state.lastHandResult, koji
// engine popunjava na kraju SVAKE ruke koja se stvarno bodovala.
let handHistory = [];
let debtMatrix = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
let lastRecordedHandResult = null;
let lastRefeSum = 0;

// Kumulativni neto odnos izmedju DVA igraca: pozitivno = "other" duguje
// "me"-u, negativno = "me" duguje "other"-u (korisnikov format: "20" = meni
// duguje 20, "-30" = ja dugujem 30).
function netSupeBetween(me, other) {
  return debtMatrix[other][me] - debtMatrix[me][other];
}

// RULES 5.1 konvencija (potvrdjeno ranije od korisnika, koristi se za
// redosled praćenja/kontre): levi sused = nextPlayer (p+1), desni = (p+2).
function leftNeighborOf(p) { return (p + 1) % 3; }
function rightNeighborOf(p) { return (p + 2) % 3; }

function recordHandIfNew() {
  const result = game.state.lastHandResult;
  if (!result || result === lastRecordedHandResult) return;
  lastRecordedHandResult = result;
  handHistory.push({
    round: game.state.round,
    winner: result.winner,
    winnerGame: result.winnerGame,
    kontraLevel: result.kontraLevel,
    passed: result.passed,
    bulas: result.bulas,
    supeDelta: result.supeDelta,
    // Da li je ova ruka odigrana kroz poseban "Igra" tok (RULES 3.4, bez
    // talona) — korisnikova ponavljana zabuna oko "Igra X odmah" bila je
    // delom i to sto se istorija runde nije razlikovala od normalne pobede.
    viaIgra: game.state.igraPlayer === result.winner,
  });
  if (result.winner !== null) {
    for (let p = 0; p < 3; p++) {
      if (p !== result.winner && result.supeDelta[p] > 0) {
        debtMatrix[result.winner][p] += result.supeDelta[p];
      }
    }
  }
}

function checkRefeToast() {
  const sum = game.state.refeCount[0] + game.state.refeCount[1] + game.state.refeCount[2];
  if (sum > lastRefeSum) {
    const toast = $('refeToast');
    toast.style.display = 'block';
    clearTimeout(checkRefeToast._t);
    checkRefeToast._t = setTimeout(() => { toast.style.display = 'none'; }, 2200);
  }
  lastRefeSum = sum;
}

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const fmt = c => `${c.rank}${c.suit}`;
const rankValue = r => RANK_ORDER.indexOf(r);
// Raspored ruke: tref, herc, pik, karo — unutar boje od A (najjace) do 7
const HAND_SUIT_ORDER = ['♣', '♥', '♠', '♦'];
const sortHand = cards => cards.slice().sort((a, b) => {
  const suitDiff = HAND_SUIT_ORDER.indexOf(a.suit) - HAND_SUIT_ORDER.indexOf(b.suit);
  if (suitDiff !== 0) return suitDiff;
  return rankValue(b.rank) - rankValue(a.rank);
});
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

// === STATUS BAR: ugovor + talon + odbrana + poslednji štih (uvek vidljivo
// dok ima šta da se prikaže — korisnikov zahtev "sve relevantno mora biti
// vidljivo", nezavisno od toga koja se faza trenutno renderuje ispod) ===

function renderStatusBar() {
  const s = game.state;
  const statusBar = $('statusBar');
  const contractBanner = $('contractBanner');
  const talonBanner = $('talonBanner');
  const defenseBanner = $('defenseBanner');
  const lastTrickBanner = $('lastTrickBanner');

  if (s.declaredGame && s.winner !== null) {
    const kontraLabel = { KONTRA: 'Kontra ×2', REKONTRA: 'Rekontra ×4', SUBKONTRA: 'Subkontra ×8', MORTKONTRA: 'Mortkontra ×16' };
    let txt = `${POS_LABELS[s.winner]} igra <strong>${s.declaredGame}</strong>`;
    // Vizuelno razlikuj normalnu pobedu (licitacija brojem -> proglasi igru)
    // od posebnog "Igra" toka (RULES 3.4, bez talona) — korisnikov
    // ponavljani utisak da se "Igra X" desilo odmah/pogresno je cesto samo
    // ovo, prikazano bez oznake, pa je delovalo dvosmisleno.
    if (s.igraPlayer === s.winner) txt += ` <span style="opacity:0.7">(Igra — bez talona)</span>`;
    if (s.kontraLevel) txt += ` <span class="kontra-tag">${kontraLabel[s.kontraLevel]}</span>`;
    contractBanner.innerHTML = txt;
    contractBanner.style.display = 'block';
  } else {
    contractBanner.style.display = 'none';
    contractBanner.innerHTML = '';
  }

  // Talon — vidljiv od trenutka uzimanja sve dok ne prodje PRVI stih igranja
  // (korisnikov zahtev: "ne vidim sta je AI kupio, prebrzo odigra, neka
  // ostane duze, makar dok ne prodje prvi stih"). Ranije je nestajao cim bi
  // nosilac proglasio igru (FOLLOW_DECLARING), sto je bilo prebrzo da se
  // stigne pogledati. Igra-tok ne uzima talon uopste, pa je s.lastTalon
  // prazan i baner se svakako ne prikazuje.
  const showTalon = s.lastTalon.length > 0 && (
    s.phase === 'DISCARDING' || s.phase === 'DECLARING' ||
    s.phase === 'FOLLOW_DECLARING' || s.phase === 'KONTRA_DECLARING' ||
    (s.phase === 'PLAYING' && s.trickCount === 0)
  );
  if (showTalon) {
    const cardsHtml = s.lastTalon.map(c => {
      const cls = isRed(c.suit) ? 'red' : '';
      return `<span class="mini-card ${cls}">${c.rank}${c.suit}</span>`;
    }).join('');
    talonBanner.innerHTML = `Talon je bio: ${cardsHtml}`;
    talonBanner.style.display = 'flex';
  } else {
    talonBanner.style.display = 'none';
    talonBanner.innerHTML = '';
  }

  // Odbrana — ko je došao/zvao, ostaje vidljivo tokom cele igre karata
  // (korisnikov zahtev: "ne vidim kako su došli, da li obojica posebno ili
  // neko zvao ovog drugog").
  const defenseTxt = defenseSummaryText(s);
  if (defenseTxt) {
    defenseBanner.innerHTML = defenseTxt;
    defenseBanner.style.display = 'block';
  } else {
    defenseBanner.style.display = 'none';
    defenseBanner.innerHTML = '';
  }

  const hasLastTrick = s.tricks.length > 0 && (s.phase === 'PLAYING' || s.phase === 'GAME_OVER');
  if (hasLastTrick) {
    const last = s.tricks[s.tricks.length - 1];
    const winnerPos = s.currentTrick.length > 0 ? s.currentTrick[0].player : s.currentPlayer;
    const cardsHtml = last.map(tc => {
      const cls = isRed(tc.card.suit) ? 'red' : '';
      return `<span class="mini-card ${cls}">${tc.card.rank}${tc.card.suit}</span>`;
    }).join('');
    lastTrickBanner.innerHTML = `Poslednji štih: ${cardsHtml} — <strong>${POS_LABELS[winnerPos]}</strong>`;
    lastTrickBanner.style.display = 'flex';
  } else {
    lastTrickBanner.style.display = 'none';
    lastTrickBanner.innerHTML = '';
  }

  const allHidden = [contractBanner, talonBanner, defenseBanner, lastTrickBanner]
    .every(el => el.style.display === 'none');
  statusBar.classList.toggle('empty', allHidden);
}

// Rezime praćenja: ko je Dođem/Ne dođem, i da li je neko pozvan ili igra sam.
// Vraca null dok praćenje nije završeno (ceka se ostatak konteksta).
function defenseSummaryText(s) {
  if (s.winner === null || s.declaredGame === null) return null;
  const followers = [0, 1, 2].filter(p => p !== s.winner);
  if (followers.some(p => s.followChoices[p] === null)) return null;
  const isBetl = isBetlGame(s.declaredGame);
  const parts = followers.map(p =>
    `${POS_LABELS[p]}: ${s.followChoices[p] === 'DODJEM' ? 'Dođem' : 'Ne dođem'}`
  );
  let extra = '';
  if (s.caller !== null && s.callee !== null) {
    extra = ` — <strong>${POS_LABELS[s.caller]} zove ${POS_LABELS[s.callee]}</strong>`;
  } else {
    const neDodjemCount = followers.filter(p => s.followChoices[p] === 'NE_DODJEM').length;
    if (neDodjemCount === 1) {
      const solo = followers.find(p => s.followChoices[p] === 'DODJEM');
      extra = ` — <strong>${POS_LABELS[solo]} igra sam</strong>`;
    } else if (neDodjemCount === followers.length) {
      extra = ` — <strong>niko ne prati</strong>, ${POS_LABELS[s.winner]} automatski uzima 10 štihova`;
    }
  }
  if (isBetl) extra += ' <span style="opacity:0.7">(Betl — svi automatski prate)</span>';
  return parts.join('  ') + extra;
}

function isBetlGame(g) {
  return g === 'Betl' || g === 'Igra-Betl';
}

// === SUPE / REFE po sedistu ===

function renderSeatExtras() {
  const s = game.state;
  for (let p = 0; p < 3; p++) {
    const seat = SEAT_OF[p];

    const leftNet = netSupeBetween(p, leftNeighborOf(p));
    const leftEl = $(`supe-left-${seat}`);
    leftEl.textContent = leftNet > 0 ? `+${leftNet}` : `${leftNet}`;
    leftEl.classList.toggle('positive', leftNet > 0);
    leftEl.classList.toggle('negative', leftNet < 0);

    const rightNet = netSupeBetween(p, rightNeighborOf(p));
    const rightEl = $(`supe-right-${seat}`);
    rightEl.textContent = rightNet > 0 ? `+${rightNet}` : `${rightNet}`;
    rightEl.classList.toggle('positive', rightNet > 0);
    rightEl.classList.toggle('negative', rightNet < 0);

    const refeCount = s.refeCount[p];
    $(`refe-${seat}`).textContent = refeCount > 0 ? `🔁×${refeCount}` : '';
  }
}

function phaseText(s) {
  if (s.phase === 'BIDDING') return `${POS_LABELS[s.currentBidder]} licitira`;
  if (s.phase === 'DISCARDING') return `${POS_LABELS[s.winner]} baca`;
  if (s.phase === 'DECLARING') return `${POS_LABELS[s.winner]} bira igru`;
  if (s.phase === 'FOLLOW_DECLARING') {
    const followers = [0, 1, 2].filter(p => p !== s.winner);
    const undecided = followers.find(p => s.followChoices[p] === null);
    return undecided !== undefined ? `${POS_LABELS[undecided]} — dođem?` : 'Praćenje';
  }
  if (s.phase === 'KONTRA_DECLARING') {
    const expected = game.expectedKontraPlayerPublic();
    return expected !== null ? `${POS_LABELS[expected]} — kontra?` : 'Kontra';
  }
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
      else if (b.type === 'IGRA') txt = `<strong>Igra</strong>`; // bez imena (RULES 3.4) — konkretna igra se bira tek posle pobede
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
    passBtn.onclick = (e) => userBid('pass', e);
    ctrl.appendChild(passBtn);

    // Neko je vec rekao "Igra" — numericka licitacija je zamrznuta (RULES 3.4).
    // Mogu samo "dalje" ili konkurisati svojom Igra (podmeni ispod).
    const igraFrozen = s.igraPlayer !== null && s.igraPlayer !== player;

    if (!igraFrozen) {
      // "Mogu" samo ako je covek VEC licitirao (bid ili mogu) u ovoj rundi I
      // trenutno je nadmasen (bidLevel < currentBid). Takav igrac je
      // "Mogu-eligible" i NE SME sam da podigne licitaciju — samo Mogu ili
      // Dalje (potvrdjeno direktno od korisnika kroz konkretne primere).
      // Podizanje je rezervisano za onog ko trenutno NIJE nadmasen (drzi vrh,
      // ili jos nije uopste licitirao).
      const moguEligible = s.currentBid >= 2 && s.players[0].bidLevel > 0 && s.currentBid > s.players[0].bidLevel;
      // SAMO JEDAN igrac sme potvrditi (Mogu) datu vrednost — ako je NEKO
      // VEC potvrdio preko Mogu, ta opcija nestaje i za ostale (potvrdjeno
      // direktno, vise puta od korisnika: "ne mogu 2 igraca da kazu mogu
      // X"). Takav igrac ostaje SAMO sa "Dalje" (ne sme ni da podigne —
      // ta zabrana vec vazi za sve Mogu-eligible igrace).
      const alreadyConfirmedByMogu = s.bids.some(b => b.type === 'MOGU' && b.value === s.currentBid);
      if (moguEligible && !alreadyConfirmedByMogu) {
        const moguBtn = el('button', 'bid-btn primary', `Mogu ${s.currentBid}`);
        moguBtn.onclick = (e) => userBid('mogu', e);
        ctrl.appendChild(moguBtn);
      } else if (!moguEligible) {
        // Samo jedan sledeci bid (currentBid+1), ne opseg 2-7
        const nextBid = Math.max(2, s.currentBid + 1);
        if (nextBid <= 7) {
          const btn = el('button', 'bid-btn', String(nextBid));
          btn.onclick = (e) => userBid(String(nextBid), e);
          ctrl.appendChild(btn);
        }
      }
    }

    ctrl.appendChild(el('div', 'section-label', 'IGRA'));
    const igraBtn = el('button', 'bid-btn igra', 'Igra (bez talona)');
    igraBtn.onclick = (e) => userSayIgra(e);
    ctrl.appendChild(igraBtn);
  } else if (isAITurn) {
    ctrl.appendChild(el('div', 'section-label', `AI (${SEAT_PLAYER_NAME[player]}) razmišlja...`));
    const gen = handGeneration;
    setTimeout(() => { if (gen === handGeneration) aiBidTurn(player); }, 500);
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
    const gen = handGeneration;
    setTimeout(() => {
      if (gen !== handGeneration || game.state.phase !== 'DISCARDING' || game.state.winner !== winner) return;
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
  for (const c of sortHand(winnerHand)) {
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
  confirm.onclick = (e) => {
    logTrustedAction('userDiscard', e);
    const ids = [...discardSelected];
    game.discard(winner, [ids[0], ids[1]]);
    discardSelected = new Set();
    render();
  };
  ctrl.appendChild(confirm);
}

// === DECLARING PANEL ===

// Ova faza se javlja i za regularnu pobedu (bira standardnu igru) i za IGRA
// tok (winner koji je rekao samo "Igra" tek sada imenuje konkretnu igru).
function renderDeclaring() {
  const s = game.state;
  const ctrl = $('bidControls');
  ctrl.innerHTML = '';

  const winner = s.winner;
  const isAI = (mode === '1v2' && winner !== 0) || (mode === '3ai');
  const isIgra = s.igraPlayer === winner;

  if (isAI) {
    const gen = handGeneration;
    if (isIgra) {
      ctrl.appendChild(el('div', 'section-label', `${POS_LABELS[winner]} proglašava igru (Igra)...`));
      setTimeout(() => {
        if (gen !== handGeneration || game.state.phase !== 'DECLARING' || game.state.winner !== winner) return;
        const g = aiChooseIgraGame(winner);
        game.declareIgra(g);
        render();
      }, 600);
    } else {
      ctrl.appendChild(el('div', 'section-label', `${POS_LABELS[winner]} bira igru...`));
      setTimeout(() => {
        if (gen !== handGeneration || game.state.phase !== 'DECLARING' || game.state.winner !== winner) return;
        const g = aiChooseGame(winner);
        game.declareGame(winner, g);
        render();
      }, 500);
    }
    return;
  }

  const log = $('bidLog');
  log.innerHTML = isIgra
    ? `<span class="bid-entry p${winner}"><strong>${POS_LABELS[winner]}</strong> proglašava igru (Igra)</span>`
    : `<span class="bid-entry p${winner}"><strong>${POS_LABELS[winner]}</strong> bira igru</span>`;

  ctrl.appendChild(el('div', 'section-label', isIgra ? 'IGRA (bez talona)' : 'Dostupne igre'));

  const games = isIgra
    ? IGRA_GAMES.filter(g => GAME_VALUES[g] >= s.currentBid)
    : STANDARD_GAMES.filter(g => GAME_VALUES[g] >= s.currentBid);

  for (const g of games) {
    const displayName = isIgra ? g.replace('Igra-', '') : `${g} (${GAME_VALUES[g]})`;
    const btn = el('button', 'bid-btn', displayName);
    btn.onclick = (e) => {
      logTrustedAction(`userDeclare game=${g} isIgra=${isIgra}`, e);
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
  const log = $('bidLog');
  const entries = [];
  for (let p = 0; p < 3; p++) {
    if (s.followChoices[p] !== null && p !== s.winner) {
      const cls = s.followChoices[p] === 'DODJEM' ? 'mogu' : 'dalje';
      entries.push(`<span class="bid-entry p${p} ${cls}">${POS_LABELS[p]}: ${s.followChoices[p] === 'DODJEM' ? 'Dodjem' : 'Ne dodjem'}</span>`);
    }
  }

  if (undecided !== undefined) {
    // Standardni tok — 'undecided' treba da kaze Dodjem/Ne dodjem
    entries.push(`<span class="bid-entry p${undecided}"><strong>${POS_LABELS[undecided]}</strong> — Dodjem ili Ne dodjem?</span>`);
    log.innerHTML = entries.join('');

    const isHumanTurn = undecided === 0 && mode === '1v2';
    if (isHumanTurn) {
      ctrl.appendChild(el('div', 'section-label', 'TVOJ POTEZ'));
      const dodjem = el('button', 'bid-btn primary', 'Dodjem');
      dodjem.onclick = (e) => { logTrustedAction('userFollow DODJEM', e); game.follow(0, 'DODJEM'); render(); };
      ctrl.appendChild(dodjem);
      const ne = el('button', 'bid-btn', 'Ne dodjem');
      ne.onclick = (e) => { logTrustedAction('userFollow NE_DODJEM', e); game.follow(0, 'NE_DODJEM'); render(); };
      ctrl.appendChild(ne);
    } else {
      ctrl.appendChild(el('div', 'section-label', `${POS_LABELS[undecided]} razmišlja...`));
      // Dodji ako ima bar 2 "sigurna" stiha (adut A/K/D sa duzinom, ili
      // asovi van aduta) — RULES 5.2 minimum za prolaz.
      const hand = s.players[undecided].hand;
      const willFollow = aiChooseFollow({ hand, declaredGame: s.declaredGame }) === 'DODJEM';
      const gen = handGeneration;
      setTimeout(() => {
        if (gen !== handGeneration || game.state.phase !== 'FOLLOW_DECLARING' || game.state.followChoices[undecided] !== null) return;
        game.follow(undecided, willFollow ? 'DODJEM' : 'NE_DODJEM');
        render();
      }, 400);
    }
    return;
  }

  // Oba pratioca su odlucila. Ako je tacno 1 DODJEM + 1 NE_DODJEM i jos nema
  // caller-a, DODJEM igrac MORA birati: pozvati NE_DODJEM ili igrati sam
  // (RULES 5.3). Bez ovoga bidding ostaje zaglavljen zauvek.
  if (s.caller !== null) { log.innerHTML = entries.join(''); return; }
  const neDodjem = followers.find(p => s.followChoices[p] === 'NE_DODJEM');
  const callerCandidate = followers.find(p => s.followChoices[p] === 'DODJEM');
  if (neDodjem === undefined || callerCandidate === undefined) { log.innerHTML = entries.join(''); return; }

  entries.push(`<span class="bid-entry p${callerCandidate}"><strong>${POS_LABELS[callerCandidate]}</strong> — zove ${POS_LABELS[neDodjem]} ili igra sam?</span>`);
  log.innerHTML = entries.join('');

  const isHumanCaller = callerCandidate === 0 && mode === '1v2';
  if (isHumanCaller) {
    ctrl.appendChild(el('div', 'section-label', 'TVOJ POTEZ'));
    const call = el('button', 'bid-btn', `Pozovi ${POS_LABELS[neDodjem]}`);
    call.onclick = (e) => { logTrustedAction(`userCall callee=${neDodjem}`, e); game.call(callerCandidate, neDodjem); render(); };
    ctrl.appendChild(call);
    const solo = el('button', 'bid-btn primary', 'Igram sam');
    solo.onclick = (e) => { logTrustedAction('userContinueWithoutCall', e); game.continueWithoutCall(); render(); };
    ctrl.appendChild(solo);
  } else {
    ctrl.appendChild(el('div', 'section-label', `${POS_LABELS[callerCandidate]} razmišlja (poziv)...`));
    const gen = handGeneration;
    setTimeout(() => {
      if (gen !== handGeneration || game.state.phase !== 'FOLLOW_DECLARING' || game.state.caller !== null) return;
      // Zovi partnera ako NJEGOVA ruka ima bar 1 siguran stih da doprinese,
      // inace igraj sam (RULES 5.3 — poziv ima smisla samo ako pozvani
      // stvarno moze pomoci).
      const neDodjemHand = game.state.players[neDodjem].hand;
      const action = aiChooseCallOrAlone({
        caller: callerCandidate,
        neDodjemHand,
        declaredGame: game.state.declaredGame,
      });
      if (action === 'CALL') game.call(callerCandidate, neDodjem);
      else game.continueWithoutCall();
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
    kontraBtn.onclick = (e) => { logTrustedAction(`userKontra level=${nextLevel}`, e); game.kontra(expected, nextLevel); render(); };
    ctrl.appendChild(kontraBtn);
    const mozeBtn = el('button', 'bid-btn primary', 'Moze');
    mozeBtn.onclick = (e) => { logTrustedAction('userMoze', e); game.moze(expected); render(); };
    ctrl.appendChild(mozeBtn);
  } else {
    ctrl.appendChild(el('div', 'section-label', `${POS_LABELS[expected]} razmišlja...`));
    // Kontra ako ima 4+ aduta, ili 3+ aduta sa 2+ visoke karte u adutu
    // (deterministicki prag, ne slucajno pogadjanje).
    const hand = s.players[expected].hand;
    const levelNum = { KONTRA: 1, REKONTRA: 2, SUBKONTRA: 3, MORTKONTRA: 4 }[s.kontraLevel] ?? 0;
    const willKontra = s.kontraLevel !== 'MORTKONTRA' &&
      aiChooseKontra({ hand, trump: s.trump, currentLevel: levelNum }) === 'KONTRA';
    const gen = handGeneration;
    setTimeout(() => {
      if (gen !== handGeneration || game.state.phase !== 'KONTRA_DECLARING' || game.expectedKontraPlayerPublic() !== expected) return;
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

  if (s.phase === 'DISCARDING' && s.winner === 0 && mode === '1v2') {
    // Discard UI vec renderovan u renderDiscarding() — ne diraj handArea
    return;
  }

  const handArea = $('handArea');
  handArea.innerHTML = `<div class="hand-title">Tvoja ruka — ${s.players[0].hand.length} karata</div>`;

  const isMyTurn = (s.phase === 'PLAYING' && s.currentPlayer === 0 && mode === '1v2');

  for (const c of sortHand(s.players[0].hand)) {
    const legal = !isMyTurn || isCardLegal(c);
    const card = cardEl(c, { playable: isMyTurn && legal, disabled: isMyTurn && !legal });
    if (isMyTurn && legal) {
      card.onclick = (e) => userPlayCard(c.id, e);
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
  renderStatusBar();
  renderSeatExtras();
  renderTrick();
  renderBiddingPanel();
  recordHandIfNew();
  checkRefeToast();
  if ($('scoreScreen').classList.contains('active')) renderScoreContent();

  if (game.state.phase === 'DISCARDING') renderDiscarding();
  else if (game.state.phase === 'DECLARING') renderDeclaring();
  else if (game.state.phase === 'FOLLOW_DECLARING') renderFollowing();
  else if (game.state.phase === 'KONTRA_DECLARING') renderKontra();
  else {
    discardSelected = new Set();
  }

  renderHand();

  if (game.state.phase === 'PLAYING') {
    const isHumanTurn = game.state.currentPlayer === 0 && mode === '1v2';
    if (!isHumanTurn) {
      const gen = handGeneration;
      setTimeout(() => { if (gen === handGeneration) aiPlayTurn(); }, 450);
    }
  }

  if (game.state.phase === 'GAME_OVER' || game.state.phase === 'REFE') {
    setTimeout(renderResult, 800);
  }
}

// === AI ===

function aiBidTurn(player) {
  // Odbrana od "stale" odlozenih poziva — ako se stanje promenilo (ili je
  // cela ruka u medjuvremenu ponistena i restartovana preko REFE/"Pik bez
  // kontre", vidi handGeneration) dok je ovaj setTimeout cekao, ne radi
  // nista (spreci pogresnu akciju u NOVOJ rundi — uzivo prijavljen bag).
  if (game.state.phase !== 'BIDDING' || game.state.currentBidder !== player) return;
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
  // Neko je vec rekao "Igra" — numericka licitacija je zamrznuta (RULES 3.4).
  // Mogu samo konkurisati svojom Igra ili reci "dalje".
  if (game.state.igraPlayer !== null && game.state.igraPlayer !== player) {
    if (bestCount >= 6 && bestHigh >= 4) {
      game.sayIgra(player);
    } else {
      game.pass(player);
    }
    render();
    return;
  }

  // Igra samo ako ima 6+ iste boje I visoke karte — igra se prijavljuje
  // odmah kao "Igra" (bez imena), konkretnu igru winner bira tek posle
  // pobede u licitaciji (RULES 3.4, vidi renderDeclaring()).
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
  // Licitacija ide striktno redom (+1), nikad skok na ciljanu vrednost (RULES 3.2)
  const targetValue = { '♠': 2, '♦': 3, '♥': 4, '♣': 5 }[bestSuit];
  const currentBid = game.state.currentBid;
  const myBidLevel = game.state.players[player].bidLevel;
  // Mogu-eligible: vec sam licitirao I trenutno sam nadmasen. Takav igrac NE
  // SME sam da podigne — samo Mogu (ako je vrednost i dalje u dometu mog
  // cilja) ili Dalje. Podizanje je rezervisano za onog ko trenutno NIJE
  // nadmasen (potvrdjeno direktno od korisnika).
  const moguEligible = currentBid > 0 && myBidLevel > 0 && myBidLevel < currentBid;
  // SAMO JEDAN igrac sme potvrditi (Mogu) datu vrednost — ako je NEKO VEC
  // potvrdio, AI (kao i covek) mora samo Dalje (ne sme ni da podigne dok je
  // Mogu-eligible). Bez ove provere, game.bid() bi tiho odbio poziv i AI bi
  // ostao "zaglavljen" bez ikakve akcije ovog poteza.
  const alreadyConfirmedByMogu = game.state.bids.some(b => b.type === 'MOGU' && b.value === currentBid);
  if (moguEligible) {
    if (!alreadyConfirmedByMogu && currentBid <= targetValue) {
      game.bid(player, currentBid); // Mogu — potvrdi da ostajem u trci
    } else {
      game.pass(player); // Mogu vec zauzet, ili opao dalje od moje ruke
    }
  } else if (currentBid >= targetValue) {
    game.pass(player);
  } else {
    game.bid(player, Math.max(2, currentBid + 1));
  }
  render();
}

function aiChooseGame(player) {
  const s = game.state;
  const hand = s.players[player].hand;
  const suitMap = { '♠': 'Pik', '♥': 'Herc', '♦': 'Karo', '♣': 'Tref' };
  const best = evaluateHand(hand).bestSuit;
  const candidate = best ? suitMap[best.suit] : null;
  if (candidate && GAME_VALUES[candidate] >= s.currentBid) return candidate;
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
  // Trump jos nije proglasen (discard je pre declareGame) — pretpostavi
  // nameravanu boju preko iste procene koju koristi aiChooseGame, da se
  // izbaci najslabije VAN te boje i cuvaju aduti.
  const best = evaluateHand(hand).bestSuit;
  const intendedTrump = best ? best.suit : null;
  const [c1, c2] = aiChooseDiscard(hand, intendedTrump);
  return [c1.id, c2.id];
}

// === USER ACTIONS ===

// Dijagnostika za uzivo prijavljene bagove ("pise da sam rekao 3, a nisam
// kliknuo", "licitacije nije ni bilo, odmah uzimam talon") — beleze se SVI
// pozivi na akcije coveka, sa oznakom da li je klik zaista pravi
// (e.isTrusted) i pun snapshot stanja u tom trenutku. Otvori F12 → Console
// posle sledeceg pojavljivanja i posalji ovaj log.
function logTrustedAction(label, e) {
  console.log(
    `[${label}] isTrusted=${e ? e.isTrusted : 'NEMA EVENTA'} ` +
    `phase=${game.state.phase} currentBidder=${game.state.currentBidder} ` +
    `currentPlayer=${game.state.currentPlayer} winner=${game.state.winner} ` +
    `handGen=${handGeneration} t=${new Date().toISOString()}`
  );
  if (!e || e.isTrusted !== true) {
    console.warn(`[${label}] SUMNJIV POZIV — nije trigerovan pravim (trusted) klikom korisnika!`, e, new Error().stack);
  }
}

function userBid(action, e) {
  logTrustedAction(`userBid action=${action}`, e);
  if (action === 'pass') game.pass(0);
  else if (action === 'mogu') game.bid(0, game.state.currentBid);
  else game.bid(0, parseInt(action));
  render();
}

function userSayIgra(e) {
  logTrustedAction('userSayIgra', e);
  game.sayIgra(0);
  render();
}

function userPlayCard(cardId, e) {
  logTrustedAction(`userPlayCard cardId=${cardId}`, e);
  if (!game.playCard(0, cardId)) return;
  render();
}

function aiPlayTurn() {
  if (game.state.phase !== 'PLAYING') return;
  const player = game.state.currentPlayer;
  if (player === 0 && mode === '1v2') return;
  const cardId = aiPlayCard(player);
  if (cardId) {
    game.playCard(player, cardId);
    render();
  }
}

// AI igra karte preko testiranog engine/src/ai.ts modula: pokusava da uzme
// stih najjeftinijom pobednickom kartom kad je isplativo (i nosilac i
// pratioci — obojica zele sto vise stihova, pratioci da obore nosioca), OSIM
// kad je nosilac Betl/Igra-Betl deklarant — tada MORA da izbegava stih
// (avoidTricks), jer u Betlu bilo koji uzet stih znaci pad (RULES 8).
function aiPlayCard(player) {
  const s = game.state;
  const legal = game.getLegalCards(player);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0].id;

  const isDeclarer = player === s.winner;
  const avoidTricks = isDeclarer && isBetlGame(s.declaredGame);
  const card = aiChoosePlayCard({
    hand: s.players[player].hand,
    currentTrick: s.currentTrick,
    trump: s.trump,
    declaredGame: s.declaredGame,
    winnerTricks: s.players[s.winner].tricksWon,
    avoidTricks,
  });
  return card ? card.id : legal[0].id;
}

// === RESULT ===

function renderResult() {
  const s = game.state;
  if (s.phase !== 'GAME_OVER' && s.phase !== 'REFE') return;
  $('resultScreen').classList.add('active');
  // "GAME_OVER" u engine-u znaci kraj RUKE, ne kraj cele partije (ta se
  // nastavlja dok zbir bula ne padne na 0) — naslov ispravljen da to
  // odrazava (korisnikov zahtev).
  const title = s.phase === 'REFE' ? '🤝 Refe' : '🏁 Kraj runde';
  $('resultTitle').textContent = title;
  let msg = '';
  if (s.declaredGame && s.lastHandResult) {
    // Koristi engine-ov lastHandResult kao izvor istine — pokriva i slucajeve
    // kad se nije igralo (RULES 5.4 "niko ne prati", RULES 7.1.1 "Pik bez kontre")
    const declarer = POS_LABELS[s.winner];
    const tricks = s.players[s.winner].tricksWon;
    msg = `<strong>${declarer}</strong> je igrao <strong>${s.declaredGame}</strong>`;
    if (s.igraPlayer === s.winner) msg += ` <span style="opacity:0.7">(Igra — bez talona)</span>`;
    // Kontra nivo — uzivo prijavljen propust: modal je prikazivao rezultat
    // bez ikakvog pomena da je kontra data, iako je bitno menjala racun.
    const kontraLabel = { KONTRA: 'Kontra ×2', REKONTRA: 'Rekontra ×4', SUBKONTRA: 'Subkontra ×8', MORTKONTRA: 'Mortkontra ×16' };
    if (s.kontraLevel) {
      msg += ` <span style="color:#ff8a80">${kontraLabel[s.kontraLevel]}</span> (dao: ${POS_LABELS[s.kontraPlayer]})`;
    }
    msg += `<br>`;
    msg += s.lastHandResult.passed ? '✓ <strong style="color:#a5d6a7">PROŠAO</strong>' : '✗ <strong style="color:#ff8a80">PAO</strong>';
    msg += ` (${tricks} štihova)<br>`;
    // Ko je dosao/zvao (isti rezime kao u statusnoj traci tokom igre) —
    // korisnikov zahtev: modal ne sme da preskoci ovaj podatak.
    const defenseTxt = defenseSummaryText(s);
    if (defenseTxt) msg += `${defenseTxt}<br>`;
    // Supe zaradjene OVOM rukom, po igracu — direktno objasnjava zasto neko
    // (npr. ne-kontras pratilac) ne dobija nista uprkos odigranim stihovima.
    const supeParts = [0, 1, 2]
      .map(p => ({ p, v: s.lastHandResult.supeDelta[p] }))
      .filter(x => x.v > 0)
      .map(x => `${POS_LABELS[x.p]}: +${x.v}`);
    if (supeParts.length > 0) msg += `Supe ove runde: ${supeParts.join(' · ')}<br>`;
    msg += `<br>`;
  } else {
    msg = 'Svi su rekli dalje.<br><br>';
  }
  msg += `<strong>Bule:</strong> ${s.bulas[0]} / ${s.bulas[1]} / ${s.bulas[2]}<br>`;
  msg += `<strong>Štihovi:</strong> ${POS_LABELS[0]}: ${s.players[0].tricksWon} · ${POS_LABELS[1]}: ${s.players[1].tricksWon} · ${POS_LABELS[2]}: ${s.players[2].tricksWon}`;
  $('resultMsg').innerHTML = msg;
}

// === TABELA (bule / supe / refe / istorija) ===

function renderScoreContent() {
  const s = game.state;
  const content = $('scoreContent');
  let html = '';

  // Trenutne bule u tradicionalnom formatu papirnog "lista za bulu": za
  // svakog igraca, sredina = njegove bule, leva/desna kolona = kumulativan
  // racun supe sa levim/desnim susedom (pozitivno = sused njemu duguje).
  html += `<div class="score-section-title">Trenutne bule</div>`;
  for (let p = 0; p < 3; p++) {
    const leftNet = netSupeBetween(p, leftNeighborOf(p));
    const rightNet = netSupeBetween(p, rightNeighborOf(p));
    const fmt = n => n > 0 ? `+${n}` : `${n}`;
    html += `<div class="debt-row score-triple">
      <span class="score-triple-side ${leftNet > 0 ? 'positive' : leftNet < 0 ? 'negative' : ''}">${fmt(leftNet)}</span>
      <span>${POS_LABELS[p]}</span>
      <span class="amount">${s.bulas[p]}</span>
      <span class="score-triple-side ${rightNet > 0 ? 'positive' : rightNet < 0 ? 'negative' : ''}">${fmt(rightNet)}</span>
    </div>`;
  }

  html += `<div class="score-section-title">Refe (iskorišćeno / dozvoljeno)</div>`;
  for (let p = 0; p < 3; p++) {
    html += `<div class="debt-row"><span>${POS_LABELS[p]}</span><span>${s.refeCount[p]} / ${game.refePerPlayer ?? 2}</span></div>`;
  }

  html += `<div class="score-section-title">Supe — ko kome duguje (ukupno u partiji)</div>`;
  let anyDebt = false;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (i === j || debtMatrix[i][j] <= 0) continue;
      anyDebt = true;
      html += `<div class="debt-row"><span>${POS_LABELS[i]} → ${POS_LABELS[j]}</span><span class="amount">${debtMatrix[i][j]}</span></div>`;
    }
  }
  if (!anyDebt) html += `<div class="score-empty">Još nema supa u ovoj partiji.</div>`;

  html += `<div class="score-section-title">Istorija ruku</div>`;
  if (handHistory.length === 0) {
    html += `<div class="score-empty">Još nije odigrana nijedna ruka.</div>`;
  } else {
    const kontraShort = { KONTRA: '×2', REKONTRA: '×4', SUBKONTRA: '×8', MORTKONTRA: '×16' };
    html += `<div style="overflow-x:auto"><table class="score-table"><thead><tr>
      <th>Krug</th><th>Nosilac</th><th>Igra</th><th>Kontra</th><th>Rezultat</th><th>Bule</th>
    </tr></thead><tbody>`;
    for (const h of [...handHistory].reverse()) {
      const resultTxt = h.passed ? '✓ prošao' : '✗ pao';
      html += `<tr>
        <td>${h.round}</td>
        <td>${POS_LABELS[h.winner]}</td>
        <td>${h.winnerGame}${h.viaIgra ? ' <span style="opacity:0.6">(Igra)</span>' : ''}</td>
        <td>${kontraShort[h.kontraLevel] ?? '—'}</td>
        <td>${resultTxt}</td>
        <td>${h.bulas.join('/')}</td>
      </tr>`;
    }
    html += `</tbody></table></div>`;
  }

  content.innerHTML = html;
}

function toggleScore() {
  const screen = $('scoreScreen');
  if (screen.classList.contains('active')) {
    screen.classList.remove('active');
  } else {
    renderScoreContent();
    screen.classList.add('active');
  }
}

// === GAME FLOW ===

function startGame() {
  $('setupScreen').classList.remove('active');
  $('resultScreen').classList.remove('active');
  discardSelected = new Set();
  game.newHand(0);
  renderSeats();
  render();
  // NAPOMENA: render() -> renderBiddingPanel() vec sam zakazuje AI potez
  // (ispravno, sa `player` zakljucanim u trenutku renderovanja). Ranije je
  // ovde postojao DUPLIRAN setTimeout koji je citao game.state.currentBidder
  // TEK kad tajmer opali (posle 500ms) — ako bi u medjuvremenu red stigao
  // bas do coveka (igrac 0), taj zaostali tajmer bi pozvao AI logiku ZA
  // COVEKA, mimo userBid(), bez ikakvog loga (uzivo prijavljen bag: "licitacije
  // nije ni bilo", "pise da sam rekao 3 a nisam"). Uklonjeno — render() gore
  // je dovoljan.
}

function nextRound() {
  $('resultScreen').classList.remove('active');
  game.state.round++;
  game.newHand((game.state.dealer + 1) % 3);
  discardSelected = new Set();
  renderSeats();
  render();
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
window.toggleScore = toggleScore;
window.game = game;
window.restart = () => {
  discardSelected = new Set();
  game.newHand(0);
  render();
};

// INIT
renderSeats();
$('setupScreen').classList.add('active');
