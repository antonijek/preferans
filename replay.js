// Pregled odigrane partije ruku po ruku (korisnikov zahtev 2026-10-20: "da
// vidimo svaku ruku rekonstruisanu" — analiza gresaka AI-ja, zalbe u ligi).
// Sve tri ruke otvorene, korak po korak: deljenje → skart → svaka karta.
// Podatke (licitacija, dobitnici stihova, pocetne ruke) racuna server
// (server/src/replayModel.ts); ovde se samo crta. Link nosi tacno mesto:
// ?id=PARTIJA&ruka=N&korak=K. Imena su korisnicki unos — samo textContent.

import { $, el } from './dom.js';
import { sortHand, cardImageSrc } from './card-order.js';

const STEP_MS = 900;
const params = new URLSearchParams(location.search);
const matchId = Number(params.get('id'));

let data = null;
let handIdx = 0;
let step = 0;
let timer = null;

const cardKey = (c) => `${c.rank}${c.suit}`;
// kad jedan branilac ne dodje, stih ima 2 karte — pun stih je najduzi u ruci
const trickSize = (h) => Math.max(2, ...h.tricks.map((t) => t.cards.length));
const cardText = (c) => `${c.rank}${c.suit}`;

function cardImg(c, cls = '') {
  const img = el('img', `rp-card ${cls}`);
  img.src = cardImageSrc(c);
  img.alt = cardText(c);
  img.width = 60;
  img.height = 84;
  img.draggable = false;
  return img;
}

const nameOf = (p) => `${data.bots[p] ? '🤖 ' : ''}${data.names[p]}`;
const me = () => (data.mySeat >= 0 ? data.mySeat : 0);

/** Koraci ruke: 0 = deljenje, (1 = skart ako je nosilac uzeo talon), pa po jedna odigrana karta. */
function stepsOf(h) {
  const plays = [];
  h.tricks.forEach((t, ti) => t.cards.forEach((c, ci) => plays.push({ trick: ti, idx: ci, ...c })));
  const hasDiscard = !!h.discard && h.discard.length > 0;
  return { plays, hasDiscard, total: 1 + (hasDiscard ? 1 : 0) + plays.length };
}

function handsAt(h, s) {
  const { plays, hasDiscard } = stepsOf(h);
  const hands = h.hands.map((cards) => cards.slice());
  if (hasDiscard && s >= 1) {
    const out = new Set(h.discard.map(cardKey));
    hands[h.declarer] = [...hands[h.declarer], ...h.talon].filter((c) => !out.has(cardKey(c)));
  }
  const played = plays.slice(0, Math.max(0, s - (hasDiscard ? 1 : 0)));
  for (const p of played) hands[p.player] = hands[p.player].filter((c) => cardKey(c) !== cardKey(p.card));
  return { hands, played };
}

function tricksWonAt(h, played) {
  const won = [0, 0, 0];
  const lastTrick = played.length ? played[played.length - 1].trick : -1;
  for (let t = 0; t <= lastTrick; t++) {
    const done = played.filter((p) => p.trick === t).length === trickSize(h);
    if (done && h.tricks[t].winner !== null) won[h.tricks[t].winner]++;
  }
  return won;
}

function renderHandOptions() {
  const sel = $('rpHandSelect');
  sel.innerHTML = '';
  data.hands.forEach((h, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    const kontra = h.kontraLevel ? ' ×' : '';
    o.textContent = h.game
      ? `Ruka ${i + 1} — ${nameOf(h.declarer)}: ${h.game}${kontra} ${h.passed ? '✓' : '✗'}`
      : `Ruka ${i + 1} — svi dalje`;
    sel.appendChild(o);
  });
}

function infoLine(label, content) {
  const row = el('div', 'rp-info-row');
  row.appendChild(el('span', 'rp-info-label', label));
  if (typeof content === 'string') row.appendChild(document.createTextNode(content));
  else row.appendChild(content);
  return row;
}

function cardsRow(cards) {
  const box = el('span', 'rp-mini-cards');
  for (const c of cards) box.appendChild(cardImg(c, 'mini'));
  return box;
}

function renderInfo(h) {
  const box = $('rpInfo');
  box.innerHTML = '';
  const contract = `${nameOf(h.declarer)}: ${h.game}${h.kontraLevel ? ` (${h.kontraLevel})` : ''} — ${h.passed ? 'prošao' : 'pao'}`;
  box.appendChild(h.game ? infoLine('Nosilac', contract) : infoLine('Igra', 'svi su rekli dalje'));
  if (h.dealer !== null) box.appendChild(infoLine('Delilac', nameOf(h.dealer)));
  if (h.bids) box.appendChild(infoLine('Licitacija', h.bids.map((b) => `${nameOf(b.player)} ${b.label}`).join(' · ') || '—'));
  const follow = h.follow.map((f, p) => (f ? `${nameOf(p)} ${f === 'DODJEM' ? 'dođem' : f === 'NE_DODJEM' ? 'ne dođem' : f}` : null)).filter(Boolean);
  if (follow.length) box.appendChild(infoLine('Pratnja', follow.join(' · ')));
  if (h.kontra) box.appendChild(infoLine('Kontra', h.kontra.map((k) => `${nameOf(k.player)} ${k.level.toLowerCase()}`).join(' · ')));
  if (h.caller !== null) box.appendChild(infoLine('Poziv', `${nameOf(h.caller)} → ${h.callee !== null ? nameOf(h.callee) : 'niko'}`));
  if (h.talon.length) box.appendChild(infoLine('Talon', cardsRow(h.talon)));
  if (h.discard?.length) box.appendChild(infoLine('Škart', cardsRow(h.discard)));
  if (h.claimedBy != null) box.appendChild(infoLine('Nosim sve', `${nameOf(h.claimedBy)} — ostali su se složili`));
  box.appendChild(infoLine('Posle ruke', `bule ${h.bulasAfter.join(' / ')} · supe ${h.supeDelta.join(' / ')}`));
}

function renderSeat(boxId, h, p, cards, won) {
  const box = $(boxId);
  box.innerHTML = '';
  const head = el('div', 'rp-seat-head');
  const name = el('span', 'rp-seat-name');
  name.textContent = nameOf(p);
  head.appendChild(name);
  const tags = [];
  if (h.game && p === h.declarer) tags.push(`nosilac · ${h.game}`);
  if (p === h.dealer) tags.push('delilac');
  tags.push(`štihova ${won[p]}`);
  head.appendChild(el('span', 'rp-seat-tags', tags.join(' · ')));
  box.appendChild(head);
  box.classList.toggle('declarer', !!h.game && p === h.declarer);
  const row = el('div', 'rp-hand');
  for (const c of sortHand(cards)) row.appendChild(cardImg(c));
  if (cards.length === 0) row.appendChild(el('span', 'rp-empty', '—'));
  box.appendChild(row);
}

function renderTrick(h, played) {
  const box = $('rpTrick');
  box.innerHTML = '';
  const last = played[played.length - 1];
  if (!last) {
    box.appendChild(el('div', 'rp-empty', 'Igra još nije počela'));
    return;
  }
  const t = last.trick;
  const cards = played.filter((p) => p.trick === t);
  const complete = cards.length === trickSize(h);
  for (const p of cards) {
    const slot = el('div', 'rp-trick-card');
    if (complete && h.tricks[t].winner === p.player) slot.classList.add('winner');
    slot.appendChild(cardImg(p.card));
    const who = el('div', 'rp-trick-who');
    who.textContent = nameOf(p.player);
    slot.appendChild(who);
    box.appendChild(slot);
  }
}

function stepText(h, s) {
  const { plays, hasDiscard, total } = stepsOf(h);
  if (s === 0) return `Deljenje — ${h.complete ? 'početne ruke' : 'stari zapis: vide se samo odigrane karte'}`;
  if (hasDiscard && s === 1) return `${nameOf(h.declarer)} uzima talon i škartira ${h.discard.map(cardText).join(' ')}`;
  const p = plays[s - 1 - (hasDiscard ? 1 : 0)];
  const claim = h.claimedBy != null ? `, ${nameOf(h.claimedBy)} nosi ostalo` : '';
  const end = s === total - 1 && h.game ? ` — kraj ruke${claim}, ${h.passed ? 'prošao' : 'pao'}` : '';
  return `Štih ${p.trick + 1}, karta ${p.idx + 1}: ${nameOf(p.player)} ${cardText(p.card)}${end}`;
}

function render() {
  const h = data.hands[handIdx];
  const { total } = stepsOf(h);
  step = Math.max(0, Math.min(step, total - 1));
  $('rpHandSelect').value = String(handIdx);
  renderInfo(h);
  const { hands, played } = handsAt(h, step);
  const won = tricksWonAt(h, played);
  const m = me();
  renderSeat('rpSeatA', h, (m + 1) % 3, hands[(m + 1) % 3], won);
  renderSeat('rpSeatB', h, (m + 2) % 3, hands[(m + 2) % 3], won);
  renderSeat('rpSeatMe', h, m, hands[m], won);
  renderTrick(h, played);
  $('rpStepText').textContent = `${stepText(h, step)}  (korak ${step + 1}/${total})`;
  $('rpPrevHand').disabled = handIdx === 0;
  $('rpNextHand').disabled = handIdx === data.hands.length - 1;
  $('rpPrev').disabled = step === 0;
  $('rpFirst').disabled = step === 0;
  $('rpNext').disabled = step === total - 1;
  $('rpLast').disabled = step === total - 1;
  $('rpNote').textContent = h.complete ? '' : 'Ova partija je odigrana pre 20. 10. 2026: početne ruke i licitacija tada nisu čuvani.';
  history.replaceState(null, '', `?id=${data.id}&ruka=${handIdx + 1}&korak=${step + 1}`);
}

function stopPlay() {
  clearInterval(timer);
  timer = null;
  $('rpPlay').textContent = '▶ Pusti';
}

function go(delta) {
  stopPlay();
  step += delta;
  render();
}

function setHand(i) {
  stopPlay();
  handIdx = Math.max(0, Math.min(i, data.hands.length - 1));
  step = 0;
  render();
}

function togglePlay() {
  if (timer) { stopPlay(); return; }
  const { total } = stepsOf(data.hands[handIdx]);
  if (step >= total - 1) step = 0;
  $('rpPlay').textContent = '⏸ Stani';
  timer = setInterval(() => {
    if (step >= stepsOf(data.hands[handIdx]).total - 1) { stopPlay(); return; }
    step++;
    render();
  }, STEP_MS);
}

async function copyPlaceLink() {
  const url = location.href;
  const btn = $('rpCopyLink');
  try {
    await navigator.clipboard.writeText(url);
    const old = btn.textContent;
    btn.textContent = 'Kopirano ✓';
    setTimeout(() => { btn.textContent = old; }, 2000);
  } catch (e) {
    // pregledac nije dao — link u polju, da se kopira rukom
    const field = $('rpLinkField');
    field.hidden = false;
    field.value = url;
    field.focus();
    field.select();
  }
}

function showError(text) {
  $('rpSub').textContent = '';
  $('rpError').textContent = text;
}

async function load() {
  let token = null;
  try { token = localStorage.getItem('pref_token'); } catch (e) { console.warn('[pregled] localStorage nedostupan:', e); }
  if (!token) { showError('Prijavi se u igri (Igraj online), pa otvori pregled ponovo.'); return; }
  if (!Number.isInteger(matchId)) { showError('Nedostaje broj partije u linku.'); return; }
  let res;
  try {
    res = await fetch(`/api/replay/${matchId}`, { headers: { Authorization: `Bearer ${token}` } });
    data = await res.json();
  } catch (e) {
    showError(`Partija nije učitana: ${e.message}`);
    return;
  }
  if (!res.ok) { showError(data.error || `Greška ${res.status}`); return; }
  if (data.hands.length === 0) { showError('U ovoj partiji nema zapisanih ruku.'); return; }
  $('rpTitle').textContent = `Partija #${data.id}`;
  const when = new Date(data.endedAt).toLocaleString('sr-Latn-RS', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const reason = { natural: 'odigrana do kraja', agreed: 'prekid dogovorom', leave: 'prekid posle napuštanja' }[data.reason] ?? data.reason;
  $('rpSub').textContent = `${when} · ${data.hands.length} ruku · ${reason}${data.league ? ` · liga „${data.league.name}“` : ''} · ${data.names.join(', ')}`;
  renderHandOptions();
  $('rpBody').hidden = false;
  handIdx = Math.max(0, (Number(params.get('ruka')) || 1) - 1);
  handIdx = Math.min(handIdx, data.hands.length - 1);
  step = Math.max(0, (Number(params.get('korak')) || 1) - 1);
  render();
}

$('rpHandSelect').onchange = (e) => setHand(Number(e.target.value));
$('rpPrevHand').onclick = () => setHand(handIdx - 1);
$('rpNextHand').onclick = () => setHand(handIdx + 1);
$('rpFirst').onclick = () => go(-Infinity);
$('rpPrev').onclick = () => go(-1);
$('rpNext').onclick = () => go(1);
$('rpLast').onclick = () => go(Infinity);
$('rpPlay').onclick = togglePlay;
$('rpCopyLink').onclick = copyPlaceLink;
document.addEventListener('keydown', (e) => {
  if (!data || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowRight') go(1);
  else if (e.key === 'ArrowLeft') go(-1);
});
load();
