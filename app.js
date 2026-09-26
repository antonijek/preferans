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
  chooseDeclareGame as aiChooseDeclareGame,
  isIgraWorthy,
} from './engine/dist/ai.js';
import { searchChoosePlayCard, searchChooseAction, applyLegalAction } from './engine/dist/aiSearch.js';
import { sfx } from './sfx.js';

// Feature-flag za search-bazirani AI (Monte Carlo determinizacija, vidi
// plan "toasty-rolling-sparkle") — localStorage prekidac radi trenutnog
// vracanja na staru heuristiku bez redeploy-a ako se nesto pokvari, dok se
// faze postepeno uvode. Podrazumevano UKLJUCENO (Faza 1: samo igranje karte).
function searchAiEnabled() {
  try { return localStorage.getItem('prefSearchAI') !== '0'; } catch { return true; }
}
window.setSearchAiEnabled = (on) => { try { localStorage.setItem('prefSearchAI', on ? '1' : '0'); } catch {} };

// CSS klasa za dugmad izbora igre (posle odbacivanja talona/Igra tiebreak) —
// dosad su sva bila identicna siva .bid-btn, korisnikov utisak "ruzno,
// nerazlikuju se". Sans/Betl dobijaju sopstveni akcenat (nemaju boju
// karte); Pik/Herc/Karo/Tref ostaju NEUTRALNO dugme (korisnikov zahtev
// posle prve verzije — puna crna/crvena pozadina "nije lepa") sa oznakom
// boje karte kao OBOJENA ikonica unutar dugmeta (vidi gameOptionLabel).
const GAME_OPTION_ACCENT = {
  'Pik': 'opt-suit', 'Igra-Pik': 'opt-suit',
  'Tref': 'opt-suit', 'Igra-Tref': 'opt-suit',
  'Herc': 'opt-suit', 'Igra-Herc': 'opt-suit',
  'Karo': 'opt-suit', 'Igra-Karo': 'opt-suit',
  'Sans': 'opt-sans', 'Igra-Sans': 'opt-sans',
  'Betl': 'opt-betl', 'Igra-Betl': 'opt-betl',
};
function gameOptionAccentClass(g) {
  return GAME_OPTION_ACCENT[g] ?? '';
}
const SUIT_OPTION_ICON = {
  'Pik': ['♠', 'black'], 'Tref': ['♣', 'black'],
  'Herc': ['♥', 'red'], 'Karo': ['♦', 'red'],
};
// Labela dugmeta kao HTML (bezbedno — g je uvek iz fiksnog GAME enum-a, nikad
// korisnikov unos). Korisnikov zahtev (ponovljen 4x): dugme podeljeno na
// POLA — leva polovina ime na neutralnoj/zelenoj pozadini, desna polovina
// OBOJENA (crno za pik/tref, crveno za herc/karo) sa samim znakom boje.
function gameOptionLabel(g) {
  const base = g.replace('Igra-', '');
  const icon = SUIT_OPTION_ICON[base];
  if (!icon) return base;
  return `<span class="opt-half-name">${base}</span><span class="opt-half-suit ${icon[1]}">${icon[0]}</span>`;
}

// Debug: ?seed=NNNN u URL-u forsira deljenje na poznat seed umesto
// Date.now() — korisno za uzivo kalibraciju igranja karata (vidi
// engine/tools/reproduce-full-deal.mjs), gde treba da se unapred zna CEO
// razdel (sve 3 ruke + talon) da bi se moglo komentarisati "sta bi ko
// trebalo da baci" bez rucnog prepisivanja karata u chat.
function debugSeedOverride() {
  try {
    const v = new URLSearchParams(location.search).get('seed');
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

// Vidljiv natpis NA EKRANU (ne u konzoli — lakse za prevideti/filtrirati)
// koji pokazuje sve tri ruke + talon kad je ?seed= aktivan. Postavlja se
// JEDNOM po deljenju (poziva se iz startGame() posle newHand(0)) — ne
// azurira se posle toga (namerno: ostatak ruke se prati kroz stvarne
// poteze, ne kroz ponovno citanje ruku koje bi vec bile promenjene).
function renderSeedDebugBanner() {
  const seed = debugSeedOverride();
  let el = document.getElementById('seedDebugBanner');
  if (seed === null) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.id = 'seedDebugBanner';
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;' +
      'background:#ffeb3b;color:#000;font:12px monospace;padding:6px 10px;' +
      'white-space:pre-wrap;word-break:break-all;max-height:30vh;overflow:auto;' +
      'border-bottom:3px solid #f57f17;';
    document.body.appendChild(el);
  }
  const s = game.state;
  const fmt = (hand) => hand.map((c) => c.rank + c.suit).join(' ');
  el.textContent =
    `SEED DEBUG — seed=${seed}\n` +
    `Jug: ${fmt(s.players[0].hand)}\n` +
    `Istok: ${fmt(s.players[1].hand)}\n` +
    `Zapad: ${fmt(s.players[2].hand)}\n` +
    `Talon: ${fmt(s.talon)}`;
}

// Delegacija na SVAKI klik dugmeta u celom dokumentu — pokriva bidding,
// discard, follow/kontra, chat, sobe, admin panel i sve buduce dugmad, bez
// potrebe da se svaki onclick pojedinacno menja (korisnikov zahtev "svako
// dugme, na sve").
document.addEventListener('click', (e) => {
  if (e.target.closest && e.target.closest('button')) sfx.click();
}, true);

// Korisnikov zahtev: "kad u pretrazivacu odem na drugu stranicu nista ne
// prijavljuje kao da sam i dalje za stolom" — 🏠 dugme (peekHomeScreen)
// pokriva SVESTAN klik, ali ne i obicno napustanje/zatvaranje TABA u
// browseru (socket ostaje ziv u pozadini, pravi 'disconnect' se NE okida).
// BAG (uzivo prijavljen ODMAH posle prve verzije): 'visibilitychange' je
// POGRESAN signal ovde — okida se i na obicno PREBACIVANJE PROZORA/APLIKACIJE
// (drugi browser, druga app) dok preferans tab OSTAJE otvoren u pozadini,
// sto je korisnik EKSPLICITNO rekao da NE treba da broji ("samo ako je
// zatvorio sajt ili otisao na drugi, ne ako ga je spustio i gleda nesto
// drugo"). 'pagehide' se okida SAMO na stvarnu navigaciju/zatvaranje OVOG
// taba (ne na gubljenje fokusa prozora) — 'pageshow' je njegov par za
// povratak (npr. back-dugme, bfcache).
window.addEventListener('pagehide', () => {
  if (mode !== 'online' || !onlineSocket || mySeat === null || awayFromTable) return;
  onlineSocket.emit('room:setAway', {});
});
window.addEventListener('pageshow', () => {
  if (mode !== 'online' || !onlineSocket || mySeat === null || awayFromTable) return;
  onlineSocket.emit('room:setBack', {});
});

// Maksimalan broj refea zavisi od pocetne bule (korisnikov zahtev — "ne
// moze partija od 50 imati 5 refa, to je glupo"). RULES.md 7.2 vec navodi
// podrazumevanu razmeru "2 refea za partiju od 100 bula" — ovo samo
// generalizuje tu razmeru (1 refa na svakih ~50 bula), sa apsolutnim
// maksimumom 5 bez obzira koliko je bula veca.
function maxRefeForBula(bula) {
  return Math.max(1, Math.min(5, Math.round(bula / 50)));
}
function clampRefeInputToBula(bulaInputId, refeInputId) {
  const bulaEl = $(bulaInputId);
  const refeEl = $(refeInputId);
  if (!bulaEl || !refeEl) return;
  const bula = parseInt(bulaEl.value, 10) || 0;
  const max = maxRefeForBula(bula);
  refeEl.max = String(max);
  if (parseInt(refeEl.value, 10) > max) refeEl.value = String(max);
}
window.clampRefeInputToBula = clampRefeInputToBula;

function toggleSound() {
  const muted = sfx.toggleMuted();
  const btn = $('soundToggleBtn');
  if (btn) btn.textContent = muted ? '🔇' : '🔊';
}
window.toggleSound = toggleSound;
{
  const btn = document.getElementById('soundToggleBtn');
  if (btn && sfx.isMuted()) btn.textContent = '🔇';
}

const POS_LABELS_LOCAL = ['Jug', 'Istok', 'Zapad'];
// POS_LABELS[pos] je korisceno na 30+ mesta kroz ceo fajl (banner ugovora,
// rezultat ruke, tabela, poslednji stih, chat...) — umesto da se svako od
// njih posebno menja za online mod (uzivo prijavljen bag: "i dalje posle
// ruke pise Zapad je igrao Sans", jedno od mesta koje je promaklo pri prvom
// prolazu), POS_LABELS je sad Proxy koji ZA SVE njih odjednom vraca PRAVO
// registrovano ime kad je mode==='online', inace nepromenjen raspored kao
// pre. Uvek vraca vec escape-ovan string (mode==='online' ime je tudji
// unos — korisnikov email — a desetine mesta ga ubacuju u innerHTML bez
// sopstvenog escapovanja; sigurnije da PRIVREMENA VREDNOST sama bude
// bezbedna nego oslanjati se da svako mesto to zapamti).
// Korisnikov zahtev (2026-09-18): rejting SVUDA pored imena je zauzimao
// previse mesta na ekranu, pogotovu na telefonu — uklonjen odavde (sad
// samo "Ime", ne "Ime (1000)"). Rejting i dalje prikazan, ali SAMO u
// tabeli (vidi renderScoreContent, koji cita game.state.players[].rating
// direktno, ne preko ovog Proxy-ja).
const POS_LABELS = new Proxy(POS_LABELS_LOCAL, {
  get(target, prop) {
    const idx = typeof prop === 'string' ? Number(prop) : NaN;
    if (Number.isInteger(idx) && idx >= 0 && idx <= 2) {
      const raw = mode === 'online' ? (game.state?.players?.[idx]?.name || target[idx]) : target[idx];
      const isAbandoned = mode === 'online' && game.state?.abandonedSeat === idx;
      return escapeHtml(raw) + (isAbandoned ? ' (AI)' : '');
    }
    return target[prop];
  },
});
// PWA: registruje service worker (sw.js) za instalaciju + offline rad
// lokalnih (3ai/1v2/3human) modova. Online mod i dalje zahteva mrezu (sw.js
// namerno propusta /api/ i /socket.io/ direktno na mrezu, ne kesira ih).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Korisnikov zahtev (2026-09-20): preporuci instalaciju app-a mobilnim
// korisnicima na pocetnom ekranu — Android/Chrome hvata beforeinstallprompt
// i nudi pravo dugme "Instaliraj"; iOS Safari nema taj event uopste, pa
// tamo umesto dugmeta stoji uputstvo (Deli → Dodaj na Home Screen). Ne
// koristi $() (definisan kasnije u fajlu) — koristi document.getElementById
// direktno da ne zavisi od redosleda deklaracija.
let deferredPwaInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPwaInstallPrompt = e;
  maybeShowPwaInstallBanner();
});
window.addEventListener('appinstalled', () => {
  deferredPwaInstallPrompt = null;
  const banner = document.getElementById('pwaInstallBanner');
  if (banner) banner.style.display = 'none';
});
function maybeShowPwaInstallBanner() {
  const banner = document.getElementById('pwaInstallBanner');
  if (!banner) return;
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (!isMobile || isStandalone) return;
  if (localStorage.getItem('pwaInstallDismissed') === '1') return;
  banner.style.display = '';
  const installBtn = document.getElementById('pwaInstallBtn');
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (deferredPwaInstallPrompt) {
    installBtn.style.display = '';
    installBtn.onclick = async () => {
      deferredPwaInstallPrompt.prompt();
      await deferredPwaInstallPrompt.userChoice.catch(() => {});
      deferredPwaInstallPrompt = null;
      banner.style.display = 'none';
    };
  } else if (isIOS) {
    const txt = document.getElementById('pwaInstallText');
    if (txt) txt.textContent = '📲 Igraš na iPhone-u? Dodaj Preferans na Home Screen: dodirni Deli (kvadratić sa strelicom nagore) pa "Dodaj na Home Screen".';
  }
}
window.addEventListener('load', () => {
  maybeShowPwaInstallBanner();
  const dismissBtn = document.getElementById('pwaInstallDismiss');
  if (dismissBtn) {
    dismissBtn.onclick = () => {
      localStorage.setItem('pwaInstallDismissed', '1');
      document.getElementById('pwaInstallBanner').style.display = 'none';
    };
  }
  // "Sajt je jos u izradi" najava (korisnikov zahtev 2026-09-20) —
  // dismissible, ne dosadjuje posle prvog citanja.
  // Korisnikov zahtev (2026-09-26): "Nemoj jos stavljati poruku dobrodosli" —
  // ne prikazuj banner za sada (ostaje spreman, samo iskljucen dok se ne
  // zatrazi da se vrati).
  const noticeBanner = document.getElementById('siteNoticeBanner');
  const noticeDismiss = document.getElementById('siteNoticeDismiss');
  // if (noticeBanner && localStorage.getItem('siteNoticeDismissed') !== '1') {
  //   noticeBanner.style.display = '';
  // }
  void noticeBanner;
  if (noticeDismiss) {
    noticeDismiss.onclick = () => {
      localStorage.setItem('siteNoticeDismissed', '1');
      document.getElementById('siteNoticeBanner').style.display = 'none';
    };
  }
});

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
    const result = _originalNewHand(...args);
    renderSeedDebugBanner();
    return result;
  };
  window.game = g;
  return g;
}

// Dijagnostika za "stuck, ne mogu da bacim kartu" bag (korisnikov zahtev
// 2026-09-20, "osmisli drugo resenje ili otkrij problem" umesto samo
// nagadjanja) — beleze se poslednjih 60 dogadjaja (game:state prijemi i
// socket connect/disconnect/reconnect ciklus) u memoriji, dostupno preko
// window.__prefDebug u konzoli (F12) kad se bag SLEDECI PUT desi. Namerno
// NE salje se nigde automatski — cisto lokalni trag za rucnu proveru.
window.__prefDebug = [];
function debugLog(event, data) {
  window.__prefDebug.push({ t: new Date().toISOString(), event, ...data });
  if (window.__prefDebug.length > 60) window.__prefDebug.shift();
  console.log('[prefDebug]', event, data);
}

let handGeneration = 0;
let game = createGame({ seed: debugSeedOverride() ?? (Date.now() & 0xffff) });
let mode = '1v2';

// === ONLINE MOD ===
// mySeat: koje sedište (0/1/2) KONTROLIŠE ovaj klijent — dodeljuje ga server
// pri room:create/room:join, ostaje null dok se ne pridruzimo sobi.
let mySeat = null;
// Korisnikov zahtev: "nema mogucnost da neko izadje na home page pa se
// vrati" — SVESNI izlazak na pocetnu dok se sediste i dalje drzi (razlika
// od "napusti partiju", koje predaje AI-ju). Dok je true, dolazni
// game:state NE forsira nazad na sto (vidi 'online-in-game' provera).
let awayFromTable = false;
// Koju sobu JA trenutno drzim (server je poslednji izvor istine preko
// room:info/game:state, ovo je samo za "Pridruzi se" dugme u listi otvorenih
// soba — korisnikov zahtev: ne nudi ponovno pridruzivanje sopstvenoj sobi).
let myRoomCode = null;
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
let lastRecordedRound = null;
let lastRefeSum = 0;
let lastRefePendingSum = 0;

// BAG (uzivo prijavljen 2026-09-08/09): tabela je prikazivala "duh" red iz
// PRETHODNE partije (npr. "Krug 2" na tabli iako je odigrana samo 1 ruka).
// Uzrok: handHistory je modul-nivo niz koji je zivot vezan za CEO zivotni
// vek stranice (tab), a ne za pojedinacnu sobu/partiju — kod restart-a
// servera ili ulaska u NOVU sobu bez reload-a stranice, stari zapisi iz
// prethodne partije ostajali su zauvek u nizu. Server-side dijagnostika
// (TABELA DEBUG log) je potvrdila: server je poslao GAME_OVER SAMO za
// krug=1, a "krug 2" red u tabeli nije nikad postojao server-side u toj
// sesiji — cisto stara klijentska memorija. Zovi ovo pri svakom SVESNOM
// ulasku u sobu (create/join/spectate), ne pri automatskom reconnect-u na
// ISTU sobu (taj put ne prolazi kroz ove funkcije).
// Pretvara server-ov HandSnapshot (room.handsHistory, roomBroadcast.ts) u
// oblik koji renderScoreContent()/renderResult() ocekuju (isti kao stavke
// koje recordHandIfNew() inace pravi iz live game.state-a).
function computeFollowSeatsFromSnapshot(h) {
  if (h.declarer == null || !h.declaredGame) return [];
  const followers = [0, 1, 2].filter(p => p !== h.declarer);
  if (isBetlGame(h.declaredGame)) return followers;
  if (followers.some(p => h.followChoices[p] === null)) return [];
  return followers.filter(p => h.followChoices[p] === 'DODJEM');
}
function handSnapshotToLocal(h) {
  return {
    round: h.round,
    winner: h.declarer,
    winnerGame: h.declaredGame,
    kontraLevel: h.kontraLevel,
    passed: h.passed,
    bulas: h.bulasAfter,
    supeDelta: h.supeDelta,
    // Snapshot ne beleži da li je ruka odigrana kroz "Igra" tok (RULES 3.4)
    // — bezopasan default, samo izostavlja "(Igra)" oznaku pored igre.
    viaIgra: false,
    followSeats: computeFollowSeatsFromSnapshot(h),
    tricksWon: h.tricksWon,
    caller: h.caller, callee: h.callee,
    wasPlayed: h.tricks.length > 0,
  };
}

// Uzivo prijavljen bag (2026-09-20): "kad udjem na tabelu nema istorije
// ruku, sve prazno" — handHistory je cisto klijentski akumuliran, gubi se
// na svaki reconnect (tab zatvoren pa ponovo otvoren, i sl.) iako server
// (room.handsHistory) sve vreme ima kompletne podatke. Kad god stigne
// game:state sa vise server-side ruka nego sto lokalno imamo, obnovi CEO
// handHistory+debtMatrix iz servera umesto da ostane nepotpun/prazan.
function syncHandHistoryFromServer(serverHandsHistory) {
  if (!Array.isArray(serverHandsHistory) || serverHandsHistory.length <= handHistory.length) return;
  handHistory = serverHandsHistory.map(handSnapshotToLocal);
  debtMatrix = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const h of handHistory) {
    if (h.winner === null) continue;
    for (let p = 0; p < 3; p++) {
      if (p !== h.winner && h.supeDelta[p] > 0) debtMatrix[h.winner][p] += h.supeDelta[p];
    }
  }
  lastRecordedRound = handHistory[handHistory.length - 1].round;
}

function resetHandHistoryForNewRoom() {
  handHistory = [];
  debtMatrix = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  lastRecordedRound = null;
  lastRefeSum = 0;
  lastRefePendingSum = 0;
  lastMatchRankingResult = null;
  endMatchProposerSeat = null;
}

// Kumulativni neto odnos izmedju DVA igraca: pozitivno = "other" duguje
// "me"-u, negativno = "me" duguje "other"-u (korisnikov format: "20" = meni
// duguje 20, "-30" = ja dugujem 30).
function netSupeBetween(me, other) {
  return debtMatrix[other][me] - debtMatrix[me][other];
}

// RULES 5.1 konvencija — DRUGI put uzivo prijavljen bag (2026-09-21):
// prva verzija ovoga je imala levo/desno OBRNUTO. Geometrijski izvedeno
// (busola/uglovi, ne nagadjanje) i potvrdjeno konkretnim uzivo primerom
// (nosilac Mozila, desni sused Edge, sto odgovara nextPlayer(Mozila)):
// DESNI sused = nextPlayer (p+1) — sledeci u smeru suprotnom od kazaljke
// na satu JE fizicki desno; levi = (p+2), suprotan smer istog koraka.
function leftNeighborOf(p) { return (p + 2) % 3; }
function rightNeighborOf(p) { return (p + 1) % 3; }

// Koja SEDISTA se racunaju kao "stvarno pratili" ovu ruku, za tabelu —
// korisnikov zahtev: "jedan ako ide sam ili zove, a oba ako dodju posebno".
// Betl je poseban slucaj (RULES — oba pratioca UVEK prate, nema Dodjem/Ne
// dodjem izbora), i "niko ne prati" vraca praznu listu.
function computeFollowSeats(s) {
  if (s.winner === null || s.declaredGame === null) return [];
  const followers = [0, 1, 2].filter(p => p !== s.winner);
  if (isBetlGame(s.declaredGame)) return followers;
  if (followers.some(p => s.followChoices[p] === null)) return [];
  const dodjem = followers.filter(p => s.followChoices[p] === 'DODJEM');
  return dodjem;
}

function recordHandIfNew() {
  const result = game.state.lastHandResult;
  // BAG (uzivo prijavljeno: "tabela duplira, 2x Sans, 5x Herc"): poredjenje
  // po REFERENCI objekta (result === lastRecordedRound) radi samo u
  // lokalnom modu gde je game.state isti mutirani objekat kroz ceo render.
  // Online mod RADI game.state = state na SVAKI game:state broadcast (nov
  // objekat iz JSON-a, cak i kad se nista stvarno ne promeni — npr. neko
  // pise u chat dok je rezultat prikazan) — referenca je skoro UVEK nova pa
  // se ista zavrsena ruka upisivala ponovo na SVAKI takav re-broadcast.
  // round je stabilan primitivan broj, poredi se po VREDNOSTI.
  //
  // BAG #2 (uzivo prijavljeno VISE PUTA, dugo neuhvacen: "prazna Pratnja i
  // 0 stihova na ruci gde je stvarno bilo pratilaca"): engine-ov newHand()
  // (game.ts) resetuje followChoices/caller/callee/tricksWon za NOVU rundu,
  // ali NIKAD ne cisti lastHandResult — ono ostaje "zivo" (staro, od
  // PRETHODNE zavrsene ruke) kroz CELU sledecu rundu (BIDDING itd.), sve dok
  // se sledeca ruka i sama ne zavrsi. Cim server pozove dealNextHand()
  // (round++, newHand()) i broadcast-uje FRESH stanje (phase=BIDDING,
  // followChoices/tricksWon prazni), stari kod je OVDE video: result=istinit
  // (stari lastHandResult) I round!==lastRecordedRound (round se upravo
  // povecao) → upisivao je "duh" red sa TACNIM pobednikom/igrom/bulama (iz
  // starog lastHandResult) ali PRAZNOM Pratnjom/0 stihova (iz svezeg,
  // resetovanog state-a) — pod NOVIM (round+1) brojem kruga. Prava sledeca
  // ruka je onda, kad se STVARNO zavrsi, imala ISTI round broj vec
  // "potrosen" u lastRecordedRound, pa se NIKAD nije upisala. Ispravka:
  // ruka se sme upisati SAMO dok je state stvarno u terminalnoj fazi — inace
  // je lastHandResult po definiciji zaostao trag prethodne runde.
  const isTerminalPhase = game.state.phase === 'GAME_OVER' || game.state.phase === 'MATCH_OVER';
  if (!result || !isTerminalPhase || game.state.round === lastRecordedRound) return;
  lastRecordedRound = game.state.round;
  const tricksWonArr = [game.state.players[0].tricksWon, game.state.players[1].tricksWon, game.state.players[2].tricksWon];
  // Uzivo prijavljen bag (2026-09-21): "Antonije 5, Edge 1, Mozila 6 = 11
  // stihova" na zavrsenoj ruci — matematicki nemoguce (zbir NIKAD ne sme
  // preci trickCount, svaki stih ide najvise jednom igracu). Server-side
  // podaci za taj konkretan meč su pri direktnoj proveri bili INTERNO
  // ISPRAVNI (zbir=10), sto znaci da je korisnik verovatno video TRANZITORAN
  // klijentski prikaz, ne trajno pokvareno stanje — pravi uzrok jos nije
  // nadjen. Loguj pun snapshot ovde da sledeci put imamo STVARNE podatke
  // (window.__prefDebug) umesto da se oslanjamo na screenshot/pamcenje.
  const tricksSum = tricksWonArr.reduce((a, b) => a + b, 0);
  if (tricksSum > game.state.trickCount) {
    const diag = { round: game.state.round, tricksWonArr, tricksSum, trickCount: game.state.trickCount, resultWinner: result.winner, resultPassed: result.passed };
    console.error('[BAG] tricksWon zbir > trickCount!', diag);
    debugLog('tricksWon-sum-bug', diag);
  }
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
    // Korisnikov zahtev: tabela nije prikazivala ni ko je dosao/zvao ni
    // koliko je ko stihova uhvatio — MORA se snimiti OVDE (game.state jos
    // ima followChoices/tricksWon od bas zavrsene ruke, newHand() ih resetuje
    // cim krene sledeca, a istorija se renderuje mnogo kasnije).
    followSeats: computeFollowSeats(game.state),
    tricksWon: tricksWonArr,
    // Korisnikov zahtev (potvrdjeno u engine kodu — game.ts endHand() racuna
    // "combinedTricks = caller.tricksWon + callee.tricksWon" za SUPU kad
    // nosilac padne): kad je neko POZVAN, njegovi stihovi idu ZAJEDNO sa
    // zvaocem, ne prikazuju se odvojeno/izostavljeno. caller/callee ovde da
    // render zna da sabere umesto da prikaze samo zvaocev pojedinacni broj.
    caller: game.state.caller, callee: game.state.callee,
    // Korisnikov zahtev: tabela je pokazivala "prošao (0)" za "niko ne
    // prati" ruke, sto izgleda kao bag. NIJE — engine (handleNoOneFollows,
    // RULES 5.4) racuna bule/supe direktno preko formule za ove "neodigrane"
    // ruke i NIKAD ne inkrementira tricksWon (nema stvarnog playCard() toka
    // da bi se brojalo), iako komentar u engine kodu kaze "nosilac automatski
    // dobija 10 stihova" — to je namera pravila, ne stvarno upisana vrednost.
    // wasPlayed razlikuje ova dva slucaja za prikaz (vidi renderScoreContent).
    wasPlayed: game.state.tricks.length > 0,
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
    // Korisnikov zahtev (2026-09-10): "ne treba da stoji, treba samo Refe" —
    // kratko, bez objasnjenja teksta (isti pravac kao ranije uklonjeni
    // "(Betl — svi automatski prate)" parenthetical).
    showToast('🤝 Refe');
  }
  lastRefePendingSum = pendingSum;
  // Potrošnja (🔁 iskorišćeno) — nosilac neke ruke trosi svoju
  const sum = game.state.refeCount[0] + game.state.refeCount[1] + game.state.refeCount[2];
  if (sum > lastRefeSum) {
    showToast(`🔁 ${POS_LABELS[game.state.lastHandResult?.refeConsumed ?? 0]} koristi refu — bule/supe ×2`);
  }
  lastRefeSum = sum;
}

// Zvuk za deljenje/bacanje/talon prati promene STANJA (faza/currentTrick
// duzina/talon vidljivost) umesto da se kaci na svaki pojedinacni poziv koji
// bi mogao da ih izazove (userPlayCard, aiPlayTurn, socket:room-state za
// online...) — jedno mesto istine, radi identicno u sva tri moda (lokalni,
// AI, online) jer render() se zove posle SVAKE promene stanja bilo gde.
// NAPOMENA: state.round se NIKAD ne menja posle initState() (uvek 1) pa nije
// upotrebljivo kao signal. Prelazak U 'BIDDING' iz BILO koje druge faze
// hvata VECINU novih deljenja (newHand() je jedino mesto koje postavlja
// fazu na BIDDING) — ALI kad SVI kazu "dalje" bez ijedne licitacije (RULES
// 7.1 slucaj 1, handleRefe()), faza NIKAD ne napusta 'BIDDING' (ostaje
// BIDDING kroz sva 3 "dalje" I kroz redeal), pa taj prelaz ne hvata nista —
// korisnikov uzivo prijavljen bag ("ne cuje se zvuk deljenja za novu
// rundu"). Drugi signal (s.bids se resetuje na [] pri SVAKOM newHand())
// hvata bas taj slucaj — kombinacija oba pokriva sve puteve ka novoj ruci.
let soundSnapshot = { phase: null, trickLen: 0, talonVisible: false, bidsLen: 0 };
function updateSoundEffects() {
  const s = game.state;
  const trickLen = s.currentTrick.length;
  const talonVisible = !!$('talonCenter') && $('talonCenter').style.display !== 'none';
  const enteredBidding = s.phase === 'BIDDING' && soundSnapshot.phase !== 'BIDDING';
  const bidsCleared = s.bids.length === 0 && soundSnapshot.bidsLen > 0;
  // Korisnikov zahtev (2026-09-10): "kad zavrsi ruka nema nikakav zvuk" —
  // sfx.win() je vec postojao (definisan gore) ali NIKAD nije bio pozvan
  // odavde. Isti tranzicija-detekcija obrazac kao enteredBidding.
  const enteredTerminal = (s.phase === 'GAME_OVER' || s.phase === 'MATCH_OVER' || s.phase === 'REFE')
    && !TERMINAL_PHASES.includes(soundSnapshot.phase);

  if (enteredTerminal) {
    sfx.win();
  } else if (enteredBidding || bidsCleared) {
    sfx.deal();
  } else if (trickLen > soundSnapshot.trickLen) {
    sfx.cardPlay();
  }
  if (talonVisible && !soundSnapshot.talonVisible) {
    sfx.talon();
  }
  soundSnapshot = { phase: s.phase, trickLen, talonVisible, bidsLen: s.bids.length };
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
// Online mod: sediste se ROTIRA tako da SVAKO uvek vidi SEBE na jugu (dole),
// ne fiksno po Position-u — korisnikov zahtev, uzivo prijavljeno: "svako
// treba da sebe vidi kao dolje u sredini, a ne sa strana". Lokalni modovi
// (1v2/3ai imaju fiksno "vas" na P0; 3human je hot-seat bez jedinstvenog
// "ja") zadrzavaju staru fiksnu mapu (SEAT_OF direktno).
const SEAT_ROTATION_ORDER = ['south', 'east', 'west'];
function seatOf(pos) {
  if (mode === 'online' && mySeat !== null) {
    return SEAT_ROTATION_ORDER[(pos - mySeat + 3) % 3];
  }
  return SEAT_OF[pos];
}
const SEAT_PLAYER_NAME = ['Vi (Jug)', 'Istok', 'Zapad'];
const SEAT_PLAYER_CLASS = ['p0', 'p1', 'p2'];

// U online modu server salje PRAVO ime registrovanog igraca po sedistu
// (game.state.players[pos].name) umesto generickog Jug/Istok/Zapad — bez
// ovoga bi svi videli iste tri fiksne "pozicione" oznake i ne bi znali KOJI
// od njihovih drugara sedi gde (uzivo prijavljena zabuna: "ne znam ko je na
// potezu"). U lokalnim modovima (nema pravih ljudi da se pobrka) ostaje
// nepromenjeno ponasanje.
function seatDisplayName(pos) {
  // POS_LABELS[pos] (Proxy) vec resava pravo-ime-ili-fallback + escape za
  // online mod — SEAT_PLAYER_NAME ostaje SAMO za lokalni "Vi (Jug)" oblik
  // koji POS_LABELS namerno nema (koristi se za stalnu oznaku sedista).
  if (mode === 'online') return POS_LABELS[pos];
  return SEAT_PLAYER_NAME[pos];
}

// Online seatDisplayName() vraca korisnikov registrovani email — nepouzdan
// unos. Svaki string koji se sa njim gradi pa ubacuje u innerHTML (el()
// helper, bid log) MORA proci kroz ovo, inace je otvoren XSS (neko se
// registruje sa "<img src=x onerror=...>" kao email).
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// === RENDER: STO & SEDENJA ===

// Korisnikov zahtev: "cim korisnik ispadne sa mreze... mora odmah da se
// makne sa stola, da ne pise njegovo ime". Ovo je ODVOJENO od abandonedSeat
// (koje se postavlja SAMO na eksplicitno "napusti partiju" — genuine
// disconnect NAMERNO ne postaje abandonedSeat, M6 reconnect ceka
// neograniceno) — cisto vizuelni, per-viewer signal iz room:playerDisconnected/
// room:playerReconnected, ne menja server-side stanje.
let disconnectedSeats = new Set();

function renderSeats() {
  // Postavi (ili osvezi, u online modu se imena saznaju tek posle
  // pridruzivanja/svakog novog stanja) imena sedista
  for (const pos of [0, 1, 2]) {
    // Kratko — .player-name kutija je uska (104px) i uppercase+bold, duzi
    // tekst ("nema veze") se sece "...".
    $(`name-${seatOf(pos)}`).textContent = disconnectedSeats.has(pos) ? 'nije tu' : seatDisplayName(pos);
    $(`seat-${seatOf(pos)}`).classList.toggle('disconnected', disconnectedSeats.has(pos));
  }
  // Bug nadjen 2026-09-18 (korisnikov zahtev: "u boksu sa imenima pise bule
  // svi po 100, a tabela kaze 100 60,70"): ovde je ranije stajao NEDOVRSEN
  // pokusaj da se ispisu i bule (citao player.bulas/player.bula, polja koja
  // NE POSTOJE — prava vrednost je game.state.bulas[pos], ne player.bulas),
  // pa je UVEK padao na fallback 100. renderSeats() se poziva SAMOSTALNO
  // (bez render()) iz room:playerDisconnected/room:playerReconnected —
  // svaki put kad neko ispadne/vrati se sa mreze, ovo je PREPISIVALO
  // ispravnu vrednost koju je renderState() vec postavila, sa laznim 100.
  // renderState() je vec jedini ispravan izvor za bule (poziva se na svaki
  // pravi render() ciklus) — ovde nema sta da se dira.
}

// Ko TRENUTNO treba da odluci Dodjem/Ne dodjem, pa Zovi/Igraj sam (RULES 5.3)
// — deljeno izmedju renderState() (zuti okvir na sedistu) i activeHandOwner()
// (koja se ruka prikazuje u '3human' hot-seat modu). Bag: renderState() je
// ranije ovde imao samo default (s.currentPlayer, zaostalo iz PLAYING faze
// prethodnog stiha) pa je zuti okvir tokom FOLLOW_DECLARING znao da ostane
// na pogresnom igracu (uzivo prijavljeno: prikazuje "Dodjem/Ne dodjem" kod
// jednog igraca, a okvir je na drugom).
function expectedFollowActor(s) {
  // Uzivo prijavljen bag (2026-09-21, RULES 5.1: "igrač sa desne strane
  // nosioca se izjašnjava prvi"): [0,1,2].filter(...) je vracalo pratioce
  // u prirodnom (rastucem) redosledu pozicija, ne "desni pa treci" —
  // pogresno za nosioca na poziciji 0 ili 2 (samo za poziciju 1 se slucajno
  // poklapalo). Sad koristi isti "desni pa treci" kao engine-ov
  // expectedFollowPlayerPublic() (online) / followersInKontraOrder (kontra).
  // DRUGI put uzivo prijavljen bag (2026-09-21) — prva verzija ovoga je
  // imala formulu obrnutu (desni = winner+2, trebalo winner+1). Vidi
  // rightNeighborOf()/leftNeighborOf() iznad za istu ispravku i geometrijsko
  // objasnjenje.
  if (s.winner === null) return s.winner;
  const right = (s.winner + 1) % 3;
  const third = (s.winner + 2) % 3;
  const followers = [right, third];
  const undecided = followers.find(p => s.followChoices[p] === null);
  if (undecided !== undefined) return undecided;
  if (s.caller === null) {
    const callerCandidate = followers.find(p => s.followChoices[p] === 'DODJEM');
    if (callerCandidate !== undefined) return callerCandidate;
  }
  return s.winner;
}

function renderState() {
  const s = game.state;
  // Aktivan igrač highlight — currentBidder tokom BIDDING, winner tokom DISCARD/DECLARE, currentPlayer tokom igranja
  let activePos = s.currentPlayer;
  if (s.phase === 'BIDDING') activePos = s.currentBidder;
  else if (s.phase === 'DISCARDING' || s.phase === 'DECLARING') activePos = s.winner;
  else if (s.phase === 'FOLLOW_DECLARING') activePos = expectedFollowActor(s);
  else if (s.phase === 'KONTRA_DECLARING') activePos = game.expectedKontraPlayerPublic();
  for (let pos = 0; pos < 3; pos++) {
    const seat = seatOf(pos);
    const el = $(`seat-${seat}`);
    el.classList.toggle('active', activePos === pos);
    $(`dealer-${seat}`).style.display = s.dealer === pos ? 'flex' : 'none';
  }

  // Bule
  $('buleInfo').textContent = `${s.bulas[0]} / ${s.bulas[1]} / ${s.bulas[2]}`;
  $('trickInfo').textContent = `${s.trickCount}/10`;

  // Pojedinačne bule na sedenja
  $(`bule-${seatOf(0)}`).textContent = s.bulas[0];
  $(`bule-${seatOf(1)}`).textContent = s.bulas[1];
  $(`bule-${seatOf(2)}`).textContent = s.bulas[2];
  $(`tricks-${seatOf(0)}`).textContent = s.players[0].tricksWon;
  $(`tricks-${seatOf(1)}`).textContent = s.players[1].tricksWon;
  $(`tricks-${seatOf(2)}`).textContent = s.players[2].tricksWon;
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
function defenseSummaryText(s, final = false) {
  if (s.winner === null || s.declaredGame === null) return null;
  const followers = [0, 1, 2].filter(p => p !== s.winner);
  if (followers.some(p => s.followChoices[p] === null)) return null;
  // Korisnikov zahtev (2026-09-21): "isto i za nosioca" — prosao/pao status
  // sada i za pratioce, ne samo u tabeli vec i OVDE u modalu posle ruke.
  // final=true samo kad je ruka STVARNO zavrsena (rezultat modal) — tokom
  // zive igre bi prosao/pao bio zavaravajuc jer se stihovi jos menjaju.
  const dodjemFollowers = followers.filter(p => s.followChoices[p] === 'DODJEM');
  // trickCount===0 = ruka se NIKAD stvarno nije odigrala (RULES 5.4 "niko ne
  // prati" / RULES 7.1.1 "Pik bez kontre" bez refe-budzeta) — u tim
  // slucajevima pratioci NEMAJU nikakvu promenu bule (handleUnplayedHand()
  // uvek supeDelta=[0,0,0] za sve osim nosioca), pa bi prosao/pao status
  // ovde bio pogresan (formula ispod bi ih pogresno prikazala kao "pali" jer
  // je tricksWon=0, iako se to uopste ne racuna kad se ne igra).
  const showStatus = final && s.lastHandResult && dodjemFollowers.length > 0 && s.trickCount > 0;
  // Korisnikov zahtev: "nije jedno ispod drugog" (bilo spojeno u red preko
  // dva razmaka) + ukloniti objasnjenje pravila (Betl parentetika) — vec
  // trazeno ranije, jos nije bilo uklonjeno ovde (samo na drugom mestu).
  const parts = followers.map(p => {
    const base = `${POS_LABELS[p]}: ${s.followChoices[p] === 'DODJEM' ? 'Dođem' : 'Ne dođem'}`;
    if (!showStatus || s.followChoices[p] !== 'DODJEM') return base;
    const tricksWon = [0, 1, 2].map(i => s.players[i].tricksWon);
    const fp = followerPassed({
      declaredGame: s.declaredGame, kontraLevel: s.kontraLevel, declarerPassed: s.lastHandResult.passed,
      caller: s.caller, callee: s.callee, tricksWon,
    }, p);
    return `${base} (${tricksWon[p]})${followerStatusBadge(fp)}`;
  });
  let extra = '';
  if (s.caller !== null && s.callee !== null) {
    extra = `<strong>${POS_LABELS[s.caller]} zove ${POS_LABELS[s.callee]}</strong>`;
  } else {
    const neDodjemCount = followers.filter(p => s.followChoices[p] === 'NE_DODJEM').length;
    if (neDodjemCount === 1) {
      const solo = followers.find(p => s.followChoices[p] === 'DODJEM');
      // Bug nadjen 2026-09-18 (korisnikov zahtev: "sa leve strane vec pise
      // igra sam, pa se promeni ako pozove"): continueWithoutCall() NIKAD
      // ne postavlja s.caller (isto stanje null kao "jos nije odlucio") —
      // jedini pouzdan signal da je odluka VEC pala (zovi vs. sam) je da je
      // faza vec presla FOLLOW_DECLARING (proceedAfterFollow() menja fazu).
      // Dok je jos u FOLLOW_DECLARING, "igra sam" je prevremeno nagadjanje.
      extra = s.phase === 'FOLLOW_DECLARING'
        ? `<em>${POS_LABELS[solo]} bira: zove ili igra sam...</em>`
        : `<strong>${POS_LABELS[solo]} igra sam</strong>`;
    } else if (neDodjemCount === followers.length) {
      extra = `<strong>niko ne prati</strong>`;
    }
  }
  return [...parts, extra].filter(Boolean).join('<br>');
}

function isBetlGame(g) {
  return g === 'Betl' || g === 'Igra-Betl';
}

// Korisnikov zahtev (2026-09-21): tabela/modal su prikazivali stihove
// pratilaca ali ne i da li je TAJ pratilac (pojedinacno) prosao ili pao —
// samo nosilac je imao taj status. Ista prioritetna logika kao
// scoring.ts:calculateBulaDistribution (kontra > poziv > nezavisni prag),
// da bi se prikaz tacno poklapao sa STVARNOM promenom bule:
// - kontra data (RULES 6.3/9.3.2): ceo tim odbrane deli ishod "opklade" —
//   nosilac pao = odbrana prosla, nosilac prosao = odbrana pala.
// - poziv bez kontre (RULES 5.3): pozivalac+pozvani ZAJEDNO trebaju >=4.
// - nezavisan pratilac (RULES 5.2): samostalno treba >=2.
// Betl/Igra-Betl (RULES 9.4.1) pratiocima nikad ne menja bulu — vraca null
// (status se ne prikazuje, pojam se ne primenjuje).
function followerPassed({ declaredGame, kontraLevel, declarerPassed, caller, callee, tricksWon }, p) {
  if (isBetlGame(declaredGame)) return null;
  if (kontraLevel) return !declarerPassed;
  if (caller !== null && (p === caller || p === callee)) {
    const combined = (tricksWon[caller] ?? 0) + (callee !== null ? (tricksWon[callee] ?? 0) : 0);
    return combined >= 4;
  }
  return (tricksWon[p] ?? 0) >= 2;
}

function followerStatusBadge(passed) {
  if (passed === null) return '';
  return passed
    ? ` <span style="color:#a5d6a7">✓</span>`
    : ` <span style="color:#ff8a80">✗</span>`;
}

// === SUPE / REFE po sedistu ===

function renderSeatExtras() {
  const s = game.state;
  for (let p = 0; p < 3; p++) {
    const seat = seatOf(p);

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

// Deterministicki hash string->int — koristi se za rotaciju i pomeraj karte
// (razliciti "salt" sufiks daje NEKORELISANE vrednosti za razlicite ose, da
// se karta ne pomera uvek u istom pravcu u kom se i vise okrece).
function hashString(s) {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

// Korisnikov zahtev (2026-09-21): "ne padaju uvijek na isto mjesto, isto
// okrenute... zelim da se vise ali da su prirodnije" — prosirena rotacija
// (bila -7..7, sad -16..16) I nov pomeraj polozaja (--scatter-x/-y ispod),
// obe deterministicki izvedene iz ID-a karte (ista karta = isti "bacaj" na
// svaki render, ne treperi/skace izmedju rendera necenjenog stanja).
function cardRotationDeg(cardId) {
  return (hashString(cardId) % 33) - 16;
}
function cardScatterX(cardId) {
  return (hashString(cardId + '_x') % 17) - 8; // -8..8px
}
function cardScatterY(cardId) {
  return (hashString(cardId + '_y') % 13) - 6; // -6..6px
}

// Prati duzinu proslog stiha izmedju renderTrick() poziva — samo NOVO
// odigrana karta (index >= prethodna duzina) dobija ulaznu animaciju, da se
// ne reprizira pri svakom re-renderu nepromenjenog stanja stiha.
let _prevTrickLen = 0;

// Uzivo prijavljen bag (2026-09-21): engine ciscii currentTrick SINHRONO cim
// padne treca (poslednja) karta (resolveTrick() u game.ts), pa je stari kod
// ovde odmah renderovao prazan sto — druga dvojica igraca nikad ne stignu da
// VIDE sta je treci bacio. Drzimo zadnji pun stih vidljiv jos kratko posto
// se stvarno vec ocistio u state-u, pre nego sto pravo predjemo na prazan sto.
// Korisnikov zahtev (isti dan, DRUGI put): 700ms je i dalje delovalo
// prekratko (i u dvoje i u troje) — podignuto na 1500ms.
// BAG #2 (isti dan, TRECI put — korisnik: "ima malo cekanja ali se ta karta
// ne prikazuje"): prva verzija je pamtila "poslednji VIDJENI neprazan
// currentTrick" (_lastFullTrick), ali klijent NIKAD ne vidi currentTrick sa
// sve 3 karte — resolveTrick() ga cisti SINHRONO u ISTOM state-update-u koji
// bi prvi put pokazao 3. kartu, pa je _lastFullTrick uvek zaostajao na
// PRETPOSLEDNJEM stanju (2 karte, ili manje u solo odbrani), fali bas ona
// karta koja je zavrsila stih. Ispravka: kad currentTrick postane prazan I
// trickCount se promenio (stih stvarno upravo zavrsen), uzmi PRAVI zavrseni
// stih iz istorije (s.tricks, koju resolveTrick() puni PRE ciscenja) umesto
// iz sopstvenog "poslednjeg vidjenog" pracenja.
// Korisnikov zahtev (isti dan, CETVRTI put): sad kad se karta stvarno vidi
// (prethodni bag ispravljen), 1500ms je delovalo predugo — spusteno na 600ms.
const TRICK_HOLD_MS = 600;
let _lastTrickCount = null;
let _heldTrickCards = null;
let _heldTrickTimer = null;

function renderTrick() {
  const s = game.state;
  const real = s.currentTrick;

  if (real.length === 0 && _lastTrickCount !== null && s.trickCount !== _lastTrickCount && !_heldTrickCards) {
    const justFinished = s.tricks[s.tricks.length - 1];
    if (justFinished && justFinished.length > 0) {
      _heldTrickCards = justFinished;
      clearTimeout(_heldTrickTimer);
      _heldTrickTimer = setTimeout(() => {
        _heldTrickCards = null;
        renderTrick();
      }, TRICK_HOLD_MS);
    }
  }
  _lastTrickCount = s.trickCount;

  const trickToShow = (real.length === 0 && _heldTrickCards) ? _heldTrickCards : real;

  // Očisti slotove
  for (const seat of ['west', 'east', 'south']) {
    const slot = $(`slot-${seat}`);
    slot.innerHTML = '';
    slot.classList.remove('has-card', 'led');
  }

  // Dodaj karte iz trenutnog (ili jos-kratko-zadrzanog) stiha
  if (trickToShow.length > 0) {
    trickToShow.forEach((tc, idx) => {
      const seat = seatOf(tc.player);
      const slot = $(`slot-${seat}`);
      const node = cardEl(tc.card, { size: 'small' });
      // Blaga, ne-savrsena rotacija I pomeraj polozaja (korisnikov zahtev —
      // "kao pravo bacanje karata, ne padaju uvijek na isto mjesto, isto
      // okrenute") — deterministicki izvedeno iz ID-a karte (ne
      // Math.random() svaki render) da ostane STABILNO dok se stih ne
      // promeni, umesto da "trza" na svaki nepovezan re-render.
      node.style.setProperty('--rot', `${cardRotationDeg(tc.card.id)}deg`);
      node.style.setProperty('--scatter-x', `${cardScatterX(tc.card.id)}px`);
      node.style.setProperty('--scatter-y', `${cardScatterY(tc.card.id)}px`);
      if (idx >= _prevTrickLen) node.classList.add('card-dropped');
      slot.appendChild(node);
      slot.classList.add('has-card');
      if (idx === 0) slot.classList.add('led');
    });
  }
  _prevTrickLen = trickToShow.length;
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
      const seat = seatOf(b.player);
      const seatLabel = seatDisplayName(b.player);
      let txt = '';
      if (b.type === 'PASS') txt = `<strong>dalje</strong>`;
      else if (b.type === 'IGRA') txt = `<strong>Igra</strong>`; // bez imena (RULES 3.4) — konkretna igra se bira tek posle pobede
      else if (b.type === 'MOGU') txt = `<strong>mogu ${b.value}</strong>`;
      else txt = `<strong>${b.value}</strong>`;
      // Korisnikov zahtev: "samo Mogu X je zeleno, ostalo je i dalje isto"
      // — obican broj (BID, npr. "Zapad: 3") nije imao SVOJU boju uopste,
      // za razliku od dalje/mogu/igra. Dodata plava (bid) da sve 4 vrste
      // licitacionog poteza budu vizuelno razlicite.
      const extraCls = b.type === 'PASS' ? 'dalje' : (b.type === 'IGRA' ? 'igra' : (b.type === 'MOGU' ? 'mogu' : 'bid'));
      log.innerHTML += `<span class="${cls} ${extraCls}">${seatLabel}: ${txt}</span>`;
    }
    // Skroluj na kraj — HORIZONTALNO za baznu (desktop, red-obrazac) verziju
    // .bid-log-a. BAG (uzivo prijavljeno vise puta: "ne vidim ni pocetak ni
    // kraj" na landscape telefonu/sirokom desktopu): tamo se NE skroluje
    // sam #bidLog nego njegov RODITELJ #rightSidePanel (flex-direction:column
    // + overflow-y:auto na panelu, ne na logu) — ova linija je bila
    // POTPUNO NEEFIKASNA za taj slucaj (skrolovala pogresnu osu na pogresnom
    // elementu), pa je stvarna pozicija ostajala prepustena browser-ovom
    // "scroll anchoring" nagadjanju umesto da bude POUZDANO na najnovijem
    // unosu. Sad se skroluje i #bidLog (horizontalno, ako je red) I njegov
    // roditelj panel (vertikalno, ako je kolona) — jedno od njih je uvek
    // no-op zavisno od layout-a, bezopasno.
    log.scrollLeft = log.scrollWidth;
    const sidePanel = log.closest('.side-panel');
    if (sidePanel) sidePanel.scrollTop = sidePanel.scrollHeight;
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
    ctrl.appendChild(el('div', 'section-label', `Čeka se ${seatDisplayName(player)}...`));
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
    ctrl.appendChild(el('div', 'section-label', `Čeka se ${seatDisplayName(winner)} (baca 2 karte)...`));
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
      sfx.click();
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
    // Korisnikov zahtev: objasnjenje pravila u zagradi je nepotrebno ("ljudi
    // koji igraju preferans to znaju") — ukloniti SVA slicna objasnjenja.
    log.innerHTML = `<span class="bid-entry p${player}"><strong>${POS_LABELS[player]}</strong> proglašava igru</span>`;

    if (!isHuman(player) && mode === 'online') {
      ctrl.appendChild(el('div', 'section-label', `Čeka se ${seatDisplayName(player)} (proglašava Igru)...`));
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
    // Uzivo prijavljen bag (2026-09-21, RULES 3.4.1, TRECA verzija): kad
    // VISE igraca kaze Igra, pobedjuje NAJJACA proglasena igra — cim neko
    // izgubi tiebreak, NJEGOVA konkretna proglasena igra se NIGDE VISE ne
    // koristi (samo winnerGame ide dalje, vidi declareIgra() u game.ts) —
    // znaci da je za gubitnicku prijavu SVEJEDNO koju TACNO slabiju igru
    // igrac "prijavi", nijedna specifika nema efekta na tok partije. Zato
    // slabije opcije NE treba prikazivati pojedinacno (ni uklonjene — prvi
    // bag — ni sve nabrojane — drugi bag) vec SVE spojene u JEDNO dugme
    // "Tvoja je jača" (korisnikov zahtev) koje ispod haube prosto salje
    // NAJSLABIJU validnu (>= currentBid) gubitnicku vrednost — igrac ne
    // mora da bira izmedju bezveznih opcija koje sve vode na isti ishod
    // (gubi tiebreak). Opcije koje bi STVARNO pobedile ostaju pojedinacne
    // (njihov identitet VAZI — winnerGame postaje bas ta igra).
    const declaredValues = Object.values(s.igraDeclarations ?? {}).map(g => GAME_VALUES[g]);
    const bestDeclaredValue = declaredValues.length > 0 ? Math.max(...declaredValues) : s.currentBid - 1;
    const games = IGRA_GAMES.filter(g => GAME_VALUES[g] >= s.currentBid);
    const winningGames = games.filter(g => GAME_VALUES[g] > bestDeclaredValue);
    const losingGames = games.filter(g => GAME_VALUES[g] <= bestDeclaredValue)
      .sort((a, b) => GAME_VALUES[a] - GAME_VALUES[b]);
    for (const g of winningGames) {
      const btn = el('button', `bid-btn ${gameOptionAccentClass(g)}`, gameOptionLabel(g));
      btn.onclick = (e) => {
        logTrustedAction(`userDeclareIgraTiebreak game=${g} player=${player}`, e);
        game.declareIgra(player, g);
        render();
      };
      ctrl.appendChild(btn);
    }
    if (losingGames.length > 0) {
      const concedeGame = losingGames[0];
      const btn = el('button', 'bid-btn', 'Tvoja je jača');
      btn.onclick = (e) => {
        logTrustedAction(`userDeclareIgraTiebreak concede game=${concedeGame} player=${player}`, e);
        game.declareIgra(player, concedeGame);
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
    ctrl.appendChild(el('div', 'section-label', `Čeka se ${seatDisplayName(winner)} (bira igru)...`));
    return;
  }

  if (isAI) {
    const gen = handGeneration;
    if (isIgra) {
      ctrl.appendChild(el('div', 'section-label', `${POS_LABELS[winner]} proglašava igru (Igra)...`));
      setTimeout(() => {
        if (gen !== handGeneration || game.state.phase !== 'DECLARING' || game.state.winner !== winner) return;
        if (searchAiEnabled()) {
          applyLegalAction(game, searchChooseAction(game.state, winner, 150));
        } else {
          game.declareIgra(winner, aiChooseIgraGame(winner));
        }
        render();
      }, 600);
    } else {
      ctrl.appendChild(el('div', 'section-label', `${POS_LABELS[winner]} bira igru...`));
      setTimeout(() => {
        if (gen !== handGeneration || game.state.phase !== 'DECLARING' || game.state.winner !== winner) return;
        if (searchAiEnabled()) {
          applyLegalAction(game, searchChooseAction(game.state, winner, 150));
        } else {
          game.declareGame(winner, aiChooseGame(winner));
        }
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
    const btn = el('button', `bid-btn ${gameOptionAccentClass(g)}`, gameOptionLabel(g));
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

  // Uzivo prijavljen bag (2026-09-21, RULES 5.1: "desni od nosioca prvi") —
  // [0,1,2].filter(...) pitalo pratioce u prirodnom (rastucem) redosledu
  // pozicija umesto "desni pa treci"; engine-ov follow() sad striktno
  // namece pravi redosled (expectedFollowPlayer), pa ovde MORA da se
  // koristi ISTI redosled, inace bi dugme prikazano pogresnom igracu bilo
  // tiho odbijeno. DRUGI put uzivo prijavljen bag (isti dan): prva verzija
  // je imala right/third obrnuto (winner+2/winner+1 umesto winner+1/winner+2).
  const right = (s.winner + 1) % 3;
  const third = (s.winner + 2) % 3;
  const followers = [right, third];
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
      ctrl.appendChild(el('div', 'section-label', `Čeka se ${seatDisplayName(undecided)}...`));
    } else {
      ctrl.appendChild(el('div', 'section-label', `${POS_LABELS[undecided]} razmišlja...`));
      // Dodji ako ima bar 2 "sigurna" stiha (adut A/K/D sa duzinom, ili
      // asovi van aduta) — RULES 5.2 minimum za prolaz.
      const hand = s.players[undecided].hand;
      const willFollow = aiChooseFollow({ hand, declaredGame: s.declaredGame }) === 'DODJEM';
      const gen = handGeneration;
      setTimeout(() => {
        if (gen !== handGeneration || game.state.phase !== 'FOLLOW_DECLARING' || game.state.followChoices[undecided] !== null) return;
        if (searchAiEnabled()) {
          applyLegalAction(game, searchChooseAction(game.state, undecided, 300));
        } else {
          game.follow(undecided, willFollow ? 'DODJEM' : 'NE_DODJEM');
        }
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
    const call = el('button', 'bid-btn primary', `Pozovi ${POS_LABELS[neDodjem]}`);
    call.onclick = (e) => { logTrustedAction(`userCall callee=${neDodjem}`, e); game.call(callerCandidate, neDodjem); render(); };
    ctrl.appendChild(call);
    const solo = el('button', 'bid-btn primary', 'Igram sam');
    solo.onclick = (e) => { logTrustedAction('userContinueWithoutCall', e); game.continueWithoutCall(); render(); };
    ctrl.appendChild(solo);
  } else if (mode === 'online') {
    ctrl.appendChild(el('div', 'section-label', `Čeka se ${seatDisplayName(callerCandidate)}...`));
  } else {
    ctrl.appendChild(el('div', 'section-label', `${POS_LABELS[callerCandidate]} razmišlja (poziv)...`));
    const gen = handGeneration;
    setTimeout(() => {
      if (gen !== handGeneration || game.state.phase !== 'FOLLOW_DECLARING' || game.state.caller !== null) return;
      // Zovi partnera ako NJEGOVA ruka ima bar 1 siguran stih da doprinese,
      // inace igraj sam (RULES 5.3 — poziv ima smisla samo ako pozvani
      // stvarno moze pomoci).
      if (searchAiEnabled()) {
        applyLegalAction(game, searchChooseAction(game.state, callerCandidate, 300));
      } else {
        const neDodjemHand = game.state.players[neDodjem].hand;
        const action = aiChooseCallOrAlone({
          caller: callerCandidate,
          neDodjemHand,
          declaredGame: game.state.declaredGame,
        });
        if (action === 'CALL') game.call(callerCandidate, neDodjem);
        else game.continueWithoutCall();
      }
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
    // Korisnikov zahtev: pratilac koji je dosao SAM (bez pozivanja NE_DODJEM
    // partnera) ne sme dati kontru — kontra uvek znaci igru u troje, ko
    // stvarno hoce kontru bi prvo pozvao partnera (isti uslov kao engine-ov
    // isSoloFollowerWithoutCall(), racunat ovde direktno iz vidljivog state-a
    // jer online proksi nema tu metodu).
    const followers = [0, 1, 2].filter((p) => p !== s.winner);
    const neDodjemCount = followers.filter((p) => s.followChoices[p] === 'NE_DODJEM').length;
    const soloNoCall = s.kontraLevel === null && s.caller === null && neDodjemCount === 1 && s.followChoices[expected] === 'DODJEM';
    // VRACENO (2026-09-20): "auto-Moze" za solo-bez-poziva pratioca
    // (dodato 2026-09-19, ideja da se preskoci besmisleno dugme) je
    // vrlo verovatno UZROK ponovljenog "stuck, ne mogu da bacim kartu"
    // bug-a — korisnik ga je prijavio VISE PUTA u istoj partiji, svaki
    // put bas na ovom istom prelazu (solo odbrana, KONTRA_DECLARING ->
    // PLAYING), popravljivo samo izlaskom/ulaskom. Tacan mehanizam
    // razloga nije potvrdjen, ali korelacija je previse jaka da se
    // rizikuje dalje — bolje da korisnik jednom klikne bezopasno dugme
    // "Moze" nego da se partija zaglavi. Ako se stuck bug PONOVO pojavi
    // i POSLE ovoga, uzrok je negde drugde (vidi memoriju
    // project_preferans_stuck_solo_kontra_bug_2026_09_20).
    const nextLevel = {
      null: 'KONTRA',
      'KONTRA': 'REKONTRA',
      'REKONTRA': 'SUBKONTRA',
      'SUBKONTRA': 'MORTKONTRA',
    }[s.kontraLevel ?? 'null'];
    if (!soloNoCall) {
      const kontraBtn = el('button', 'bid-btn danger', nextLevel);
      kontraBtn.onclick = (e) => { logTrustedAction(`userKontra level=${nextLevel}`, e); game.kontra(expected, nextLevel); render(); };
      ctrl.appendChild(kontraBtn);
    }
    const mozeBtn = el('button', 'bid-btn primary', 'Moze');
    mozeBtn.onclick = (e) => { logTrustedAction('userMoze', e); game.moze(expected); render(); };
    ctrl.appendChild(mozeBtn);
  } else if (mode === 'online') {
    ctrl.appendChild(el('div', 'section-label', `Čeka se ${seatDisplayName(expected)}...`));
  } else {
    ctrl.appendChild(el('div', 'section-label', `${POS_LABELS[expected]} razmišlja...`));
    // Kontra ako ima 4+ aduta, ili 3+ aduta sa 2+ visoke karte u adutu
    // (deterministicki prag, ne slucajno pogadjanje).
    const hand = s.players[expected].hand;
    const levelNum = { KONTRA: 1, REKONTRA: 2, SUBKONTRA: 3, MORTKONTRA: 4 }[s.kontraLevel] ?? 0;
    // Solo pratilac (bez poziva) ne sme kontru — inace game.kontra() tiho
    // odbija akciju (engine ogranicenje) i ovaj AI blok bi se beskonacno
    // ponavljao pokusavajuci istu, uvek-odbijenu akciju.
    const aiFollowers = [0, 1, 2].filter((p) => p !== s.winner);
    const aiNeDodjemCount = aiFollowers.filter((p) => s.followChoices[p] === 'NE_DODJEM').length;
    const aiSoloNoCall = s.kontraLevel === null && s.caller === null && aiNeDodjemCount === 1 && s.followChoices[expected] === 'DODJEM';
    const willKontra = !aiSoloNoCall && s.kontraLevel !== 'MORTKONTRA' &&
      aiChooseKontra({ hand, trump: s.trump, currentLevel: levelNum }) === 'KONTRA';
    const gen = handGeneration;
    setTimeout(() => {
      if (gen !== handGeneration || game.state.phase !== 'KONTRA_DECLARING' || game.expectedKontraPlayerPublic() !== expected) return;
      if (searchAiEnabled()) {
        applyLegalAction(game, searchChooseAction(game.state, expected, 300));
      } else if (willKontra) {
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
  if (s.phase === 'FOLLOW_DECLARING') {
    // Ista logika kao renderFollowing()/renderState() — prikazi ruku onoga
    // ko TRENUTNO treba da odluci (Dodjem/Ne dodjem, pa Zovi/Igraj sam), ne
    // uvek nosioca. Bag: ranije se ovde uvek vracao s.winner, pa je pratilac
    // na potezu video tudju (nosiocevu) ruku umesto svoje.
    return expectedFollowActor(s);
  }
  if (s.phase === 'KONTRA_DECLARING') {
    const expected = game.expectedKontraPlayerPublic();
    if (expected !== null) return expected;
  }
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

  let anyPlayable = false;
  for (const c of sortHand(s.players[handOwner].hand)) {
    const legal = !isMyTurn || isCardLegal(c, handOwner);
    if (isMyTurn && legal) anyPlayable = true;
    const card = cardEl(c, { playable: isMyTurn && legal, disabled: isMyTurn && !legal });
    if (isMyTurn && legal) {
      card.onclick = (e) => userPlayCard(c.id, e, handOwner);
    }
    handArea.appendChild(card);
  }
  applyHandFan(handArea);
  // Dijagnostika (vidi debugLog definiciju) — ovo je TACNO simptom
  // prijavljenog "stuck" bag-a: state kaze da sam ja na potezu, ali
  // nijedna karta nije ispala kao playable.
  if (mode === 'online' && isMyTurn && !anyPlayable && s.players[handOwner].hand.length > 0) {
    debugLog('STUCK-SYMPTOM: isMyTurn ali nijedna karta playable', {
      currentPlayer: s.currentPlayer, mySeat, handOwner,
      handLen: s.players[handOwner].hand.length,
      legalCardsFromServer: game.getLegalCards ? game.getLegalCards(handOwner) : null,
    });
  }
}

function isCardLegal(card, player = 0) {
  const legal = game.getLegalCards(player);
  return legal.some(c => c.id === card.id);
}

// === MAIN RENDER ===

const TERMINAL_PHASES = ['GAME_OVER', 'REFE', 'MATCH_OVER'];
function render() {
  // Online sobe sad automatski dele sledecu ruku posle GAME_OVER (server-
  // side, roomEvents.ts) — bez ovoga bi ekran rezultata ostao trajno
  // prikazan i posle sto je nova ruka vec pocela, jer ga jedino lokalni-mod
  // dugmici (nextRound/restart/resultAction) ikad uklanjaju.
  if (!TERMINAL_PHASES.includes(game.state.phase)) $('resultScreen').classList.remove('active');
  renderState();
  renderStatusBar();
  renderSeatExtras();
  renderTrick();
  renderBiddingPanel();
  updateTableWatermark();
  recordHandIfNew();
  checkRefeToast();
  updateSoundEffects();
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
    // Lokalni modovi namerno nemaju tekstualni "na potezu" indikator ovde
    // (korisnikov raniji zahtev — vec dovoljno pokazuje zuti obrub oko
    // aktivnog sedista). Online je druga prica: bez POS_LABELS vise nema
    // ocekivanog "AI razmislja" teksta uopste tokom PLAYING, pa je jedini
    // signal ostao taj zuti obrub — uzivo prijavljena zabuna ("ne vidim ko
    // je na potezu"). Dodat eksplicitan tekst SAMO za online.
    if (mode === 'online') {
      const ctrl = $('bidControls');
      ctrl.innerHTML = '';
      ctrl.appendChild(el('div', 'section-label',
        isHumanTurn ? 'TVOJ POTEZ' : `Na potezu: ${seatDisplayName(game.state.currentPlayer)}`
      ));
    }
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

  if (searchAiEnabled()) {
    // Monte Carlo determinizaciona pretraga (plan "toasty-rolling-sparkle",
    // Faza 3) — getLegalActions() vec ispravno kodira SVA pravila
    // licitacije (igraEligible, numericBidFrozen dok neko drzi Igra,
    // Mogu-sme-samo-jedan-igrac), pa nema potrebe za rucnim radnim-oko-om
    // koji heuristicki put ispod zahteva. 200 uzoraka po kandidatu
    // (korisnikov zahtev 2026-09-18 "poboljsaj AI" — podignuto sa 80;
    // bench-search.ts meri ~0.25ms/uzorak na ovoj masini, pa 3-4 kandidata
    // x 200 ostaje ~150-200ms, bez primetnog kasnjenja).
    const action = searchChooseAction(s, player, 200);
    applyLegalAction(game, action);
    render();
    return;
  }

  // Neko je vec rekao "Igra" — numericka licitacija je zamrznuta (RULES 3.4).
  // Mogu samo konkurisati svojom Igra ili reci "dalje". chooseBidAction() ne
  // modelira ovaj slucaj (RULES 3.4.1 tiebreak) uopste, pa ostaje posebno
  // ovde — prag usklađen sa istim IGRA pragom koji chooseBidAction koristi
  // (evaluateHand().bestSuit: 6+ karata, 2+ visoke, najjaca bar Dama/J>=4)
  // radi konzistentnosti dve grane koje odlucuju o istoj stvari.
  if (s.igraPlayer !== null && s.igraPlayer !== player) {
    // RULES 3.4: Igra sme SAMO na igracev prvi potez u rundi (igraEligible)
    // — bez ove provere, AI bi pokusao sayIgra() posle sopstvenog ranijeg
    // broja/dalje, engine bi ga tiho odbio (vraca false), i partija bi
    // ostala zaglavljena zauvek na ovom igracu (uzivo prijavljen rizik).
    // Uzivo prijavljen bag (2026-09-22/23, audit): ranije je ovde bio
    // POSEBAN, slabiji prag (count>=6, highCards>=2, rank>=4 preko
    // evaluateHand) — razlicit i od isIgraWorthy() (koju koristi
    // aiChooseBidAction za PRVI Igra-poziv) i od search-ove verzije ove
    // iste odluke (aiSearch.ts). Sad ista provera svuda.
    const canIgra = s.players[player].igraEligible && isIgraWorthy(hand);
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

// Uzivo prijavljen bag (2026-09-22): stara verzija je birala samo po
// evaluateHand().bestSuit (duzina+poeni), bez provere sigurnih stihova —
// i Igra varijanta (dole) je birala prosto najduzu boju, cak i bez
// provere da li ta boja uopste opravdava Igra-poziv, ni razmatrajuci
// Igra-Betl/Igra-Sans. Obe sad koriste istu kalibrisanu funkciju kao
// engine-ov heuristicki rollout (vidi chooseDeclareGame u aiBidding.ts).
function aiChooseGame(player) {
  const s = game.state;
  const hand = s.players[player].hand;
  return aiChooseDeclareGame(hand, s.currentBid, STANDARD_GAMES);
}

function aiChooseIgraGame(player) {
  const s = game.state;
  const hand = s.players[player].hand;
  return aiChooseDeclareGame(hand, s.currentBid, IGRA_GAMES);
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

  if (searchAiEnabled()) {
    // Monte Carlo determinizacija (plan "toasty-rolling-sparkle", Faza 1)
    // — uzorkuje verovatne tudje ruke i simulira ostatak ruke, umesto
    // fiksne heuristike. 220 uzoraka po kandidatu (korisnikov zahtev
    // 2026-09-18 "poboljsaj AI" — podignuto sa 100; bench-search.ts meri
    // ~0.25ms/uzorak, pa tipicnih 2-5 legalnih karata ostaje ~110-275ms,
    // ne primetno sporije, a igranje karata je najcesca AI odluka po ruci).
    const card = searchChoosePlayCard(s, player, 220);
    return card ? card.id : legal[0].id;
  }

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
    tricks: s.tricks,
    nextActivePosition: game.nextActivePlayer ? game.nextActivePlayer(player) : null,
    bidLevels: [s.players[0].bidLevel, s.players[1].bidLevel, s.players[2].bidLevel],
  });
  return card ? card.id : legal[0].id;
}

// === RESULT ===

// Koja sedista su vec kliknula "Deli" za rundu koja je bas zavrsena (online
// mod) — korisnikov zahtev: jedan igrac ne sme sam da forsira sledecu rundu,
// pa server sad ceka da SVI aktivni igraci kliknu (ili istekne auto-tajmer).
// Ovo samo prikazuje status, server je izvor istine.
let dealNextReadySeats = [];
// Korisnikov zahtev (2026-09-10) — "Predlog za kraj": ko je predlozio
// (za banner tekst na status-update-ima koji ne nose byPosition ponovo),
// i poslednji rezultat rangiranja (za MATCH_OVER prikaz).
let endMatchProposerSeat = null;
let lastMatchRankingResult = null;

function renderResult() {
  const s = game.state;
  if (!TERMINAL_PHASES.includes(s.phase)) return;
  $('resultScreen').classList.add('active');
  // "GAME_OVER" u engine-u znaci kraj RUKE, ne kraj cele partije (ta se
  // nastavlja dok zbir bula ne padne na TACNO 0, vidi RULES 9.1/9.1.1) —
  // "MATCH_OVER" je NOVA, odvojena faza za stvarni kraj CELE partije.
  const title = s.phase === 'REFE' ? '🤝 Refe' : (s.phase === 'MATCH_OVER' ? '🏆 Kraj partije!' : '🏁 Kraj ruke');
  $('resultTitle').textContent = title;
  $('resultTitle').classList.toggle('match-over-title', s.phase === 'MATCH_OVER');
  $('resultBox').classList.toggle('match-over', s.phase === 'MATCH_OVER');
  // "Pogledaj karte" ima smisla samo posle GAME_OVER (kraj rune) — kod
  // MATCH_OVER nema sledece runde cije karte bi se cekale/gledale.
  $('viewCardsBtn').style.display = s.phase === 'GAME_OVER' ? '' : 'none';
  $('revealedHandsScreen').classList.remove('active');
  $('revealedHandsContent').innerHTML = '';
  // Online: sledeca runda se inace deli SAMA (automatski tajmer) — "Igraj"
  // bi zbunilo kao da ovo dugme pokrece nesto sto se inace desi samo od
  // sebe. "Deli" bolje opisuje "preskoci cekanje / potvrdi odmah".
  // BAG (uzivo prijavljen, 2026-09-10: "2 igraca zavrsila na soba ekranu"):
  // ovo dugme je ranije OSTAJALO na "Deli" i za MATCH_OVER (uslov ga je
  // eksplicitno preskakao, pa je teksta ostajao stale od PRETHODNOG
  // GAME_OVER prikaza) — zbunjujuce, jer dugme tu ne deli nista, vec vodi
  // nazad na pocetnu/novu partiju.
  $('nextRoundBtn').textContent = s.phase === 'MATCH_OVER'
    ? (mode === 'online' ? 'Nazad na početnu' : 'Nova partija')
    : (mode === 'online' ? 'Deli' : 'Igraj');
  // Status "ko je vec spreman" (samo online, samo GAME_OVER — ne MATCH_OVER,
  // gde dugme vodi na pocetni ekran umesto da deli sledecu rundu).
  const dealStatusEl = $('dealNextStatus');
  if (mode === 'online' && s.phase === 'GAME_OVER') {
    const ready = dealNextReadySeats;
    dealStatusEl.style.display = '';
    if (ready.includes(mySeat)) {
      // Napusteno (AI-preuzeto) sediste nije vidljivo klijentu kao takvo —
      // server ga vec izuzima iz stvarnog cekanja (activeSeatsForRoom), ovo
      // je samo prikaz pa moze retko da "ceka" nekog ko se ustvari ne racuna.
      const waitingFor = [0, 1, 2].filter((p) => !ready.includes(p));
      dealStatusEl.textContent = waitingFor.length > 0
        ? `Čeka se: ${waitingFor.map((p) => seatDisplayName(p)).join(', ')}...`
        : '';
      $('nextRoundBtn').disabled = true;
    } else {
      dealStatusEl.textContent = ready.length > 0
        ? `Spremni: ${ready.map((p) => seatDisplayName(p)).join(', ')}`
        : '';
      $('nextRoundBtn').disabled = false;
    }
  } else {
    dealStatusEl.style.display = 'none';
    $('nextRoundBtn').disabled = false;
  }

  if (s.phase === 'MATCH_OVER') {
    // BAG (uzivo prijavljen: "modal se sam ne sklanja kad kliknem slazem se
    // sa prekidom") — end-match-banner se ranije cistio SAMO na
    // game:endMatchCancelled, nikad na stvaran uspesan zavrsetak (svi
    // prihvatili -> MATCH_OVER). Ovde je JEDINO mesto koje UVEK pouzdano
    // zna da je partija gotova, bez obzira koji je od 3 puta doveo do toga.
    const endMatchBanners = $('endMatchBanners');
    if (endMatchBanners) endMatchBanners.innerHTML = '';
    // Korisnikov zahtev: kraj PARTIJE ne treba da ponavlja narativ poslednje
    // ruke (ko je igrao sta, prosao/pao...) — samo naslov + tabela konacnog
    // plasmana, SA VIDLJIVIM proracunom (korisnikov zahtev 2026-09-10:
    // "zelim da vidim to prikazano na kraju... prvi drugi treci, ne samo
    // pobednik je x, jer nekad 2 igraca mogu biti skoro izjednacena").
    // PRAVI UZROK BAGA (nadjen 2026-09-10 posle "28. put ista stvar" —
    // ranije try/catch je samo GRACEFULLY sakrivao ovo, ne resavao):
    // "game" u ONLINE modu NIJE prava Game instanca — createOnlineGameProxy()
    // (gore u fajlu) je tanak proksi koji ima SAMO akcije (bid/pass/...),
    // NEMA getMatchScores() uopste. game.getMatchScores() je OVDE UVEK bacao
    // "nije funkcija" za svaku online partiju, sto je NEUHVACENA greska
    // prekidala renderResult() na pola — naslov se stigao azurirati, ali
    // ovaj blok nikad nije stigao da prepise $('resultMsg'). Ispravka:
    // racunaj score DIREKTNO iz s.bulas/s.debtMatrix (oba vec stoje u
    // svakom game.state broadcast-u, bez obzira na proksi) — ista formula,
    // bez ikakve zavisnosti od engine metode koja online ne postoji.
    try {
      const owed = [0, 1, 2].map(p => {
        let owedBy = 0, owedTo = 0;
        for (const y of [0, 1, 2]) {
          if (y === p) continue;
          owedBy += s.debtMatrix?.[p]?.[y] ?? 0;
          owedTo += s.debtMatrix?.[y]?.[p] ?? 0;
        }
        return { owedBy, owedTo };
      });
      const scores = [0, 1, 2].map(p => s.bulas[p] * 10 + owed[p].owedBy - owed[p].owedTo);
      const ranking = [0, 1, 2].slice().sort((a, b) => scores[a] - scores[b]);
      const winnerPos = ranking[0];
      const RANK_LABELS = ['🥇 1. mesto', '🥈 2. mesto', '🥉 3. mesto'];
      let html = `<div class="score-players-row">`;
      ranking.forEach((p, idx) => {
        // lastMatchRankingResult stize SAMO online (server-autoritativan) —
        // offline/lokalni mod nema trajni rejting, prikaz se gracefully
        // izostavlja.
        const delta = lastMatchRankingResult?.deltas?.[p];
        const newRating = lastMatchRankingResult?.newRatings?.[p];
        const deltaTxt = typeof delta === 'number'
          ? `<div class="score-player-row" style="margin-top:2px;font-size:0.85em">
               <span style="color:${delta > 0 ? '#a5d6a7' : delta < 0 ? '#ff8a80' : 'inherit'}">${delta > 0 ? '+' : ''}${delta} bodova</span>
               ${typeof newRating === 'number' ? `<span style="opacity:0.6">(rejting: ${newRating})</span>` : ''}
             </div>`
          : '';
        const { owedBy, owedTo } = owed[p];
        const parts = [`${s.bulas[p]}×10`];
        if (owedBy > 0) parts.push(`+${owedBy}`);
        if (owedTo > 0) parts.push(`−${owedTo}`);
        const breakdown = `${parts.join(' ')} = ${scores[p]}`;
        // Korisnikov zahtev (2026-09-18): kraj PARTIJE (za razliku od kraja
        // svake pojedinacne ruke, koje vec prikazuje stihove) nije imao
        // NIKAKAV podatak o stihovima — sabrano preko cele istorije partije
        // (handHistory, klijentski akumulirano po ruci) umesto samo
        // poslednje ruke (s.players[p].tricksWon), koje bi bilo besmisleno
        // kao "totalno" jer se resetuje na svaku newHand().
        // Korisnikov zahtev (2026-09-20): "niko ne prati"/"Pik bez kontre"
        // ruke imaju wasPlayed===false i tricksWon 0/0/0 (nijedna karta nije
        // ni bacena) iako nosilac po pravilu automatski "dobija" svih 10 —
        // bez ovoga bi ukupan zbir stihova nosioca kroz partiju bio manji
        // nego sto stvarno treba (isto pravilo kao u renderResult() ispod).
        const totalTricks = handHistory.reduce((sum, h) => {
          if (!h.wasPlayed && h.passed && h.winner === p) return sum + 10;
          return sum + (h.tricksWon?.[p] ?? 0);
        }, 0);
        // Korisnikov zahtev (2026-09-19): KONACAN SKOR (scores[p] — supe +
        // bule×10, ono sto stvarno odredjuje plasman) je bitniji od same
        // bule ("igrac koji je -20 bula moze biti poslednji, to nije
        // relevantno") — zato sad ide u veliki broj, a bula je sporedan
        // detalj u breakdown-u ispod.
        html += `<div class="score-player-card ${p === winnerPos ? 'winner' : ''}">
          <div class="score-player-rank">${RANK_LABELS[idx]}</div>
          <div class="score-player-name">${POS_LABELS[p]}${p === winnerPos ? ' 🏆' : ''}</div>
          <div class="score-player-row"><span class="score-player-bula">${scores[p]}</span></div>
          <div class="score-breakdown">Bula: ${s.bulas[p]} · ${breakdown}</div>
          <div class="result-mini-tricks">🎴 ukupno ${totalTricks} štihova</div>
          ${deltaTxt}
        </div>`;
      });
      html += `</div>`;
      html += `<p style="text-align:center;margin-top:14px">🏆 <strong style="color:#ffeb3b">${POS_LABELS[winnerPos]} pobeđuje!</strong></p>`;
      // Korisnikov zahtev: razlog kraja partije (prirodan/dogovor/napustanje)
      // vidljiv na ekranu, ne samo implicitno.
      const reasonTxt = s.matchEndReason === 'agreed' ? 'Partija je završena po dogovoru svih igrača.'
        : s.matchEndReason === 'leave' ? 'Partija je završena dogovorom preostalih igrača posle napuštanja stola.'
        : '';
      if (reasonTxt) html += `<p class="muted-line" style="text-align:center">${reasonTxt}</p>`;
      $('resultMsg').innerHTML = html;
    } catch (err) {
      console.error('[MATCH_OVER render greška, koristim jednostavan fallback]', err);
      const fallbackRanking = [0, 1, 2].slice().sort((a, b) => (s.bulas[a] ?? 0) - (s.bulas[b] ?? 0));
      const fallbackWinner = fallbackRanking[0];
      $('resultMsg').innerHTML = `<div class="score-players-row">${
        fallbackRanking.map(p => `<div class="score-player-card ${p === fallbackWinner ? 'winner' : ''}">
          <div class="score-player-name">${POS_LABELS[p]}${p === fallbackWinner ? ' 🏆' : ''}</div>
          <div class="score-player-row"><span class="score-player-bula">${s.bulas[p] ?? '?'}</span></div>
        </div>`).join('')
      }</div><p style="text-align:center;margin-top:14px">🏆 <strong style="color:#ffeb3b">${POS_LABELS[fallbackWinner]} pobeđuje!</strong></p>`;
    }
    return;
  }

  // Redizajnirano (korisnikov zahtev: "sve pise na isti nacin i istim
  // bojama") — strukturirane kartice/bedzevi umesto jednog bloka teksta sa
  // <br>-ovima, jasna vizuelna hijerarhija (ugovor → prosao/pao → detalji →
  // mini-tabela bula/stihova po igracu).
  let html = '';
  if (s.declaredGame && s.lastHandResult) {
    // Koristi engine-ov lastHandResult kao izvor istine — pokriva i slucajeve
    // kad se nije igralo (RULES 5.4 "niko ne prati", RULES 7.1.1 "Pik bez kontre")
    const kontraLabel = { KONTRA: 'Kontra ×2', REKONTRA: 'Rekontra ×4', SUBKONTRA: 'Subkontra ×8', MORTKONTRA: 'Mortkontra ×16' };
    html += `<div class="result-contract">
      <span class="result-declarer">${POS_LABELS[s.winner]}</span>
      <span class="result-game-badge ${gameOptionAccentClass(s.declaredGame)}">${gameOptionLabel(s.declaredGame)}</span>
      ${s.kontraLevel ? `<span class="result-kontra-badge">${kontraLabel[s.kontraLevel]} (${POS_LABELS[s.kontraPlayer]})</span>` : ''}
    </div>`;
    // Korisnikov zahtev (2026-09-19, ponovljen vise puta): broj stihova
    // nosioca mora da stoji ODMAH pored PROSAO/PAO, ne samo posredno u
    // mini-karticama ispod (gde je bio samo emoji bez teksta, lako
    // previdljiv/nejasan).
    // Korisnikov zahtev (2026-09-20): kad niko ne prati (RULES 5.4) ili
    // "Pik bez kontre" (RULES 7.1.1), ruka se NIKAD stvarno ne odigra —
    // s.players[winner].tricksWon ostaje 0 jer nijedna karta nije ni
    // bacena — ali pravilo kaze da nosilac "automatski dobija 10 stihova".
    // Prikazivati "0 stihova" tu je pogresno/zbunjujuce iako je matematika
    // bula ispravna. trickCount===0 pouzdano razlikuje ovaj slucaj od
    // stvarno odigrane ruke (koja uvek zavrsi sa trickCount===10).
    const unplayedAutoWin = s.lastHandResult.passed && s.trickCount === 0;
    const declarerTricksTxt = unplayedAutoWin ? 10 : s.players[s.winner].tricksWon;
    html += `<div class="result-outcome ${s.lastHandResult.passed ? 'pass' : 'fail'}">${s.lastHandResult.passed ? '✓ PROŠAO' : '✗ PAO'} — ${declarerTricksTxt} štihova</div>`;
    // Ko je dosao/zvao (isti rezime kao u statusnoj traci tokom igre) —
    // korisnikov zahtev: modal ne sme da preskoci ovaj podatak.
    const defenseTxt = defenseSummaryText(s, true);
    if (defenseTxt) html += `<div class="result-line">${defenseTxt}</div>`;
    // Supe zaradjene OVOM rukom, po igracu — direktno objasnjava zasto neko
    // (npr. ne-kontras pratilac) ne dobija nista uprkos odigranim stihovima.
    const supeParts = [0, 1, 2]
      .map(p => ({ p, v: s.lastHandResult.supeDelta[p] }))
      .filter(x => x.v > 0)
      .map(x => `<span class="result-supe-chip">${POS_LABELS[x.p]} +${x.v}</span>`);
    if (supeParts.length > 0) html += `<div class="result-supe-row">${supeParts.join('')}</div>`;
  } else {
    html += `<div class="result-line" style="font-size:1.05em;margin:10px 0">Svi su rekli dalje.</div>`;
  }
  html += `<div class="result-scoreboard">`;
  for (const p of [0, 1, 2]) {
    // Ista "niko ne prati"/"Pik bez kontre" korekcija kao gore — samo za
    // nosioca (pratioci nisu ni igrali, njihovih 0 je i dalje tacno).
    const tricksTxt = (s.declaredGame && s.lastHandResult && p === s.winner &&
      s.lastHandResult.passed && s.trickCount === 0) ? 10 : s.players[p].tricksWon;
    html += `<div class="result-mini-card">
      <div class="result-mini-name">${POS_LABELS[p]}</div>
      <div class="result-mini-bula">${s.bulas[p]}</div>
      <div class="result-mini-tricks">${tricksTxt} štihova</div>
    </div>`;
  }
  html += `</div>`;
  $('resultMsg').innerHTML = html;
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
          <span class="score-focal-name">${POS_LABELS[p]}${
            mode === 'online' && typeof s.players[p]?.rating === 'number'
              ? `<span class="score-focal-rating">(${s.players[p].rating})</span>`
              : ''
          }</span>
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
    const kontraName = { KONTRA: 'Kontra', REKONTRA: 'Rekontra', SUBKONTRA: 'Subkontra', MORTKONTRA: 'Mortkontra' };
    html += `<div style="overflow-x:auto"><table class="score-table">
      <colgroup><col><col><col><col><col><col><col></colgroup>
      <thead><tr>
      <th>Krug</th><th>Nosilac</th><th>Igra</th><th>Kontra</th><th>Pratnja</th><th>Prošao</th><th>Bule</th>
    </tr></thead><tbody>`;
    for (const h of [...handHistory].reverse()) {
      // Korisnikov zahtev: "Pratnja" kolona — jedan igrac ako ide sam/zove,
      // OBA ako su dosli posebno, svako sa svojim brojem stihova. "Prosao"
      // sad nosi i koliko je NOSILAC uhvatio (ne posebna "Stihovi" kolona,
      // koja se uklonjena).
      // BAG (uzivo prijavljeno VISE puta: "u tabeli nema nista od toga" na
      // STVARNO odigranoj ruci sa realnim stihovima): oslanjanje na wasPlayed
      // (game.state.tricks.length>0 u trenutku snimanja) je OCIGLEDNO davalo
      // pogresnu vrednost u nekim online scenarijima ciji tacan uzrok nisam
      // uspeo da nadjem (lokalna engine simulacija istog toka radi ispravno).
      // Umesto da se DALJE oslanja na tu (nepouzdanu) zastavicu, prikaz sad
      // gleda DIREKTNO stvarne brojeve — 0 je vec "falsy" u JS-u, pa se
      // "(0)"/prazna Pratnja za formulske "niko ne prati" ishode (RULES 5.4,
      // gde SVI tricksWon ostaju 0) svejedno ne prikazuju, BEZ da zavise od
      // posebne (bagovite) zastavice.
      // Korisnikov zahtev: Pratnja je pisala "Ime: N" a Prosao "reč (N)" —
      // dva razlicita formata jedno pored drugog delovalo je neusaglaseno.
      // Oba sad koriste isti "(N)" oblik. white-space:nowrap na CELOM
      // tekstu (ne samo na broju) sprecava da se "prošao" i "(3)" prelome
      // u dva reda kad je kolona uska (uzivo prijavljeno na telefonu).
      const followTxt = h.followSeats && h.followSeats.length > 0
        ? h.followSeats.map(p => {
            const combined = (h.caller === p && h.callee !== null) ? h.tricksWon[p] + h.tricksWon[h.callee] : h.tricksWon[p];
            // wasPlayed: RULES 5.4/7.1.1 neodigrane ruke nemaju NIKAKVU
            // promenu bule za pratioce (vidi engine handleUnplayedHand()) —
            // status bi ovde bio pogresan (0 stihova bi izgledalo kao "pao").
            const fp = h.wasPlayed ? followerPassed({
              declaredGame: h.winnerGame, kontraLevel: h.kontraLevel, declarerPassed: h.passed,
              caller: h.caller, callee: h.callee, tricksWon: h.tricksWon,
            }, p) : null;
            return `<span class="follow-line" style="white-space:nowrap">${POS_LABELS[p]} (${combined})${followerStatusBadge(fp)}</span>`;
          }).join('')
        : '—';
      const winnerTricks = h.winner !== null && h.tricksWon ? h.tricksWon[h.winner] : 0;
      const resultTxt = h.passed
        ? `<span style="white-space:nowrap">✓ prošao${winnerTricks ? ` (${winnerTricks})` : ''}</span>`
        : `<span style="white-space:nowrap">✗ pao${winnerTricks ? ` (${winnerTricks})` : ''}</span>`;
      html += `<tr>
        <td>${h.round}</td>
        <td>${POS_LABELS[h.winner]}</td>
        <td>${h.winnerGame}${h.viaIgra ? ' <span style="opacity:0.6">(Igra)</span>' : ''}</td>
        <td>${kontraName[h.kontraLevel] ?? 'Ne'}</td>
        <td>${followTxt}</td>
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
  const refeMax = maxRefeForBula(initialBule);
  const refePerPlayer = Number.isFinite(refeInput) && refeInput >= 0 ? Math.min(refeInput, refeMax) : Math.min(2, refeMax);
  game = createGame({ seed: debugSeedOverride() ?? (Date.now() & 0xffff), initialBule, refePerPlayer });

  // Nova partija — resetuj svu sesijsku istoriju od (eventualne) prethodne
  // partije na istoj stranici (Zavrsi -> nova partija sa drugim podesavanjima).
  // Bez ovoga bi supe-dug-matrica/istorija ruka procurile u novu partiju.
  handHistory = [];
  debtMatrix = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  lastRecordedRound = null;
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
// krug" i "Zavrsi", sad samo "Igraj"/"Deli"). Ponasanje zavisi od
// moda+faze: lokalno obicna ruka -> sledeca ruka lokalno; MATCH_OVER ->
// nema "sledece ruke". Online sobe se same nastavljaju automatski (server,
// roomEvents.ts maybeAutoAdvanceHand) — ovo dugme online samo TRAZI od
// servera da to uradi ODMAH (preskace preostalo cekanje tajmera, ili je
// jedini nacin napred posle "Pogledaj karte" koje tajmer trajno iskljuci).
function resultAction() {
  if (mode === 'online') {
    if (game.state.phase === 'MATCH_OVER') {
      // BAG (uzivo prijavljen: "2 igraca zavrsila na soba ekranu umesto
      // pocetne") — ranije se ovde SAMO menjao prikaz (goToHomeScreen), bez
      // ciscenja online-in-game klase/myRoomCode/dugmadi za sto. Ostatak
      // stanja od (sad mrtve) sobe je ostajao zakacen, pa je sledeci "Igraj
      // online"/room:info mogao da zavrsi u nekonzistentnom stanju. Isti
      // reset kao doLeaveMatch().
      // BAG (uzivo prijavljen: zatvorio MATCH_OVER modal, otisao na Moje
      // partije, vratio se — modal se OPET otvorio) — server je i dalje
      // mislio da je ovaj korisnik u toj (vec zavrsenoj) sobi, jer reconnect
      // rezervise sediste neograniceno dok se eksplicitno ne oslobodi. Sledeci
      // page reload (npr. bas ta poseta /matches.html) je reconnect-ovao pravo
      // nazad u istu MATCH_OVER sobu. Obavesti server da je ovaj korisnik
      // gotov sa ovom (zavrsenom) sobom, ne cekaj da se to samo desi.
      onlineSocket.emit('game:leaveFinishedMatch', {});
      document.body.classList.remove('online-in-game');
      myRoomCode = null;
      $('chatToggleBtn').style.display = 'none';
      $('chatScreen').classList.remove('open');
      $('matchMenuBtn').style.display = 'none';
      closeMatchMenu();
      $('peekHomeBtn').style.display = 'none';
      $('backToTableBtn').style.display = 'none';
      mySeat = null;
      awayFromTable = false;
      disconnectedSeats.clear();
      $('resultScreen').classList.remove('active');
      // BAG (uzivo prijavljen: "ne mogu da pocnem novu partiju, stalno me
      // vraca na tabelu") — game.state.phase je OVDE ostajao zaglavljen na
      // 'MATCH_OVER' (ovaj proksi objekat se ne dira dok ne stigne SVEZ
      // game:state za NOVU sobu). Svaki naredni render() poziv (bilo sta ga
      // pokrenulo — polling liste soba, socket event...) je gledao TAJ stari
      // phase i ponovo prikazivao $('resultScreen') PREKO svega, izgledalo je
      // kao da se korisnik ne moze pomeriti sa "kraj partije" ekrana. Postavi
      // na WAITING (bezbedno, TERMINAL_PHASES ga ne prepoznaje) dok stvarno
      // svez state ne stigne za sledecu sobu/partiju.
      game.state.phase = 'WAITING';
      goToHomeScreen();
    } else {
      onlineSocket.emit('game:dealNext', {}, (res) => {
        if (res?.error) { console.warn('[online] game:dealNext odbijen:', res.error); showAppToast(`⚠️ ${res.error}`); }
      });
    }
    return;
  }
  if (game.state.phase === 'MATCH_OVER') {
    $('setupScreen').classList.add('active');
    $('resultScreen').classList.remove('active');
    // Isti bag/ista popravka kao gore, za lokalni mod — bez ovoga bi
    // render() (npr. neki odlozen setTimeout) mogao ponovo iskociti na
    // "kraj partije" ekran dok korisnik jos gleda setup ekran.
    game.state.phase = 'WAITING';
  } else {
    nextRound();
  }
}

// "Pogledaj karte" — otkriva sve tri ruke za rundu koja je upravo zavrsena.
// Lokalno je trivijalno (game.state je vec potpuno vidljivo klijentu).
// Online trazi od servera da otkrije (klijent inace vidi samo svoju
// redakovanu ruku) — i to TRAJNO iskljucuje automatski tajmer za ovu rundu
// (server: autoAdvancePaused), tako da posle ovoga samo rucni klik na
// "Deli" (resultAction) nastavlja.
function viewCards() {
  if (mode === 'online') {
    onlineSocket.emit('game:viewCards', {}, (res) => {
      if (res?.error) console.warn('[online] game:viewCards odbijen:', res.error);
    });
    return;
  }
  const s = game.state;
  const hands = [0, 1, 2].map((seat) => {
    const played = s.tricks.flatMap((trick) => trick.filter((tc) => tc.player === seat).map((tc) => tc.card));
    return { seat, name: POS_LABELS[seat], cards: [...played, ...s.players[seat].hand] };
  });
  // Isti bag kao online strana (roomEvents.ts): s.talon je vec prazno u
  // ovom trenutku (nosilac ga je uzeo tokom DISCARDING, prave karte su u
  // s.lastTalon — vidi game.ts discard()).
  renderRevealedHands(hands, s.lastTalon);
}

// Puna-ekranska preglednost (korisnikov zahtev 2026-09-07: "treba da bude
// preko celog ekrana i da se dobro vise svacije") — PRAVE karte (cardEl(),
// isti izgled kao za vreme igranja), jedan red po igracu, jasno naslovljen.
function renderRevealedHands(hands, talon) {
  const content = $('revealedHandsContent');
  content.innerHTML = '';
  // Korisnikov zahtev: talon (2 karte koje niko nije dobio) nedostajao je
  // sa ovog ekrana — bez njega se ne vidi "sta je bilo u talonu" prilikom
  // pregleda cele ruke.
  if (talon && talon.length > 0) {
    const row = el('div', 'revealed-hand-row talon');
    const label = el('div', 'revealed-hand-label', 'Talon');
    row.appendChild(label);
    const cardsWrap = el('div', 'revealed-hand-cards');
    for (const c of talon) cardsWrap.appendChild(cardEl(c, { size: 'small' }));
    row.appendChild(cardsWrap);
    content.appendChild(row);
  }
  for (const h of hands) {
    const row = el('div', `revealed-hand-row p${h.seat}`);
    const label = el('div', 'revealed-hand-label', escapeHtml(h.name ?? POS_LABELS[h.seat]));
    row.appendChild(label);
    const cardsWrap = el('div', 'revealed-hand-cards');
    for (const c of sortHand(h.cards)) {
      cardsWrap.appendChild(cardEl(c, { size: 'small' }));
    }
    row.appendChild(cardsWrap);
    content.appendChild(row);
  }
  $('revealedHandsScreen').classList.add('active');
}

function closeRevealedHands() {
  $('revealedHandsScreen').classList.remove('active');
}
window.closeRevealedHands = closeRevealedHands;

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
  const name = $('loginName').value.trim();
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  $('loginError').textContent = '';
  if (!email || !password) { $('loginError').textContent = 'Unesi email i lozinku.'; return; }
  if (path === '/api/register' && !name) { $('loginError').textContent = 'Unesi ime — to će stajati na tvojoj stolici za stolom.'; return; }
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
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

  // Uzivo prijavljen bag (mobilni korisnik, "stalno greska veze"):
  // socket.io SAM pokusava reconnect posle svakog ispada, ali 'connect_error'
  // se okida na SVAKI neuspeli pokusaj — i pocetni I svaki naredni tokom vec
  // aktivne sesije. Stari kod je na SVAKI takav dogadjaj izbacivao korisnika
  // nazad na login ekran, sto na mobilnom (kratki, normalni padovi signala
  // dok se prelazi izmedju WiFi/mobilnih podataka) izgleda kao neprekidno
  // "greska veze" iako se veza sama vraca za par sekundi. Sad se puna greska
  // prikazuje SAMO ako se JOS NIKAD nije uspesno povezao (pravi neuspeh
  // pocetne konekcije, npr. los token) — ako je vec bio povezan, tiho se
  // pusti da se svoj automatski reconnect sam izbori.
  let hasConnectedOnce = false;
  onlineSocket.on('connect', () => {
    debugLog('socket:connect', { wasConnectedBefore: hasConnectedOnce });
    hasConnectedOnce = true;
    // Uzivo prijavljen bag (mobilni korisnik, "svako malo ispadanje iz
    // sobe"): telefon ima nestabilnu vezu i/ili mobilni OS zna da potpuno
    // izbaci tab iz memorije u pozadini (ne samo prekine socket) — povratak
    // je onda puno osvezavanje stranice. Stariji pokusaji su ili gledali
    // klijentsko stanje koje refresh brise, ili nagadjali kratkim tajmerom
    // koji na losoj mreži moze isteci PRE nego sto server uopste stigne da
    // odgovori. Sad se NISTA ne pretpostavlja ovde — server (vidi
    // registerRoomHandlers) UVEK eksplicitno salje ili room:info+game:state
    // (postoji aktivna soba) ili 'room:none' (ne postoji), pa ekran ceka
    // TAJ odgovor umesto da sam donosi odluku.
    $('roomError').textContent = '';
    startRoomListPolling();
    fetch('/api/me', { headers: { Authorization: 'Bearer ' + onlineToken } })
      .then((r) => r.json())
      .then((data) => {
        if (!data.user) return;
        $('homeGreeting').textContent = `Zdravo, ${data.user.name}!`;
        $('homeAdminBtn').style.display = data.user.is_admin ? '' : 'none';
      })
      .catch(() => {});
  });
  onlineSocket.on('disconnect', (reason) => {
    debugLog('socket:disconnect', { reason });
  });
  // Manager-level dogadjaji (ne socket-level) — beleze SVAKI pokusaj
  // ponovne konekcije, ne samo onaj koji na kraju uspe, da se vidi da li
  // je bilo tihih ispadanja koja se nikad nisu obelodanila kroz 'connect'.
  onlineSocket.io.on('reconnect_attempt', (n) => debugLog('socket:reconnect_attempt', { attempt: n }));
  onlineSocket.io.on('reconnect', (n) => debugLog('socket:reconnect', { attempt: n }));
  onlineSocket.io.on('reconnect_failed', () => debugLog('socket:reconnect_failed', {}));
  onlineSocket.on('connect_error', (err) => {
    debugLog('socket:connect_error', { message: err?.message });
    if (!hasConnectedOnce) {
      // Prava, pocetna konekcija nije uspela (npr. istekao token) — tek
      // ovde ima smisla prekinuti i vratiti na login sa porukom.
      onlineSocket = null;
      $('loginScreen').classList.add('active');
      $('homeScreen').classList.remove('active');
      $('roomScreen').classList.remove('active');
      $('loginError').textContent = 'Greška konekcije: ' + err.message;
    }
    // Vec smo bili povezani — ovo je samo JEDAN neuspeli pokusaj u nizu
    // automatskih reconnect pokusaja (socket.io ovo radi sam po sebi).
    // Ne diramo UI niti gasimo onlineSocket — 'connect' ce se sam okinuti
    // kad veza stvarno uspe da se vrati.
  });
  // Server eksplicitno kaze "nemas aktivnu sobu" (vidi registerRoomHandlers)
  // — SAMO tad je sigurno prikazati pocetni ekran. Ako smo VEC bili za
  // stolom (online-in-game) i ovo stigne, to bi znacilo da nas server vise
  // uopste ne prepoznaje (npr. restart servera je obrisao sobu) — tad
  // pocetni ekran jeste ispravan odgovor, nema kuda drugde da se vratimo.
  onlineSocket.on('room:none', () => {
    document.body.classList.remove('online-in-game');
    $('loginScreen').classList.remove('active');
    $('homeScreen').classList.add('active');
    $('roomScreen').classList.remove('active');
  });
  // Salje se pri (re)konekciji ako korisnik VEC ima aktivnu sobu (M6
  // reconnect) — bez ovoga bi refresh stranice dok se ceka na jos igraca
  // ostavio korisnika bez koda sobe (mySeat/kod se inace gube pri
  // ponovnom ucitavanju stranice, server ih jedini pamti). Preusmeri sa
  // pozdravnog ekrana na sobu, jer tu se kod stvarno vidi.
  onlineSocket.on('room:info', (info) => {
    if (info.seat !== null) mySeat = info.seat;
    if (info.code) { $('roomCodeInput').value = info.code; myRoomCode = info.code; updateRoomJoinButtonState(); }
    if (game.state?.phase === 'WAITING' || !game.state) {
      $('roomStatus').innerHTML = `Kod sobe: <b style="font-size:1.3em">${info.code}</b> — čeka se još igrača...`;
      $('homeScreen').classList.remove('active');
      $('roomScreen').classList.add('active');
    }
  });
  onlineSocket.on('game:state', (state) => {
    debugLog('game:state', {
      phase: state.phase, currentPlayer: state.currentPlayer, mySeat,
      winner: state.winner, kontraLevel: state.kontraLevel,
      expectedKontraPlayer: state.expectedKontraPlayer,
      followChoices: state.followChoices, trickCount: state.trickCount,
    });
    // Obavesti ostale kad neko NAPUSTI (abandonedSeat null → sediste) ili se
    // VRATI (sediste → null) — ranije nije postojao NIKAKAV signal, pa je
    // AI koji je preuzeo delovao kao da je stvarno TAJ igrac ("izgleda da
    // je on licitirao Mogu 4"). Samo za sedista koja nisu MOJE — meni je
    // vec jasno da sam ja otisao/vratio se.
    // BAG (uzivo prijavljen, "pridruzivanje pokvareno"): na PRVOM game:state
    // eventu posle konekcije game.state JOS NE POSTOJI (undefined) — stari
    // kod je citao game.state.abandonedSeat (bez ?.) unutar showAppToast,
    // sto je bacalo TypeError i prekidalo CEO handler PRE `game.state =
    // state`, pa se nikad nije preslo sa ekrana sobe na sto. prevAbandoned
    // normalizuje na null kad god game.state jos ne postoji.
    const prevAbandoned = game.state?.abandonedSeat ?? null;
    if (state.abandonedSeat !== prevAbandoned) {
      if (state.abandonedSeat !== null && state.abandonedSeat !== mySeat) {
        // seatNames vec ima "(napustio)"/"(izbačen)" dodato server-side —
        // skloni to ovde da se ne udvostruci sa "je napustio partiju" ispod.
        const leaverName = (state.players[state.abandonedSeat]?.name ?? '')
          .replace(/\s*\((napustio|izbačen)\)\s*$/, '');
        showAppToast(`🏳️ ${escapeHtml(leaverName)} je napustio partiju — AI igra umesto njega`);
        // Korisnikov zahtev (2026-09-18): dosad je toast+chat bio JEDINI
        // signal — preostali igraci su morali SAMI da se sete da otvore
        // meni (🏳️) i predloze kraj partije, opcija je bila "sakrivena".
        // Ovaj banner aktivno pita: zavrsiti odmah ili nastaviti sa AI na
        // napustenom mestu. Samo za sedece igrace (ne kibiceri, ne sam
        // igrac koji je otisao — njemu mySeat vec postaje null pre ovoga).
        if (mySeat !== null) {
          showAbandonBanner(leaverName);
        }
      } else if (state.abandonedSeat === null && prevAbandoned !== null) {
        if (prevAbandoned !== mySeat) {
          showAppToast(`↩️ ${escapeHtml(state.players[prevAbandoned]?.name ?? '')} se vratio za sto`);
        }
        // Vratio se pre nego sto je iko odlucio "zavrsi/nastavi" — pitanje
        // vise nema smisla, ukloni banner umesto da ostane zaglavljen sa
        // zastarelim tekstom (ne dira endMatchBanners ako tamo trenutno
        // stoji STVARAN glasanje-banner, samo ovaj konkretan marker).
        document.querySelector('#endMatchBanners .abandon-notice-banner')?.remove();
      }
    }
    game.state = state;
    syncHandHistoryFromServer(state.handsHistory);
    // Nova ruka je stvarno pocela (faza vise nije GAME_OVER) — status "ko je
    // sve kliknuo Deli" vazi SAMO za rundu koja je bas zavrsila, ocisti ga.
    if (state.phase !== 'GAME_OVER') dealNextReadySeats = [];
    // NE prelazi na sto dok partija stvarno ne pocne (phase !== WAITING) —
    // bez ove provere, i sam refresh stranice dok se ceka 2./3. igrac (server
    // odmah gurne trenutno, i dalje WAITING, stanje pri reconnect-u) bi
    // pogresno "preskocio" na prazan sto bez ikakvog puta nazad do koda
    // sobe (uzivo prijavljen bag).
    // awayFromTable: korisnik je SVESNO otisao na pocetnu (peekHomeScreen)
    // dok je i dalje seo za stolom — bez ovog uslova bi SVAKI naredni
    // game:state (bilo koja tudja akcija) odmah nasilno vratio na sto,
    // ponistavajuci klik na 🏠 (korisnikov zahtev: "izadje na home page pa
    // da se vrati" — mora ostati na pocetnoj dok SAM ne klikne nazad).
    if (state.phase !== 'WAITING' && !document.body.classList.contains('online-in-game') && !awayFromTable) {
      document.body.classList.add('online-in-game');
      $('loginScreen').classList.remove('active');
      $('homeScreen').classList.remove('active');
      $('roomScreen').classList.remove('active');
      $('setupScreen').classList.remove('active');
      $('chatToggleBtn').style.display = '';
      $('matchMenuBtn').style.display = '';
      $('peekHomeBtn').style.display = '';
      document.querySelector('.top-actions [onclick="restart()"]')?.style.setProperty('display', 'none');
      stopRoomListPolling();
      renderSeats();
    }
    if (state.phase !== 'WAITING' || document.body.classList.contains('online-in-game')) render();
  });
  onlineSocket.on('game:action-rejected', (action) => {
    console.warn('[online] akcija odbijena od servera:', action);
  });
  onlineSocket.on('game:viewingCards', (p) => {
    showAppToast(`👀 ${escapeHtml(p.name)} gleda karte prethodne ruke, sačekajte...`);
  });
  onlineSocket.on('game:handsRevealed', (payload) => {
    renderRevealedHands(payload.hands, payload.talon);
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
  onlineSocket.on('room:invited', (p) => {
    showInviteBanner(p.code, p.fromName);
  });
  onlineSocket.on('room:playerDisconnected', (p) => {
    if (p.seat === mySeat) return;
    // Korisnikov zahtev: ne samo obavestenje — sediste se ODMAH vizuelno
    // "isprazni" (ime uklonjeno) dok se ta osoba ne vrati.
    disconnectedSeats.add(p.seat);
    renderSeats();
    showAppToast(`📵 ${escapeHtml(p.name)} je ispao sa mreže — čeka se povratak...`);
  });
  onlineSocket.on('room:playerReconnected', (p) => {
    disconnectedSeats.delete(p.seat);
    renderSeats();
    if (p.seat === mySeat) return;
    showAppToast(`✅ ${escapeHtml(p.name)} se vratio`);
  });
  // Admin panel (2026-09-17) — isti reset kao uspesan doLeaveMatch(), samo
  // bez emit-a (server je vec izvrsio izbacivanje pre nego sto je poslao ovo).
  onlineSocket.on('room:kicked', () => {
    document.body.classList.remove('online-in-game');
    $('matchMenuBtn').style.display = 'none';
    closeMatchMenu();
    $('peekHomeBtn').style.display = 'none';
    $('backToTableBtn').style.display = 'none';
    $('chatToggleBtn').style.display = 'none';
    $('chatScreen').classList.remove('open');
    mySeat = null;
    awayFromTable = false;
    disconnectedSeats.clear();
    goToHomeScreen();
    showAppToast('Izbačen si iz partije od strane administratora.');
  });
  // Isto, ali stize SVIMA u prisilno zatvorenoj sobi (igraci + kibiceri),
  // ne samo jednom sedistu — nema mySeat pretpostavke.
  onlineSocket.on('room:closed', () => {
    document.body.classList.remove('online-in-game');
    $('matchMenuBtn').style.display = 'none';
    closeMatchMenu();
    $('peekHomeBtn').style.display = 'none';
    $('backToTableBtn').style.display = 'none';
    $('chatToggleBtn').style.display = 'none';
    $('chatScreen').classList.remove('open');
    mySeat = null;
    awayFromTable = false;
    disconnectedSeats.clear();
    goToHomeScreen();
    showAppToast('Administrator je zatvorio ovu sobu.');
  });
  onlineSocket.on('game:dealNextStatus', (p) => {
    dealNextReadySeats = p?.ready ?? [];
    renderResult();
  });
  onlineSocket.on('game:endMatchProposed', (p) => {
    endMatchProposerSeat = p?.byPosition ?? null;
    renderEndMatchBanner(p?.ready ?? [], endMatchProposerSeat);
  });
  onlineSocket.on('game:endMatchStatus', (p) => {
    renderEndMatchBanner(p?.ready ?? [], endMatchProposerSeat);
  });
  onlineSocket.on('game:endMatchCancelled', () => {
    $('endMatchBanners').innerHTML = '';
    showAppToast('Predlog za kraj partije je odbijen.');
  });
  onlineSocket.on('game:matchRankingResult', (p) => {
    lastMatchRankingResult = p;
    renderResult();
  });
  onlineSocket.on('chat:backlog', (msgs) => {
    $('chatLog').innerHTML = '';
    msgs.forEach((m) => appendChatMessageOnline(m, false));
  });
  onlineSocket.on('chat:message', appendChatMessageOnline);
}

function backToSetup() {
  if (onlineSocket) { onlineSocket.disconnect(); onlineSocket = null; }
  stopRoomListPolling();
  document.body.classList.remove('online-in-game');
  mode = '1v2';
  mySeat = null;
  myRoomCode = null;
  awayFromTable = false;
  disconnectedSeats.clear();
  $('loginScreen').classList.remove('active');
  $('homeScreen').classList.remove('active');
  $('roomScreen').classList.remove('active');
  $('chatScreen').classList.remove('open');
  $('chatToggleBtn').style.display = 'none';
  $('matchMenuBtn').style.display = 'none';
    closeMatchMenu();
  $('peekHomeBtn').style.display = 'none';
  $('backToTableBtn').style.display = 'none';
  $('kibicRequestPanel').style.display = 'none';
  $('setupScreen').classList.add('active');
}

function goToRoomScreen() {
  $('homeScreen').classList.remove('active');
  $('roomScreen').classList.add('active');
}

function goToHomeScreen() {
  $('roomScreen').classList.remove('active');
  $('homeScreen').classList.add('active');
}

// "Ustani od stola" bez napustanja partije — soket/sediste ostaju netaknuti
// (za razliku od leaveMatch(), koja predaje AI-ju), samo se PRIKAZ prebaci
// na pocetnu. Tudje akcije (bidding/igranje) i dalje stizu u pozadini, samo
// se ne prikazuju dok se korisnik sam ne vrati.
function peekHomeScreen() {
  if (mode !== 'online') return;
  awayFromTable = true;
  onlineSocket?.emit('room:setAway', {});
  document.body.classList.remove('online-in-game');
  $('roomScreen').classList.remove('active');
  $('setupScreen').classList.remove('active');
  $('homeScreen').classList.add('active');
  $('backToTableBtn').style.display = '';
}
window.peekHomeScreen = peekHomeScreen;

function backToTable() {
  awayFromTable = false;
  onlineSocket?.emit('room:setBack', {});
  disconnectedSeats.clear();
  document.body.classList.add('online-in-game');
  $('homeScreen').classList.remove('active');
  render();
}
window.backToTable = backToTable;

// Bez ovoga nema naina da se udje pod DRUGIM nalogom — onlineToken ostaje
// sacuvan u localStorage i svaki naredni "Igraj online" (pa i sam refresh
// stranice, vidi INIT na dnu) auto-reconnect-uje sa STARIM nalogom,
// preskacuci login formu potpuno (uzivo prijavljena zabuna — "ne mogu da
// se registrujem, vec sam unutra").
function logoutOnline() {
  if (onlineSocket) { onlineSocket.disconnect(); onlineSocket = null; }
  stopRoomListPolling();
  onlineToken = null;
  try { localStorage.removeItem('pref_token'); } catch (e) { /* ok */ }
  document.body.classList.remove('online-in-game');
  mode = '1v2';
  mySeat = null;
  myRoomCode = null;
  awayFromTable = false;
  disconnectedSeats.clear();
  $('homeScreen').classList.remove('active');
  $('roomScreen').classList.remove('active');
  $('chatScreen').classList.remove('open');
  $('chatToggleBtn').style.display = 'none';
  $('matchMenuBtn').style.display = 'none';
    closeMatchMenu();
  $('peekHomeBtn').style.display = 'none';
  $('backToTableBtn').style.display = 'none';
  $('kibicRequestPanel').style.display = 'none';
  $('loginEmail').value = '';
  $('loginName').value = '';
  $('loginPassword').value = '';
  $('loginError').textContent = '';
  $('loginScreen').classList.add('active');
}

// === ONLINE: lista otvorenih soba ===

let roomListInterval = null;

function startRoomListPolling() {
  refreshRoomList();
  refreshOnlineUsers();
  if (roomListInterval) clearInterval(roomListInterval);
  roomListInterval = setInterval(() => { refreshRoomList(); refreshOnlineUsers(); }, 4000);
}

function stopRoomListPolling() {
  if (roomListInterval) { clearInterval(roomListInterval); roomListInterval = null; }
}

function refreshRoomList() {
  if (!onlineSocket) return;
  onlineSocket.emit('room:list', {}, (res) => renderRoomList(res?.rooms ?? []));
}

function refreshOnlineUsers() {
  if (!onlineSocket) return;
  onlineSocket.emit('presence:list', {}, (res) => renderOnlineUsers(res?.users ?? []));
}

// Lista "ko je online" u sobi je ranije bila UVEK razvucena na vrhu ekrana
// (korisnikov zahtev: sakriti iza dugmeta, otvoriti na klik).
function toggleOnlineUsersPanel() {
  const list = $('onlineUsersList');
  list.style.display = list.style.display === 'none' ? '' : 'none';
}
window.toggleOnlineUsersPanel = toggleOnlineUsersPanel;

// Poziva konkretnog online igraca u MOJU trenutnu sobu — server zna koja je
// moja soba (currentRoom() preko userId-a), klijent salje samo cilja.
function inviteOnlineUser(userId, name) {
  if (!onlineSocket) return;
  onlineSocket.emit('room:invite', { userId }, (res) => {
    if (res?.error) { showAppToast(`⚠️ ${res.error}`); return; }
    showAppToast(`📞 Pozivnica poslata: ${name}`);
  });
}
window.inviteOnlineUser = inviteOnlineUser;

// Banner za primljenu pozivnicu — isti obrazac kao kibic-zahtev banner
// (textContent svuda, fromName je tudji unos).
// Korisnikov zahtev (ponovljen): ranije je delio .kibic-request-banner CSS
// (jedan red, tekst+dugmad zbijeni) sa kibic-zahtevom, sto je za DUZI tekst
// poziva ("Ime te poziva u sobu KOD.") delovalo zbijeno/neuredno. Sopstvena
// klasa (.invite-banner) — tekst u SVOM redu, dugmad ispod u redu, jasno
// obojena (zeleno = potvrdi, neutralno = odbaci), kao .leave-confirm-banner
// obrazac koji vec dobro izgleda.
function showInviteBanner(code, fromName) {
  const banner = document.createElement('div');
  banner.className = 'invite-banner';
  const icon = document.createElement('div');
  icon.className = 'invite-banner-icon';
  icon.textContent = '📞';
  const text = document.createElement('div');
  text.className = 'invite-banner-text';
  text.textContent = `${fromName} te poziva u sobu ${code}`;
  const actions = document.createElement('div');
  actions.className = 'invite-banner-actions';
  const join = document.createElement('button');
  join.className = 'bid-btn primary';
  join.textContent = 'Pridruži se';
  join.onclick = () => {
    banner.remove();
    goToRoomScreen();
    $('roomCodeInput').value = code;
    joinRoomOnline();
  };
  const dismiss = document.createElement('button');
  dismiss.className = 'bid-btn';
  dismiss.textContent = 'Zatvori';
  dismiss.onclick = () => banner.remove();
  actions.appendChild(join);
  actions.appendChild(dismiss);
  banner.appendChild(icon);
  banner.appendChild(text);
  banner.appendChild(actions);
  $('kibicBanners').appendChild(banner);
}

function renderOnlineUsers(users) {
  const countEl = $('homeOnlineCount');
  if (countEl) countEl.textContent = `🟢 ${users.length} ${users.length === 1 ? 'igrač' : 'igrača'} online`;
  const toggleCountEl = $('onlineUsersCount');
  if (toggleCountEl) toggleCountEl.textContent = String(users.length);

  const list = $('onlineUsersList');
  if (list) {
    if (users.length === 0) {
      list.innerHTML = '<div class="room-list-empty">Trenutno nema nikog drugog online.</div>';
    } else {
      list.innerHTML = '';
      for (const u of users) {
        // u.name je tudji unos (registrovano ime) — textContent, ne innerHTML
        // (isti razlog kao chat/kibic baneri: XSS).
        const row = document.createElement('div');
        row.className = 'room-list-row';
        const span = document.createElement('span');
        span.textContent = typeof u.rating === 'number' ? `${u.name} (${u.rating})` : u.name;
        row.appendChild(span);
        // Korisnikov zahtev: "mogucnost poziva odredjenog igraca" — salje
        // pozivnicu preko servera (server vec zna MOJU trenutnu sobu, ne
        // treba je slati odavde) na SVE njegove otvorene tabove/uredjaje.
        const inviteBtn = document.createElement('button');
        inviteBtn.className = 'mode-btn';
        inviteBtn.textContent = '📞 Pozovi';
        inviteBtn.onclick = () => inviteOnlineUser(u.userId, u.name);
        row.appendChild(inviteBtn);
        list.appendChild(row);
      }
    }
  }

  const grid = $('onlineUsersGrid');
  if (grid) {
    if (users.length === 0) {
      grid.innerHTML = '<div class="home-empty">Trenutno nema nikog drugog online. Pozovi drugare!</div>';
    } else {
      grid.innerHTML = '';
      for (const u of users) {
        const card = document.createElement('div');
        card.className = 'online-user-card';
        const avatar = document.createElement('div');
        avatar.className = 'avatar-circle';
        avatar.textContent = (u.name || '?').trim().charAt(0).toUpperCase();
        const name = document.createElement('div');
        name.className = 'uname';
        name.textContent = typeof u.rating === 'number' ? `${u.name} (${u.rating})` : u.name; // textContent — isti XSS razlog kao gore
        card.appendChild(avatar);
        card.appendChild(name);
        grid.appendChild(card);
      }
    }
  }
}

// Korisnikov zahtev: "dugme Pridruzi se treba da bude disable ako sam se
// vec pridruzio" — za RUCNI unos koda (ne per-red dugme u listi, koje vec
// ima svoju "Ti si ovde" logiku ispod). Pozvano na svaki unos u polje, i
// ovde (renderRoomList vec radi periodicno preko startRoomListPolling) da
// se stanje samo-ispravi i kad se myRoomCode promeni negde drugde bez da
// korisnik dira polje (npr. posle create/join).
function updateRoomJoinButtonState() {
  const input = $('roomCodeInput');
  const btn = $('roomJoinBtn');
  if (!input || !btn) return;
  const typed = input.value.trim().toUpperCase();
  const alreadyIn = myRoomCode !== null && typed === myRoomCode;
  btn.disabled = alreadyIn;
  btn.title = alreadyIn ? 'Već si u ovoj sobi' : '';
}
window.updateRoomJoinButtonState = updateRoomJoinButtonState;

function renderRoomList(rooms) {
  updateRoomJoinButtonState();
  const countEl = $('homeRoomCount');
  if (countEl) countEl.textContent = `🃏 ${rooms.length} ${rooms.length === 1 ? 'otvorena soba' : 'otvorenih soba'}`;

  const container = $('openRoomsList');
  if (!container) return;
  if (rooms.length === 0) {
    container.innerHTML = '<div class="room-list-empty">Trenutno nema otvorenih soba. Napravi novu!</div>';
    return;
  }
  container.innerHTML = '';
  for (const r of rooms) {
    // r.code je server-generisan iz fiksnog alfanumerickog skupa (nikad
    // korisnicki unos) — innerHTML ovde bezbedan, za razliku od chat/kibic
    // teksta gore koji koristi textContent.
    const row = el('div', 'room-list-row',
      `<span><span class="code">${r.code}</span> <span class="players">(${r.playerCount}/3${r.locked ? ' 🔒' : ''})</span></span>`
    );
    const isMine = r.code === myRoomCode;
    if (isMine) {
      // Korisnikov zahtev: "ne treba dugme Pridruzi se ako je igrac vec
      // pridruzen" — sopstvena soba u listi je samo informativna, ne akcija.
      const tag = el('span', '', 'Ti si ovde');
      tag.style.cssText = 'opacity:0.7;font-weight:600;padding:6px 14px';
      row.appendChild(tag);
    } else {
      const doJoin = () => { $('roomCodeInput').value = r.code; joinRoomOnline(); };
      // Korisnikov zahtev: "klik na to ne radi, treba da te povede u tu sobu"
      // — ceo red je sad klikabilan (ne samo malo dugme), lakse za pogoditi
      // dodirom na telefonu. stopPropagation na dugmetu spreca DUPLI poziv
      // (klik na dugme bi inace probubblovao i na row.onclick ispod).
      row.style.cursor = 'pointer';
      row.onclick = doJoin;
      const btn = el('button', 'mode-btn', 'Pridruži se');
      btn.onclick = (e) => { e.stopPropagation(); doJoin(); };
      row.appendChild(btn);
    }
    container.appendChild(row);
  }
}

// === ONLINE: sobe ===

function createRoomOnline() {
  const initialBule = parseInt($('roomStartBula').value, 10);
  const refePerPlayer = parseInt($('roomRefeCount').value, 10);
  onlineSocket.emit('room:create', { initialBule, refePerPlayer }, (res) => {
    if (res.error) { $('roomError').textContent = res.error; return; }
    mySeat = res.seat;
    myRoomCode = res.code;
    resetHandHistoryForNewRoom();
    $('roomCodeInput').value = res.code;
    $('roomStatus').innerHTML = `Kod sobe: <b style="font-size:1.3em">${res.code}</b> — podeli ga sa drugarima. Čeka se još igrača...`;
    updateRoomJoinButtonState();
  });
}

function joinRoomOnline() {
  const code = $('roomCodeInput').value.trim().toUpperCase();
  if (!code) { $('roomError').textContent = 'Unesi kod sobe.'; return; }
  onlineSocket.emit('room:join', { code }, (res) => {
    if (res.error) { $('roomError').textContent = res.error; return; }
    mySeat = res.seat;
    myRoomCode = res.code;
    resetHandHistoryForNewRoom();
    $('roomStatus').textContent = `Pridružen sobi ${res.code}, čeka se početak...`;
    updateRoomJoinButtonState();
  });
}

function joinAsSpectatorOnline() {
  const code = $('roomCodeInput').value.trim().toUpperCase();
  if (!code) { $('roomError').textContent = 'Unesi kod sobe.'; return; }
  onlineSocket.emit('room:join-as-spectator', { code }, (res) => {
    if (res.error) { $('roomError').textContent = res.error; return; }
    mySeat = null;
    myRoomCode = res.code;
    resetHandHistoryForNewRoom();
    $('roomStatus').textContent = `Kibiciraš sobu ${res.code}.`;
    $('kibicRequestPanel').style.display = '';
    updateRoomJoinButtonState();
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

// === ONLINE: napusti partiju ===

// Korisnikov zahtev: mora da moze da napusti partiju usred igre i "snosi
// posledice" — ostaje zamrznut na trenutnoj buli, AI (server/src/ai/aiSeat.ts,
// ista logika kao AI ovde u app.js) preuzima njegovo mesto do kraja RUKE
// (online sobe i inace igraju samo jednu ruku, vidi server plan — nista
// dalje se ne nastavlja posle nje). Isti plain-DOM banner obrazac kao kibic
// zahtev (showKibicRequestBanner) — bez native confirm()/alert(), app ih
// nigde ne koristi.
// === ONLINE: jedinstveni meni "opcije partije" (predlog za prekid / napusti) ===
// Korisnikov zahtev (2026-09-10): "ne trebaju nam 2 ikonice... klikom na
// nju treba da ima stavka o predlogu za prekid, u dnu treba da ima napusti
// svakako dugme".
function toggleMatchMenu() {
  const panel = $('matchMenuPanel');
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? '' : 'none';
}
function closeMatchMenu() {
  const panel = $('matchMenuPanel');
  if (panel) panel.style.display = 'none';
}
window.toggleMatchMenu = toggleMatchMenu;
window.closeMatchMenu = closeMatchMenu;
// Zatvori meni na klik BILO GDE van njega — isti obrazac kao svaki drugi
// dropdown/popover.
document.addEventListener('click', (e) => {
  const wrap = document.querySelector('.match-menu-wrap');
  if (wrap && !wrap.contains(e.target)) closeMatchMenu();
});

function leaveMatch() {
  if (mode !== 'online' || !onlineSocket || mySeat === null) return;
  const myBula = game.state?.bulas?.[mySeat];
  const bulaText = typeof myBula === 'number' ? `Ostaješ zamrznut na buli ${myBula}. ` : '';

  const banner = document.createElement('div');
  banner.className = 'leave-confirm-banner';
  const span = document.createElement('span');
  span.textContent = `Sigurno želiš da napustiš partiju? ${bulaText}AI preuzima tvoje mesto do kraja ove ruke.`;
  banner.appendChild(span);
  const actions = document.createElement('div');
  actions.className = 'leave-confirm-actions';
  const confirmBtn = document.createElement('button');
  confirmBtn.id = 'leaveConfirmBtn';
  confirmBtn.className = 'bid-btn danger';
  confirmBtn.textContent = 'Napusti';
  confirmBtn.onclick = () => { banner.remove(); doLeaveMatch(); };
  const cancelBtn = document.createElement('button');
  cancelBtn.id = 'leaveCancelBtn';
  cancelBtn.className = 'bid-btn';
  cancelBtn.textContent = 'Odustani';
  cancelBtn.onclick = () => banner.remove();
  actions.appendChild(confirmBtn);
  actions.appendChild(cancelBtn);
  banner.appendChild(actions);
  $('leaveConfirmBanners').appendChild(banner);
}

function showAppToast(text) {
  const toast = $('appToast');
  toast.textContent = text;
  toast.style.display = 'block';
  clearTimeout(showAppToast._t);
  showAppToast._t = setTimeout(() => { toast.style.display = 'none'; }, 3500);
}

function doLeaveMatch() {
  onlineSocket.emit('game:leave', {}, (res) => {
    if (res?.error) { console.warn('[online] game:leave odbijen:', res.error); return; }
    document.body.classList.remove('online-in-game');
    $('matchMenuBtn').style.display = 'none';
    closeMatchMenu();
    $('peekHomeBtn').style.display = 'none';
    $('backToTableBtn').style.display = 'none';
    $('chatToggleBtn').style.display = 'none';
    $('chatScreen').classList.remove('open');
    mySeat = null;
    awayFromTable = false;
    disconnectedSeats.clear();
    goToHomeScreen();
    showAppToast(`Napustio si partiju na buli ${res.frozenBula}.`);
  });
}

// === ONLINE: predlog za kraj partije ===
// Korisnikov zahtev (2026-09-10): bilo koji aktivan igrac moze predloziti
// da se partija odmah zavrsi (otpis RULES 9.6) umesto da se ceka da bule
// prirodno padnu na 0 — ili (ako je neko vec napustio sto) da preostala
// dva igraca zavrse partiju medjusobno, zamrzavajuci napustenog na
// njegovoj trenutnoj buli. Isti "banner + status dok se ne skupe svi
// glasovi" obrazac kao showKibicRequestBanner/leaveMatch, server je
// autoritativan (activeSeatsForRoom vec iskljucuje napusteno sediste).

// Korisnikov zahtev (2026-09-10): "poziv za kraj partije treba da ima
// konfirmaciju kao i svi ostali ovakvi elementi" — isti "da li si
// siguran?" banner obrazac kao leaveMatch(), PRE nego sto se predlog
// stvarno posalje ostalima.
function proposeEndMatch() {
  if (mode !== 'online' || !onlineSocket || mySeat === null) return;
  const banner = document.createElement('div');
  banner.className = 'end-match-banner';
  const span = document.createElement('span');
  span.textContent = 'Predložiti ostalim igračima da se partija odmah završi (bule se otpisuju po pravilima)?';
  banner.appendChild(span);
  const actions = document.createElement('div');
  actions.className = 'end-match-actions';
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'bid-btn primary';
  confirmBtn.textContent = 'Predloži';
  confirmBtn.onclick = () => { banner.remove(); doProposeEndMatch(); };
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'bid-btn';
  cancelBtn.textContent = 'Odustani';
  cancelBtn.onclick = () => banner.remove();
  actions.appendChild(confirmBtn);
  actions.appendChild(cancelBtn);
  banner.appendChild(actions);
  $('endMatchBanners').appendChild(banner);
}
window.proposeEndMatch = proposeEndMatch;

function doProposeEndMatch() {
  onlineSocket.emit('game:proposeEndMatch', {}, (res) => {
    if (res?.error) { showAppToast(`⚠️ ${res.error}`); return; }
  });
}

// Korisnikov zahtev (2026-09-18): kad neko napusti/bude izbacen, preostali
// igraci treba AKTIVNO da budu pitani da li zele da zavrse partiju ili da
// nastave sa AI na tom mestu — ne samo pasivan toast + sakrivena opcija u
// meniju. "Zavrsi partiju" ovde ide DIREKTNO na doProposeEndMatch() (bez
// proposeEndMatch()-ovog sopstvenog "da li si siguran?" koraka) jer je ovaj
// banner sam po sebi vec ta potvrda — dupli confirm bi bio nezgrapan.
function showAbandonBanner(leaverName) {
  const banner = document.createElement('div');
  banner.className = 'end-match-banner abandon-notice-banner';
  const span = document.createElement('span');
  span.textContent = `${leaverName} je napustio partiju, AI igra umesto njega. Zavrsiti partiju odmah, ili nastaviti sa AI na njegovom mestu?`;
  banner.appendChild(span);
  const actions = document.createElement('div');
  actions.className = 'end-match-actions';
  const endBtn = document.createElement('button');
  endBtn.className = 'bid-btn primary';
  endBtn.textContent = '🤝 Završi partiju';
  endBtn.onclick = () => { banner.remove(); doProposeEndMatch(); };
  const continueBtn = document.createElement('button');
  continueBtn.className = 'bid-btn';
  continueBtn.textContent = '▶️ Nastavi sa AI';
  continueBtn.onclick = () => banner.remove();
  actions.appendChild(endBtn);
  actions.appendChild(continueBtn);
  banner.appendChild(actions);
  $('endMatchBanners').appendChild(banner);
}

function renderEndMatchBanner(readySeats, proposerSeat) {
  const container = $('endMatchBanners');
  if (!container) return;
  container.innerHTML = '';
  if (!readySeats || readySeats.length === 0) return;
  const iAmReady = mySeat !== null && readySeats.includes(mySeat);
  const readyNames = readySeats.map(s => seatDisplayName(s)).join(', ');

  const banner = document.createElement('div');
  banner.className = 'end-match-banner';
  const span = document.createElement('span');
  span.textContent = iAmReady
    ? `Predlog za rani kraj partije — čeka se: svi ostali aktivni igrači.`
    : `${seatDisplayName(proposerSeat)} predlaže da se partija odmah završi (otpis po pravilima). Slažeš li se?`;
  banner.appendChild(span);
  const status = document.createElement('div');
  status.className = 'end-match-status';
  status.textContent = `Prihvatili: ${readyNames}`;
  banner.appendChild(status);

  if (!iAmReady) {
    const actions = document.createElement('div');
    actions.className = 'end-match-actions';
    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'bid-btn primary';
    acceptBtn.textContent = 'Prihvati';
    acceptBtn.onclick = () => onlineSocket.emit('game:endMatchVote', { accept: true });
    const declineBtn = document.createElement('button');
    declineBtn.className = 'bid-btn danger';
    declineBtn.textContent = 'Odbij';
    declineBtn.onclick = () => onlineSocket.emit('game:endMatchVote', { accept: false });
    actions.appendChild(acceptBtn);
    actions.appendChild(declineBtn);
    banner.appendChild(actions);
  }
  container.appendChild(banner);
}

// === ONLINE: chat ===

let chatUnreadCount = 0;
function updateChatBadge() {
  const badge = $('chatUnreadBadge');
  if (!badge) return;
  if (chatUnreadCount > 0) {
    badge.textContent = chatUnreadCount > 9 ? '9+' : String(chatUnreadCount);
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

function toggleChat() {
  $('chatScreen').classList.toggle('open');
  if ($('chatScreen').classList.contains('open')) {
    chatUnreadCount = 0;
    updateChatBadge();
  }
}

// Minimizuje na samo naslovnu traku (korisnikov zahtev — telefon: otvoren
// chat prekriva karte u ruci) bez potpunog zatvaranja panela.
function toggleChatMinimize() {
  const minimized = $('chatScreen').classList.toggle('minimized');
  $('chatMinimizeBtn').textContent = minimized ? '▢' : '▁';
  $('chatMinimizeBtn').title = minimized ? 'Otvori' : 'Minimizuj';
  if (!minimized) $('chatScreen').classList.remove('has-unread');
}
window.toggleChatMinimize = toggleChatMinimize;

function sendChatOnline() {
  const input = $('chatInput');
  const text = input.value.trim();
  if (!text || !onlineSocket) return;
  onlineSocket.emit('chat:send', { text });
  input.value = '';
}

function appendChatMessageOnline(m, isLive = true) {
  // textContent (ne innerHTML) — m.text/m.name su tudji unos (chat poruka,
  // email drugog igraca), nikad ih ne tretirati kao HTML. Ime i tekst idu u
  // ODVOJENE cvorove (oba i dalje preko textContent/createTextNode, ne
  // interpolacija u HTML) da ime moze dobiti svoju boju po igracu —
  // korisnikov zahtev: "razdvojiti poruke od razlicitih igraca bojama".
  const log = $('chatLog');
  const isPlayer = m.role === 'player';
  const who = isPlayer ? POS_LABELS[m.seat] : `${m.name} (kibicer)`;
  const div = document.createElement('div');
  div.className = 'chat-msg' + (isPlayer ? ` p${m.seat}` : ' spectator');
  const nameSpan = document.createElement('span');
  nameSpan.className = 'chat-msg-name';
  nameSpan.textContent = `${who}: `;
  div.appendChild(nameSpan);
  div.appendChild(document.createTextNode(m.text));
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  // Korisnikov zahtev: poruke su stizale nevidljivo dok je chat zatvoren, i
  // sam znak/zvuk mu nije bio dovoljan ("i dalje poruke se ne otvaraju same
  // kad stignu") — chat panel se sad SAM otvara na svaku NOVU poruku (ne i
  // na chat:backlog reprizu istorije pri ulasku/reconnect-u, vidi isLive,
  // inace bi se panel nepotrebno otvarao samim ulaskom u sobu).
  if (isLive && !$('chatScreen').classList.contains('open')) {
    $('chatScreen').classList.add('open');
    chatUnreadCount = 0;
    updateChatBadge();
    sfx.chatMessage();
  } else if (isLive && $('chatScreen').classList.contains('minimized')) {
    // Korisnikov zahtev: minimize je RANIJE bio ponisten na svaku novu
    // poruku (dizao se sam) — "bolje da ima notifikaciju da pocrveni, ali
    // da se ne dize dok korisnik ne klikne". Sad SAMO vizuelna oznaka
    // (crveni sjaj na naslovnoj traci), minimizovano stanje ostaje dok
    // korisnik sam ne klikne da otvori.
    $('chatScreen').classList.add('has-unread');
    sfx.chatMessage();
  }
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
window.viewCards = viewCards;
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
window.goToRoomScreen = goToRoomScreen;
window.goToHomeScreen = goToHomeScreen;
window.logoutOnline = logoutOnline;
window.createRoomOnline = createRoomOnline;
window.joinRoomOnline = joinRoomOnline;
window.joinAsSpectatorOnline = joinAsSpectatorOnline;
window.toggleLockOnline = toggleLockOnline;
window.refreshRoomList = refreshRoomList;
window.requestKibicOnline = requestKibicOnline;
window.toggleChat = toggleChat;
window.sendChatOnline = sendChatOnline;
window.leaveMatch = leaveMatch;

// INIT
renderSeats();
// Ako vec postoji sacuvan token (ranija online sesija), pokusaj sam da se
// povezes umesto da coveka vratis na setup ekran — bez ovoga bi SVAKI
// refresh stranice tokom online igre (ili dok se ceka jos igraca) izgubio
// sesiju i ostavio korisnika "izgubljenog", jer se ranije konekcija
// pokretala SAMO rucnim klikom na "Igraj online" (uzivo prijavljen bag).
if (onlineToken) {
  $('loginScreen').classList.add('active');
  $('loginError').textContent = 'Povezivanje...';
  connectOnlineSocket();
} else {
  $('setupScreen').classList.add('active');
}
