// PREFERANS UI — koristi engine iz ./engine/dist/game.js

import { Game } from './engine/dist/game.js';
import { GAME_VALUES, STANDARD_GAMES, IGRA_GAMES } from './engine/dist/constants.js';
import {
  evaluateHand,
  chooseBidAction as aiChooseBidAction,
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

// Kreira NOVU Game instancu sa datim podesavanjima (pocetna bula, broj refea
// po igracu — korisnikov zahtev: "sto" postavlja ovo, nema vise fiksno
// 100/2, korisno za brzo testiranje ponasanja u seširu bez odigravanja
// desetina ruka). Ponovo prikacinje handGeneration monkey-patch na SVAKU
// novu instancu, i drzi window.game sinhronizovan za F12 debug.
//
// handGeneration: brojac koji se inkrementira na SVAKI poziv newHand(), bilo
// da ga zove app.js (Sledeci krug/Restart) ILI engine INTERNO (REFE, "Pik
// bez kontre" ponistavanje ruke). Hvata slucaj koji app.js inace ne bi video:
// stari odlozeni AI setTimeout iz PONISTENE runde koji bi inace mogao
// pogresno da deluje u NOVOJ rundi ako se currentBidder/faza slucajno
// poklope (uzivo prijavljen bag: "pisalo je da sam rekao 3 u sledecoj rundi,
// a nisam"). Overrideovanje instance-property newHand hvata i this.newHand(...)
// pozive iznutra jer JS prvo trazi own property.
function createGame(config) {
  const g = new Game(config);
  const _originalNewHand = g.newHand.bind(g);
  g.newHand = (...args) => {
    handGeneration++;
    return _originalNewHand(...args);
  };
  window.game = g;
  return g;
}

let handGeneration = 0;
let game = createGame({ seed: Date.now() & 0xffff });
let mode = '1v2';

// === ONLINE MOD ===
// mySeat: koje sedište (0/1/2) KONTROLIŠE ovaj klijent — dodeljuje ga server
// pri room:create/room:join, ostaje null dok se ne pridruzimo sobi.
let mySeat = null;
let onlineSocket = null;
let onlineToken = null;
try { onlineToken = localStorage.getItem('pref_token'); } catch (e) { /* privatni mod ili blokiran storage — ok, samo bez pamcenja */ }

// "game" u online modu NIJE prava engine Game instanca — nema pristup
// serveru/rng-u/protivnickim rukama. To je tanak "proksi" istog oblika
// (isti nazivi metoda, isto .state) koji SVAKI poziv samo prosledi serveru
// preko socketa; server je jedini izvor istine. Ovo je namerno — sve
// postojece render/user-action funkcije vec pozivaju game.bid()/game.state.X
// bez ikakve izmene, isti kod radi i lokalno i online.
function createOnlineGameProxy(socket) {
  const proxy = { state: null };
  const send = (type, extra) => { socket.emit('game:action', { type, ...extra }); return true; };
  proxy.bid = (player, value) => send('bid', { value });
  proxy.pass = () => send('pass', {});
  proxy.sayIgra = () => send('sayIgra', {});
  proxy.declareIgra = (player, g) => send('declareIgra', { game: g });
  proxy.discard = (player, cardIds) => send('discard', { cardIds });
  proxy.declareGame = (player, g) => send('declareGame', { game: g });
  proxy.follow = (player, choice) => send('follow', { choice });
  proxy.call = (caller, callee) => send('call', { callee });
  proxy.continueWithoutCall = () => send('continueWithoutCall', {});
  proxy.kontra = (player, level) => send('kontra', { level });
  proxy.moze = () => send('moze', {});
  proxy.playCard = (player, cardId) => send('playCard', { cardId });
  // Ove dve NISU akcije — cisto citanje izvedenih vrednosti koje bi inace
  // zahtevalo dupliranje privatne engine logike (followersInKontraOrder,
  // pravila pracenja boje) u browseru. Server ih vec racuna (ima pravu Game
  // instancu) i salje kao deo redigovanog stanja — vidi server/src/socket/
  // roomEvents.ts buildClientState().
  proxy.expectedKontraPlayerPublic = () => proxy.state?.expectedKontraPlayer ?? null;
  proxy.getLegalCards = () => proxy.state?.legalCards ?? [];
  return proxy;
}

// Da li je DATI igrac trenutno pod ljudskom kontrolom (klikovi u UI-ju),
// nasuprot AI-ju. '3human' je testni mod (korisnikov zahtev) — čovek igra
// SVA TRI mesta za sto, da moze rucno da postavi tacne scenarije bez
// zavisnosti od AI ponasanja. U 'online' modu nema AI uopste (sva tri mesta
// su stvarni udaljeni ljudi) — "human" ovde znaci "MOJE sediste", ne "nije
// AI", jer klijent sme da prikaze dugmad/prihvati klik SAMO za sopstveno
// sediste, nikad za tudje (druga dva su stvarni ljudi na drugim uredjajima).
function isHuman(player) {
  if (mode === 'online') return player === mySeat;
  if (mode === '3ai') return false;
  if (mode === '3human') return true;
  return player === 0; // '1v2'
}

// === ISTORIJA RUKA / SUPE DUG-MATRICA (klijentski, za tabelu) ===
// debtMatrix[i][j] = koliko igrac i (nosilac) duguje igracu j (pratiocu) —
// kumulativno kroz celu sesiju. Izvor: game.state.lastHandResult, koji
// engine popunjava na kraju SVAKE ruke koja se stvarno bodovala.
let handHistory = [];
let debtMatrix = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
let lastRecordedHandResult = null;
let lastRefeSum = 0;
let lastRefePendingSum = 0;

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
  const toast = $('refeToast');
  const showToast = (text) => {
    toast.textContent = text;
    toast.style.display = 'block';
    clearTimeout(checkRefeToast._t);
    checkRefeToast._t = setTimeout(() => { toast.style.display = 'none'; }, 2200);
  };
  // Dodela (⏳ na raspolaganju svima) — bez ovoga korisnik nema NIKAKAV
  // vizuelni trag da je refa uopste dodeljena dok je neko kasnije stvarno
  // ne potrosi kao nosilac (uzivo prijavljen bag — "opet nema refe").
  const pendingSum = game.state.refePending[0] + game.state.refePending[1] + game.state.refePending[2];
  if (pendingSum > lastRefePendingSum) {
    showToast('🤝 REFA dodeljena svima! (na raspolaganju)');
  }
  lastRefePendingSum = pendingSum;
  // Potrošnja (🔁 iskorišćeno) — nosilac neke ruke trosi svoju
  const sum = game.state.refeCount[0] + game.state.refeCount[1] + game.state.refeCount[2];
  if (sum > lastRefeSum) {
    showToast(`🔁 ${POS_LABELS[game.state.lastHandResult?.refeConsumed ?? 0]} koristi refu — bule/supe ×2`);
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
// Lepezasto preklapanje karata u ruci — postavlja --rot/--lift CSS varijable
// po karti (CSS u preferans.html ih koristi za transform), srednja karta
// ostaje ravna, ivicne se blago rotiraju/spustaju kao prava lepeza.
function applyHandFan(container) {
  const cards = Array.from(container.children).filter(el => el.classList.contains('card'));
  const n = cards.length;
  if (n <= 1) { cards.forEach(c => { c.style.removeProperty('--rot'); c.style.removeProperty('--lift'); }); return; }
  const mid = (n - 1) / 2;
  const maxRotate = Math.min(2 + n * 0.8, 12);
  cards.forEach((card, i) => {
    const offset = i - mid;
    const rot = mid > 0 ? (offset / mid) * (maxRotate / 2) : 0;
    const lift = Math.abs(offset) * 1.5;
    card.style.setProperty('--rot', `${rot.toFixed(1)}deg`);
    card.style.setProperty('--lift', `${lift.toFixed(1)}px`);
    card.style.zIndex = String(i);
  });
}

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
    $(`dealer-${seat}`).style.display = s.dealer === pos ? 'flex' : 'none';
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
    const txt = `Talon je bio: ${cardsHtml}`;
    talonBanner.innerHTML = txt;
    talonBanner.style.display = 'flex';
  } else {
    talonBanner.style.display = 'none';
    talonBanner.innerHTML = '';
  }

  // Talon u sredini stola kao STVARNE karte (ne sitan tekst-bedz) —
  // korisnikov zahtev, inspirisano rasporedom iz referentnog screenshot-a.
  // NAPOMENA: uzi prozor vidljivosti nego status-bar tekst baner iznad —
  // korisnikov zahtev: prave karte NA STOLU smetaju vizuelno tokom igranja
  // prvog stiha ("2 karte talona koje stoje na stolu smetaju dok se igra
  // prvi stih") — ostaju SAMO dok nosilac ne proglasi igru (DISCARDING +
  // DECLARING), nestaju cim krene FOLLOW_DECLARING.
  const showTalonCenter = s.lastTalon.length > 0 && (
    s.phase === 'DISCARDING' || s.phase === 'DECLARING'
  );
  const talonCenter = $('talonCenter');
  if (showTalonCenter) {
    const cardsEl = $('talonCenterCards');
    cardsEl.innerHTML = '';
    for (const c of s.lastTalon) {
      cardsEl.appendChild(cardEl(c, { size: 'small' }));
    }
    talonCenter.style.display = 'flex';
  } else {
    talonCenter.style.display = 'none';
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

  const hasLastTrick = s.tricks.length > 0 && (s.phase === 'PLAYING' || s.phase === 'GAME_OVER' || s.phase === 'MATCH_OVER');
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

  // defenseBanner/lastTrickBanner sad zive u levom bocnom panelu (van
  // .status-bar), pa vise ne uticu na to da li se GORNJA traka kolabira —
  // samo contractBanner/talonBanner su i dalje stvarno u njoj.
  const allHidden = [contractBanner, talonBanner].every(el => el.style.display === 'none');
  statusBar.classList.toggle('empty', allHidden);

  // Levi bocni panel ima sopstvenu pozadinu/padding (.side-panel) — kad su
  // MU deca oba sakrivena, panel bi se i dalje video kao prazna tanka traka
  // (samo padding, bez sadrzaja). Sakrij ceo panel u tom slucaju.
  const leftPanelEmpty = defenseBanner.style.display === 'none' && lastTrickBanner.style.display === 'none';
  $('leftSidePanel').style.display = leftPanelEmpty ? 'none' : '';
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
      extra = ` — <strong>niko ne prati</strong>`;
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

    // 🔁×N = potrošene refe (iskorišćeno), ⏳N = refe "na raspolaganju" još
    // nepotrošene (dodeljene posle "svi dalje"/"Pik bez kontre") — bez ovog
    // drugog dela korisnik nema nikakav vizuelni trag da je refa uopšte
    // dodeljena dok je neko stvarno ne potroši (uzivo prijavljen bag).
    const refeCount = s.refeCount[p];
    const refePending = s.refePending[p];
    const parts = [];
    if (refeCount > 0) parts.push(`🔁×${refeCount}`);
    if (refePending > 0) parts.push(`⏳${refePending}`);
    $(`refe-${seat}`).textContent = parts.join(' ');
  }
}

// === TRICK SLOTOVI ===

// Deterministicka blaga rotacija (-7..7 stepeni) izvedena iz ID-a karte —
// ista karta uvek dobija istu rotaciju, pa se ne menja/trza izmedju rendera.
function cardRotationDeg(cardId) {
  let hash = 0;
  for (let i = 0; i < cardId.length; i++) hash = (hash * 31 + cardId.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 15) - 7;
}

// Prati duzinu proslog stiha izmedju renderTrick() poziva — samo NOVO
// odigrana karta (index >= prethodna duzina) dobija ulaznu animaciju, da se
// ne reprizira pri svakom re-renderu nepromenjenog stanja stiha.
let _prevTrickLen = 0;

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
    s.currentTrick.forEach((tc, idx) => {
      const seat = SEAT_OF[tc.player];
      const slot = $(`slot-${seat}`);
      const node = cardEl(tc.card, { size: 'small' });
      // Blaga, ne-savrsena rotacija (korisnikov zahtev — "kao pravo bacanje
      // karata, nije svaka pod istim uglom") — deterministicki izvedena iz
      // ID-a karte (ne Math.random() svaki render) da ostane STABILNA dok se
      // stih ne promeni, umesto da "trza" na svaki nepovezan re-render.
      node.style.setProperty('--rot', `${cardRotationDeg(tc.card.id)}deg`);
      if (idx >= _prevTrickLen) node.classList.add('card-dropped');
      slot.appendChild(node);
      slot.classList.add('has-card');
      if (idx === 0) slot.classList.add('led');
    });
  }
  _prevTrickLen = s.currentTrick.length;

  // Highlight za trenutnog igrača
  if (s.phase === 'PLAYING' && s.currentTrick.length < 3) {
    const seat = SEAT_OF[s.currentPlayer];
    $(`slot-${seat}`).classList.add('current-turn');
  }
}

// Suptilan watermark u sredini stola sakriva se čim ima BILO KOG stvarnog
// sadržaja tamo (talon, karte u toku) — korisnikov utisak da je sto "prazan
// i dosadan" pre nego što krene odigravanje. Trump-banner je uklonjen
// (korisnikov zahtev — dupliralo je info iz statusne trake i zaklanjalo
// odigrane karte), pa vise ne ucestvuje u ovoj proveri.
function updateTableWatermark() {
  const s = game.state;
  const hasContent = s.currentTrick.length > 0 ||
    $('talonCenter').style.display !== 'none';
  $('tableFelt').classList.toggle('has-center-content', hasContent);
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
  const isHumanTurn = (s.phase === 'BIDDING' && isHuman(player));
  const isAITurn = (s.phase === 'BIDDING' && !isHuman(player));

  if (s.phase === 'BIDDING' && isHumanTurn) {
    // Čovek bira. U '3human' modu (testiranje) igra se vise ljudi za istim
    // ekranom — label pokazuje KO je trenutno na potezu da ne bude zabune.
    ctrl.appendChild(el('div', 'section-label', mode === '3human' ? `POTEZ: ${POS_LABELS[player]}` : 'TVOJ POTEZ'));

    const passBtn = el('button', 'bid-btn danger', 'Dalje');
    passBtn.onclick = (e) => userBid('pass', e, player);
    ctrl.appendChild(passBtn);

    // Neko je vec rekao "Igra" — numericka licitacija je zamrznuta (RULES 3.4).
    // Mogu samo "dalje" ili konkurisati svojom Igra (podmeni ispod).
    const igraFrozen = s.igraPlayer !== null && s.igraPlayer !== player;

    if (!igraFrozen) {
      // "Mogu" samo ako je igrac VEC licitirao (bid ili mogu) u ovoj rundi I
      // trenutno je nadmasen (bidLevel < currentBid). Takav igrac je
      // "Mogu-eligible" i NE SME sam da podigne licitaciju DOK je Mogu
      // dostupan — samo Mogu ili Dalje (potvrdjeno direktno od korisnika).
      // Podizanje je dozvoljeno onom ko trenutno NIJE nadmasen (drzi vrh,
      // ili jos nije uopste licitirao), ILI kad je Mogu vec zauzet od
      // drugog (vidi alreadyConfirmedByMogu ispod).
      const moguEligible = s.currentBid >= 2 && s.players[player].bidLevel > 0 && s.currentBid > s.players[player].bidLevel;
      // SAMO JEDAN igrac sme potvrditi (Mogu) datu vrednost — ako je NEKO
      // VEC potvrdio preko Mogu, ta opcija nestaje i za ostale (potvrdjeno
      // direktno, vise puta od korisnika: "ne mogu 2 igraca da kazu mogu
      // X"). Takav igrac SME da podigne umesto (potvrdjeno uzivo, drugi
      // konkretan primer — ne sme ostati zaglavljen samo na Dalje).
      const alreadyConfirmedByMogu = s.bids.some(b => b.type === 'MOGU' && b.value === s.currentBid);
      if (moguEligible && !alreadyConfirmedByMogu) {
        const moguBtn = el('button', 'bid-btn primary', `Mogu ${s.currentBid}`);
        moguBtn.onclick = (e) => userBid('mogu', e, player);
        ctrl.appendChild(moguBtn);
      } else if (!moguEligible || alreadyConfirmedByMogu) {
        // Samo jedan sledeci bid (currentBid+1), ne opseg 2-7
        const nextBid = Math.max(2, s.currentBid + 1);
        if (nextBid <= 7) {
          // Zeleno kao i "Mogu" (korisnikov zahtev — podizanje licitacije je
          // pozitivna/napredujuca akcija, treba da izgleda dosledno sa Mogu).
          const btn = el('button', 'bid-btn primary', String(nextBid));
          btn.onclick = (e) => userBid(String(nextBid), e, player);
          ctrl.appendChild(btn);
        }
      }
    }

    // RULES 3.4 (korisnikov zahtev — uzivo prijavljen bug): "Igra" sme SAMO
    // na igracev PRVI potez u rundi. Cim je na svom prvom potezu vec rekao
    // broj ili "dalje", dugme vise ne sme da se nudi do kraja runde.
    if (s.players[player].igraEligible) {
      // Samo "Igra" (korisnikov zahtev — podnaslov "bez talona" nepotreban u
      // samom dugmetu, objasnjenje ostaje u kontrakt-baneru/statusnoj traci).
      const igraBtn = el('button', 'bid-btn igra', 'Igra');
      igraBtn.onclick = (e) => userSayIgra(e, player);
      ctrl.appendChild(igraBtn);
    }
  } else if (isAITurn && mode === 'online') {
    ctrl.appendChild(el('div', 'section-label', `Čeka se ${POS_LABELS[player]}...`));
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
  const isAI = !isHuman(winner);

  if (isAI && mode === 'online') {
    ctrl.appendChild(el('div', 'section-label', `Čeka se ${POS_LABELS[winner]} (baca 2 karte)...`));
    return;
  }

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
  applyHandFan(handArea);
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

// Ova faza se javlja za regularnu pobedu (bira standardnu igru), za IGRA
// tok (winner koji je rekao samo "Igra" tek sada imenuje konkretnu igru), I
// za RULES 3.4.1 tiebreak (VISE igraca reklo Igra — svaki mora proglasiti
// SVOJU igru pre nego sto se pobednik odredi poredjenjem jacine). U tom
// tiebreak slucaju je s.winner JOS null — ko je trenutno na potezu da
// proglasi pokazuje s.currentBidder (isti obrazac kao bidding/kontra).
function renderDeclaring() {
  const s = game.state;
  const ctrl = $('bidControls');
  ctrl.innerHTML = '';

  if (s.igraCompetitors !== null) {
    const player = s.currentBidder;
    const log = $('bidLog');
    log.innerHTML = `<span class="bid-entry p${player}"><strong>${POS_LABELS[player]}</strong> proglašava svoju Igru (${s.igraCompetitors.length} igrača rekla Igra — poredi se jačina)</span>`;

    if (!isHuman(player) && mode === 'online') {
      ctrl.appendChild(el('div', 'section-label', `Čeka se ${POS_LABELS[player]} (proglašava Igru)...`));
      return;
    }

    if (!isHuman(player)) {
      const gen = handGeneration;
      ctrl.appendChild(el('div', 'section-label', `${POS_LABELS[player]} proglašava igru (Igra)...`));
      setTimeout(() => {
        if (gen !== handGeneration || game.state.phase !== 'DECLARING' || game.state.igraCompetitors === null || game.state.currentBidder !== player) return;
        const g = aiChooseIgraGame(player);
        game.declareIgra(player, g);
        render();
      }, 600);
      return;
    }

    ctrl.appendChild(el('div', 'section-label', mode === '3human' ? `POTEZ: ${POS_LABELS[player]} — IGRA` : 'IGRA'));
    const games = IGRA_GAMES.filter(g => GAME_VALUES[g] >= s.currentBid);
    for (const g of games) {
      const btn = el('button', 'bid-btn', g.replace('Igra-', ''));
      btn.onclick = (e) => {
        logTrustedAction(`userDeclareIgraTiebreak game=${g} player=${player}`, e);
        game.declareIgra(player, g);
        render();
      };
      ctrl.appendChild(btn);
    }
    return;
  }

  const winner = s.winner;
  const isAI = !isHuman(winner);
  const isIgra = s.igraPlayer === winner;

  if (isAI && mode === 'online') {
    ctrl.appendChild(el('div', 'section-label', `Čeka se ${POS_LABELS[winner]} (bira igru)...`));
    return;
  }

  if (isAI) {
    const gen = handGeneration;
    if (isIgra) {
      ctrl.appendChild(el('div', 'section-label', `${POS_LABELS[winner]} proglašava igru (Igra)...`));
      setTimeout(() => {
        if (gen !== handGeneration || game.state.phase !== 'DECLARING' || game.state.winner !== winner) return;
        const g = aiChooseIgraGame(winner);
        game.declareIgra(winner, g);
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

  // Korisnikov zahtev (posle prve verzije ove izmene): ovde NE sme da ostane
  // stara istorija licitacije pored dugmadi za izbor igre — samo dostupne
  // opcije, cisto. Log se prazni (ne prepisuje sa "X bira igru" — to je opet
  // ponavljanje istog sto section-label ispod vec kaze).
  $('bidLog').innerHTML = '';
  ctrl.appendChild(el('div', 'section-label', isIgra ? 'IGRA' : 'Dostupne igre'));

  const games = isIgra
    ? IGRA_GAMES.filter(g => GAME_VALUES[g] >= s.currentBid)
    : STANDARD_GAMES.filter(g => GAME_VALUES[g] >= s.currentBid);

  for (const g of games) {
    const displayName = isIgra ? g.replace('Igra-', '') : `${g} (${GAME_VALUES[g]})`;
    const btn = el('button', 'bid-btn', displayName);
    btn.onclick = (e) => {
      logTrustedAction(`userDeclare game=${g} isIgra=${isIgra}`, e);
      if (isIgra) game.declareIgra(winner, g);
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
    // Standardni tok — 'undecided' treba da kaze Dodjem/Ne dodjem. Pitanje
    // "X — Dodjem ili Ne dodjem?" OVDE (u logu) je uklonjeno (korisnikov
    // zahtev — ponavljanje) jer tacno isto vec pise ispod ("POTEZ: X") pored
    // samih Dodjem/Ne dodjem dugmadi.
    log.innerHTML = entries.join('');

    const isHumanTurn = isHuman(undecided);
    if (isHumanTurn) {
      ctrl.appendChild(el('div', 'section-label', mode === '3human' ? `POTEZ: ${POS_LABELS[undecided]}` : 'TVOJ POTEZ'));
      const dodjem = el('button', 'bid-btn primary', 'Dodjem');
      dodjem.onclick = (e) => { logTrustedAction('userFollow DODJEM', e); game.follow(undecided, 'DODJEM'); render(); };
      ctrl.appendChild(dodjem);
      const ne = el('button', 'bid-btn danger', 'Ne dodjem');
      ne.onclick = (e) => { logTrustedAction('userFollow NE_DODJEM', e); game.follow(undecided, 'NE_DODJEM'); render(); };
      ctrl.appendChild(ne);
    } else if (mode === 'online') {
      ctrl.appendChild(el('div', 'section-label', `Čeka se ${POS_LABELS[undecided]}...`));
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

  // "X — zove Y ili igra sam?" uklonjeno (korisnikov zahtev — ponavljanje,
  // isto vec pise ispod pored dugmadi/labele).
  log.innerHTML = entries.join('');

  const isHumanCaller = isHuman(callerCandidate);
  if (isHumanCaller) {
    ctrl.appendChild(el('div', 'section-label', mode === '3human' ? `POTEZ: ${POS_LABELS[callerCandidate]}` : 'TVOJ POTEZ'));
    const call = el('button', 'bid-btn', `Pozovi ${POS_LABELS[neDodjem]}`);
    call.onclick = (e) => { logTrustedAction(`userCall callee=${neDodjem}`, e); game.call(callerCandidate, neDodjem); render(); };
    ctrl.appendChild(call);
    const solo = el('button', 'bid-btn primary', 'Igram sam');
    solo.onclick = (e) => { logTrustedAction('userContinueWithoutCall', e); game.continueWithoutCall(); render(); };
    ctrl.appendChild(solo);
  } else if (mode === 'online') {
    ctrl.appendChild(el('div', 'section-label', `Čeka se ${POS_LABELS[callerCandidate]}...`));
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

  const isHumanTurn = isHuman(expected);
  // "X — Kontra ili Moze?" ovde je uklonjeno (korisnikov zahtev —
  // ponavljanje istog sto vec pise ispod, bilo kroz Kontra/Moze dugmad ili
  // kroz "X razmišlja..." labelu). Nivo kontre (kad postoji) ostaje — to je
  // stvarna, ne-ponovljena informacija.
  const log = $('bidLog');
  log.innerHTML = s.kontraLevel ? `<span class="bid-entry"><strong>Nivo: ${s.kontraLevel}</strong></span>` : '';

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
  } else if (mode === 'online') {
    ctrl.appendChild(el('div', 'section-label', `Čeka se ${POS_LABELS[expected]}...`));
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

// U '3human' modu nema fiksnog "ti" — ruka koja se prikazuje/klika prati
// KO je trenutno na potezu (hot-seat), da bi se moglo rucno postaviti bilo
// koji scenario za sve tri pozicije. U '1v2'/'3ai' modu uvek je pozicija 0.
function activeHandOwner(s) {
  if (mode === 'online') return mySeat;
  if (mode !== '3human') return 0;
  if (s.phase === 'PLAYING') return s.currentPlayer;
  if (s.phase === 'BIDDING') return s.currentBidder;
  return s.winner ?? s.currentBidder;
}

function renderHand() {
  const s = game.state;

  // Kibicer (online spectator) nema svoje sediste/ruku da prikaze.
  if (mode === 'online' && mySeat === null) {
    $('handArea').innerHTML = '';
    return;
  }

  if (s.phase === 'DISCARDING' && isHuman(s.winner)) {
    // Discard UI vec renderovan u renderDiscarding() — ne diraj handArea
    return;
  }

  const handOwner = activeHandOwner(s);
  const handArea = $('handArea');
  // "Tvoja ruka" label uklonjen (korisnikov zahtev — nepotreban, oslobadja
  // prostor za vece karte). U '3human' modu ime i dalje pise jer je tu
  // stvarno potrebno (vise ljudi deli isti ekran, mora se znati cije su ruke).
  handArea.innerHTML = mode === '3human' ? `<div class="hand-title">${POS_LABELS[handOwner]}</div>` : '';

  const isMyTurn = (s.phase === 'PLAYING' && isHuman(s.currentPlayer));

  for (const c of sortHand(s.players[handOwner].hand)) {
    const legal = !isMyTurn || isCardLegal(c, handOwner);
    const card = cardEl(c, { playable: isMyTurn && legal, disabled: isMyTurn && !legal });
    if (isMyTurn && legal) {
      card.onclick = (e) => userPlayCard(c.id, e, handOwner);
    }
    handArea.appendChild(card);
  }
  applyHandFan(handArea);
}

function isCardLegal(card, player = 0) {
  const legal = game.getLegalCards(player);
  return legal.some(c => c.id === card.id);
}

// === MAIN RENDER ===

function render() {
  renderState();
  renderStatusBar();
  renderSeatExtras();
  renderTrick();
  renderBiddingPanel();
  updateTableWatermark();
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
    const isHumanTurn = isHuman(game.state.currentPlayer);
    if (!isHumanTurn && mode !== 'online') {
      const gen = handGeneration;
      setTimeout(() => { if (gen === handGeneration) aiPlayTurn(); }, 450);
    }
  }

  if (game.state.phase === 'GAME_OVER' || game.state.phase === 'REFE' || game.state.phase === 'MATCH_OVER') {
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
  const s = game.state;
  const hand = s.players[player].hand;

  // Neko je vec rekao "Igra" — numericka licitacija je zamrznuta (RULES 3.4).
  // Mogu samo konkurisati svojom Igra ili reci "dalje". chooseBidAction() ne
  // modelira ovaj slucaj (RULES 3.4.1 tiebreak) uopste, pa ostaje posebno
  // ovde — prag usklađen sa istim IGRA pragom koji chooseBidAction koristi
  // (evaluateHand().bestSuit: 6+ karata, 2+ visoke, najjaca bar Dama/J>=4)
  // radi konzistentnosti dve grane koje odlucuju o istoj stvari.
  if (s.igraPlayer !== null && s.igraPlayer !== player) {
    const best = evaluateHand(hand).bestSuit;
    // RULES 3.4: Igra sme SAMO na igracev prvi potez u rundi (igraEligible)
    // — bez ove provere, AI bi pokusao sayIgra() posle sopstvenog ranijeg
    // broja/dalje, engine bi ga tiho odbio (vraca false), i partija bi
    // ostala zaglavljena zauvek na ovom igracu (uzivo prijavljen rizik).
    const canIgra = s.players[player].igraEligible && best && best.count >= 6 && best.highCards >= 2 &&
      best.topCard && rankValue(best.topCard.rank) >= 4;
    if (canIgra) {
      game.sayIgra(player);
    } else {
      game.pass(player);
    }
    render();
    return;
  }

  // Sva ostala licitacija (numericka, Mogu, Igra) — poveri vec testiranoj,
  // bogatijoj heuristici iz engine/src/ai.ts (dužina boje po nivou + as u
  // vodecoj boji / bilo koji as / 3+ kralja u drugim bojama), umesto stare
  // grube provere "dovoljno karata u najduzoj boji" bez ikakvog razloga
  // (uzivo prijavljen bag — "licitira bez ikakvog rezona").
  const passedPlayers = new Set(s.players.map((p, i) => i).filter(i => s.players[i].hasPassedBid));
  const action = aiChooseBidAction({
    hand,
    currentBid: s.currentBid,
    bidStartPlayer: s.bidStartPlayer,
    currentBidder: s.currentBidder,
    passedPlayers,
    playerBidLevel: s.players[player].bidLevel,
    bids: s.bids,
  });
  // Isti razlog kao gore — chooseBidAction() ne zna za igraEligible (RULES
  // 3.4), pa moze predloziti IGRA i posle igracevog prvog poteza. Bez ove
  // zastite, sayIgra() bi tiho vratio false i AI ostao zaglavljen zauvek.
  if (action.type === 'IGRA' && !s.players[player].igraEligible) {
    game.pass(player);
  } else {
    switch (action.type) {
      case 'PASS': game.pass(player); break;
      case 'IGRA': game.sayIgra(player); break;
      case 'BID': game.bid(player, action.value); break;
      case 'MOGU': game.bid(player, action.value); break; // Mogu = bid iste vrednosti
    }
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

function userBid(action, e, player = 0) {
  logTrustedAction(`userBid action=${action} player=${player}`, e);
  if (action === 'pass') game.pass(player);
  else if (action === 'mogu') game.bid(player, game.state.currentBid);
  else game.bid(player, parseInt(action));
  render();
}

function userSayIgra(e, player = 0) {
  logTrustedAction(`userSayIgra player=${player}`, e);
  game.sayIgra(player);
  render();
}

function userPlayCard(cardId, e, player = 0) {
  logTrustedAction(`userPlayCard cardId=${cardId} player=${player}`, e);
  if (!game.playCard(player, cardId)) return;
  render();
}

function aiPlayTurn() {
  if (game.state.phase !== 'PLAYING') return;
  const player = game.state.currentPlayer;
  if (isHuman(player)) return;
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
    isDeclarer,
    kontraLevel: s.kontraLevel,
    trickCount: s.trickCount,
    myPosition: player,
    declarer: s.winner,
  });
  return card ? card.id : legal[0].id;
}

// === RESULT ===

function renderResult() {
  const s = game.state;
  if (s.phase !== 'GAME_OVER' && s.phase !== 'REFE' && s.phase !== 'MATCH_OVER') return;
  $('resultScreen').classList.add('active');
  // "GAME_OVER" u engine-u znaci kraj RUKE, ne kraj cele partije (ta se
  // nastavlja dok zbir bula ne padne na TACNO 0, vidi RULES 9.1/9.1.1) —
  // "MATCH_OVER" je NOVA, odvojena faza za stvarni kraj CELE partije.
  const title = s.phase === 'REFE' ? '🤝 Refe' : (s.phase === 'MATCH_OVER' ? '🏆 Kraj partije!' : '🏁 Kraj runde');
  $('resultTitle').textContent = title;
  $('resultTitle').classList.toggle('match-over-title', s.phase === 'MATCH_OVER');
  $('resultBox').classList.toggle('match-over', s.phase === 'MATCH_OVER');

  if (s.phase === 'MATCH_OVER') {
    // Korisnikov zahtev: kraj PARTIJE ne treba da ponavlja narativ poslednje
    // ruke (ko je igrao sta, prosao/pao...) — samo naslov + tabela konacnog
    // plasmana. Plasman NIJE samo najniza bula: supe (ko kome duguje) se
    // moraju neto uracunati, jer igrac sa niskom bulom ali velikim dugom
    // prema drugima moze biti efektivno losiji od nekog sa visom bulom kome
    // se duguje. Efektivni rezultat = bula + (sta duguje) - (sta mu duguju),
    // nize je bolje (isti smer kao gola bula ranije).
    const effective = [0, 1, 2].map(p =>
      s.bulas[p] - (netSupeBetween(p, leftNeighborOf(p)) + netSupeBetween(p, rightNeighborOf(p)))
    );
    const ranking = [0, 1, 2].slice().sort((a, b) => effective[a] - effective[b]);
    const winnerPos = ranking[0];
    let html = `<div class="score-players-row">`;
    for (const p of ranking) {
      html += `<div class="score-player-card ${p === winnerPos ? 'winner' : ''}">
        <div class="score-player-name">${POS_LABELS[p]}${p === winnerPos ? ' 🏆' : ''}</div>
        <div class="score-player-row"><span class="score-player-bula">${s.bulas[p]}</span></div>
      </div>`;
    }
    html += `</div>`;
    html += `<p style="text-align:center;margin-top:14px">🏆 <strong style="color:#ffeb3b">${POS_LABELS[winnerPos]} pobeđuje!</strong></p>`;
    $('resultMsg').innerHTML = html;
    return;
  }

  let msg = '';
  if (s.declaredGame && s.lastHandResult) {
    // Koristi engine-ov lastHandResult kao izvor istine — pokriva i slucajeve
    // kad se nije igralo (RULES 5.4 "niko ne prati", RULES 7.1.1 "Pik bez kontre")
    const declarer = POS_LABELS[s.winner];
    msg = `<strong>${declarer}</strong> je igrao <strong>${s.declaredGame}</strong>`;
    // Kontra nivo — uzivo prijavljen propust: modal je prikazivao rezultat
    // bez ikakvog pomena da je kontra data, iako je bitno menjala racun.
    const kontraLabel = { KONTRA: 'Kontra ×2', REKONTRA: 'Rekontra ×4', SUBKONTRA: 'Subkontra ×8', MORTKONTRA: 'Mortkontra ×16' };
    if (s.kontraLevel) {
      msg += ` <span style="color:#ff8a80">${kontraLabel[s.kontraLevel]}</span> (dao: ${POS_LABELS[s.kontraPlayer]})`;
    }
    msg += `<br>`;
    msg += s.lastHandResult.passed ? '✓ <strong style="color:#a5d6a7">PROŠAO</strong>' : '✗ <strong style="color:#ff8a80">PAO</strong>';
    msg += `<br>`;
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

  // Trenutne bule — JEDNA velika "fokalna" kartica (kao tradicionalni papirni
  // list za bulu), ne 3 male kartice (korisnikov zahtev — "ne svidja mi se
  // to"). Iznad leve/desne supe pise IME suseda na koga se ta supa odnosi;
  // u sredini fokalni igrac (ime + bula); refe kao rec "Refe:" + tackice.
  // Strelica ispod prebacuje fokus na sledeceg igraca (kruzno).
  html += `<div class="score-section-title">Trenutne bule</div>`;
  {
    const p = scoreFocalPlayer;
    const left = leftNeighborOf(p);
    const right = rightNeighborOf(p);
    const leftNet = netSupeBetween(p, left);
    const rightNet = netSupeBetween(p, right);
    const fmt = n => n > 0 ? `+${n}` : `${n}`;
    const totalRefeSlots = game.refePerPlayer ?? 2;
    let dots = '';
    for (let i = 0; i < totalRefeSlots; i++) {
      const cls = i < s.refeCount[p] ? 'used' : i < s.refeCount[p] + s.refePending[p] ? 'pending' : '';
      dots += `<span class="refe-dot ${cls}"></span>`;
    }
    html += `<div class="score-focal-card">
      <div class="score-focal-neighbors">
        <span>${POS_LABELS[left]}</span>
        <span>${POS_LABELS[right]}</span>
      </div>
      <div class="score-focal-row">
        <span class="score-triple-side ${leftNet > 0 ? 'positive' : leftNet < 0 ? 'negative' : ''}">${fmt(leftNet)}</span>
        <span class="score-focal-center">
          <span class="score-focal-name">${POS_LABELS[p]}</span>
          <span class="score-focal-bula">${s.bulas[p]}</span>
        </span>
        <span class="score-triple-side ${rightNet > 0 ? 'positive' : rightNet < 0 ? 'negative' : ''}">${fmt(rightNet)}</span>
      </div>
      <div class="score-focal-refe">Refe: ${dots}</div>
    </div>
    <div class="score-focal-nav">
      <button class="score-nav-btn" onclick="cycleScoreFocal()">${POS_LABELS[(p + 1) % 3]} ▶</button>
    </div>`;
  }

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

// Koji igrac je trenutno prikazan u "Trenutne bule" fokalnoj kartici —
// resetuje se na Jug (0) pri svakom otvaranju tabele.
let scoreFocalPlayer = 0;

function cycleScoreFocal() {
  scoreFocalPlayer = (scoreFocalPlayer + 1) % 3;
  renderScoreContent();
}
window.cycleScoreFocal = cycleScoreFocal;

function toggleScore() {
  const screen = $('scoreScreen');
  if (screen.classList.contains('active')) {
    screen.classList.remove('active');
  } else {
    scoreFocalPlayer = 0;
    renderScoreContent();
    screen.classList.add('active');
  }
}

// === GAME FLOW ===

function startGame() {
  $('setupScreen').classList.remove('active');
  $('resultScreen').classList.remove('active');

  // Korisnikov zahtev: "sto" (onaj ko pokrece partiju) bira pocetnu bulu i
  // broj refea po igracu — nije vise fiksno 100/2. Korisno za brzo testiranje
  // ponasanja u seširu (negativne bule) bez desetina odigranih ruka.
  const bulaInput = parseInt($('setupStartBula').value, 10);
  const refeInput = parseInt($('setupRefeCount').value, 10);
  const initialBule = Number.isFinite(bulaInput) && bulaInput > 0 ? bulaInput : 100;
  const refePerPlayer = Number.isFinite(refeInput) && refeInput >= 0 ? refeInput : 2;
  game = createGame({ seed: Date.now() & 0xffff, initialBule, refePerPlayer });

  // Nova partija — resetuj svu sesijsku istoriju od (eventualne) prethodne
  // partije na istoj stranici (Zavrsi -> nova partija sa drugim podesavanjima).
  // Bez ovoga bi supe-dug-matrica/istorija ruka procurile u novu partiju.
  handHistory = [];
  debtMatrix = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  lastRecordedHandResult = null;
  lastRefeSum = 0;
  lastRefePendingSum = 0;

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

// Jedino dugme na result-ekranu (korisnikov zahtev — bilo je 2, "Sledeci
// krug" i "Zavrsi", sad samo "Igraj"). Ponasanje zavisi od faze: obicna
// ruka -> sledeca ruka; MATCH_OVER -> nema "sledece ruke", vraca na setup
// (isto sto je ranije radilo "Zavrsi").
function resultAction() {
  if (game.state.phase === 'MATCH_OVER') {
    $('setupScreen').classList.add('active');
    $('resultScreen').classList.remove('active');
  } else {
    nextRound();
  }
}

// === ONLINE: login/registracija ===

function goOnline() {
  $('setupScreen').classList.remove('active');
  $('loginScreen').classList.add('active');
  $('loginError').textContent = '';
  if (onlineToken) connectOnlineSocket();
}

async function doRegister() {
  await onlineAuth('/api/register');
}

async function doLogin() {
  await onlineAuth('/api/login');
}

async function onlineAuth(path) {
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  $('loginError').textContent = '';
  if (!email || !password) { $('loginError').textContent = 'Unesi email i lozinku.'; return; }
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!data.token) { $('loginError').textContent = data.error || 'Greška.'; return; }
    onlineToken = data.token;
    try { localStorage.setItem('pref_token', onlineToken); } catch (e) { /* ok bez pamcenja */ }
    connectOnlineSocket();
  } catch (e) {
    $('loginError').textContent = 'Ne mogu da se povežem sa serverom.';
  }
}

// === ONLINE: socket konekcija + prelaz na sto ===

// Ucitava socket.io klijent SAMO kad se stvarno udje u online mod — namerno
// NEMA <script> tag za ovo u preferans.html. Taj put (/socket.io/socket.io.js)
// postoji samo na PRAVOM multiplayer serveru; kad se stranica servira preko
// tools/serve.js (cist static server za lokalno AI testiranje, bez backend-a)
// takav tag bi bio 404 u konzoli na SVAKOM ucitavanju stranice — uzivo uhvaceno
// od npm run test:ui:multi (strogo prati konzolu, sve partije su prijavljivane
// kao "ERR" iako su se stvarno odigrale, samo zbog tog 404 logа).
function loadSocketIoScript() {
  return new Promise((resolve, reject) => {
    if (typeof io !== 'undefined') { resolve(); return; }
    const script = document.createElement('script');
    script.src = '/socket.io/socket.io.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Server nije dostupan (nema backend konekcije sa ove adrese).'));
    document.head.appendChild(script);
  });
}

async function connectOnlineSocket() {
  try {
    await loadSocketIoScript();
  } catch (e) {
    $('loginError').textContent = e.message;
    return;
  }
  if (onlineSocket) onlineSocket.disconnect();

  mode = 'online';
  mySeat = null;
  game = createOnlineGameProxy(onlineSocket = io('/', { auth: { token: onlineToken } }));
  window.game = game; // F12 debug (createGame() radi ovo za lokalni mod, ovde je isti obicaj)

  onlineSocket.on('connect', () => {
    $('loginScreen').classList.remove('active');
    $('roomScreen').classList.add('active');
    $('roomError').textContent = '';
  });
  onlineSocket.on('connect_error', (err) => {
    onlineSocket = null;
    $('loginScreen').classList.add('active');
    $('roomScreen').classList.remove('active');
    $('loginError').textContent = 'Greška konekcije: ' + err.message;
  });
  onlineSocket.on('game:state', (state) => {
    game.state = state;
    if (!document.body.classList.contains('online-in-game')) {
      document.body.classList.add('online-in-game');
      $('loginScreen').classList.remove('active');
      $('roomScreen').classList.remove('active');
      $('setupScreen').classList.remove('active');
      $('chatToggleBtn').style.display = '';
      document.querySelector('.top-actions [onclick="restart()"]')?.style.setProperty('display', 'none');
      renderSeats();
    }
    render();
  });
  onlineSocket.on('game:action-rejected', (action) => {
    console.warn('[online] akcija odbijena od servera:', action);
  });
  onlineSocket.on('game:error', (msg) => {
    console.error('[online] server greška:', msg);
  });
  onlineSocket.on('room:lock-changed', (p) => {
    $('roomStatus').textContent = p.locked ? '🔒 Soba je zaključana.' : '🔓 Soba je otključana.';
  });
  onlineSocket.on('kibic:incoming-request', (p) => {
    showKibicRequestBanner(p.spectatorUserId, p.name);
  });
  onlineSocket.on('chat:backlog', (msgs) => {
    $('chatLog').innerHTML = '';
    msgs.forEach(appendChatMessageOnline);
  });
  onlineSocket.on('chat:message', appendChatMessageOnline);
}

function backToSetup() {
  if (onlineSocket) { onlineSocket.disconnect(); onlineSocket = null; }
  document.body.classList.remove('online-in-game');
  mode = '1v2';
  mySeat = null;
  $('loginScreen').classList.remove('active');
  $('roomScreen').classList.remove('active');
  $('chatScreen').classList.remove('active');
  $('chatToggleBtn').style.display = 'none';
  $('kibicRequestPanel').style.display = 'none';
  $('setupScreen').classList.add('active');
}

// === ONLINE: sobe ===

function createRoomOnline() {
  onlineSocket.emit('room:create', {}, (res) => {
    if (res.error) { $('roomError').textContent = res.error; return; }
    mySeat = res.seat;
    $('roomCodeInput').value = res.code;
    $('roomStatus').innerHTML = `Kod sobe: <b style="font-size:1.3em">${res.code}</b> — podeli ga sa drugarima. Čeka se još igrača...`;
  });
}

function joinRoomOnline() {
  const code = $('roomCodeInput').value.trim().toUpperCase();
  if (!code) { $('roomError').textContent = 'Unesi kod sobe.'; return; }
  onlineSocket.emit('room:join', { code }, (res) => {
    if (res.error) { $('roomError').textContent = res.error; return; }
    mySeat = res.seat;
    $('roomStatus').textContent = `Pridružen sobi ${res.code}, čeka se početak...`;
  });
}

function joinAsSpectatorOnline() {
  const code = $('roomCodeInput').value.trim().toUpperCase();
  if (!code) { $('roomError').textContent = 'Unesi kod sobe.'; return; }
  onlineSocket.emit('room:join-as-spectator', { code }, (res) => {
    if (res.error) { $('roomError').textContent = res.error; return; }
    mySeat = null;
    $('roomStatus').textContent = `Kibiciraš sobu ${res.code}.`;
    $('kibicRequestPanel').style.display = '';
  });
}

function toggleLockOnline() {
  onlineSocket.emit('room:toggle-lock', {}, (res) => {
    if (res.error) $('roomError').textContent = res.error;
  });
}

// === ONLINE: kibic ===

function requestKibicOnline(seat) {
  onlineSocket.emit('kibic:request', { targetSeat: seat });
}

function showKibicRequestBanner(spectatorUserId, name) {
  // textContent svuda ispod (ne el()'s innerHTML) — `name` je korisnikov
  // email, nepouzdan unos koji se salje SVIM ostalim igracima u sobi preko
  // ovog banera; kroz innerHTML bi to bio pravi XSS (npr. neko se registruje
  // sa "<script>..." kao email).
  const banner = document.createElement('div');
  banner.className = 'kibic-request-banner';
  const span = document.createElement('span');
  span.textContent = `${name} traži kibic uvid u tvoje karte.`;
  banner.appendChild(span);
  const approve = document.createElement('button');
  approve.textContent = 'Odobri';
  approve.onclick = () => { onlineSocket.emit('kibic:respond', { spectatorUserId, approve: true }); banner.remove(); };
  const deny = document.createElement('button');
  deny.textContent = 'Odbij';
  deny.onclick = () => { onlineSocket.emit('kibic:respond', { spectatorUserId, approve: false }); banner.remove(); };
  banner.appendChild(approve);
  banner.appendChild(deny);
  $('kibicBanners').appendChild(banner);
}

// === ONLINE: chat ===

function toggleChat() {
  $('chatScreen').classList.toggle('active');
}

function sendChatOnline() {
  const input = $('chatInput');
  const text = input.value.trim();
  if (!text || !onlineSocket) return;
  onlineSocket.emit('chat:send', { text });
  input.value = '';
}

function appendChatMessageOnline(m) {
  // textContent (ne innerHTML) — m.text/m.name su tudji unos (chat poruka,
  // email drugog igraca), nikad ih ne tretirati kao HTML.
  const log = $('chatLog');
  const who = m.role === 'player' ? POS_LABELS[m.seat] : `${m.name} (kibicer)`;
  const div = document.createElement('div');
  div.textContent = `${who}: ${m.text}`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function setGameMode(m) {
  mode = m;
  $('mode3ai').classList.toggle('active', m === '3ai');
  $('mode1v2').classList.toggle('active', m === '1v2');
  // "Vi na sve 3" dugme je uklonjeno sa vidljivog setup ekrana (korisnikov
  // zahtev), ali mod ostaje dostupan preko konzole (setGameMode('3human'))
  // za testiranje — element vise ne postoji pa se ovo mora zastititi.
  $('mode3human')?.classList.toggle('active', m === '3human');
}

// Global exposure
window.startGame = startGame;
window.nextRound = nextRound;
window.resultAction = resultAction;
window.setGameMode = setGameMode;
window.userBid = userBid;
window.userSayIgra = userSayIgra;
window.toggleScore = toggleScore;
window.render = render; // korisno za dijagnostiku/testiranje preko konzole
window.restart = () => {
  if (mode === 'online') return; // nema smisla resetovati tudju online partiju
  discardSelected = new Set();
  game.newHand(0);
  render();
};
window.goOnline = goOnline;
window.doLogin = doLogin;
window.doRegister = doRegister;
window.backToSetup = backToSetup;
window.createRoomOnline = createRoomOnline;
window.joinRoomOnline = joinRoomOnline;
window.joinAsSpectatorOnline = joinAsSpectatorOnline;
window.toggleLockOnline = toggleLockOnline;
window.requestKibicOnline = requestKibicOnline;
window.toggleChat = toggleChat;
window.sendChatOnline = sendChatOnline;

// INIT
renderSeats();
$('setupScreen').classList.add('active');
