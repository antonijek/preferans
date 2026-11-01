// „Pref meseca“ u Sobi (korisnikov zahtev 2026-11-01, uzor Lora monthly.js): mesečna tabela za sve igrače,
// računa je server/src/monthly.ts. Dve kategorije (dugmad „Ukupno“ i „Prosek“): zbir bodova i bodovi po meču.

import { $, el } from './dom.js';

const SHOWN = 10;
const REFRESH_MS = 60_000;
const NOTE = 'Svaki online meč, i sa računarom: 1. mesto 10, 2. mesto 5, 3. mesto 1 bod (isti rezultat deli bodove). '
  + 'Prekinut meč se računa posle 10 ruku. Prvog u mesecu kreće se ispočetka.';
const avgNote = (min) => `Prosek = bodovi podeljeni brojem mečeva. * Za mesto u tabeli proseka potrebno je najmanje ${min} mečeva u mesecu.`;

/** el() iz dom.js puni innerHTML — imena igrača idu samo kao tekst */
function t(tag, cls, text) {
  const e = el(tag, cls);
  if (text !== undefined) e.textContent = text;
  return e;
}

const num = (n) => Number(n).toLocaleString('sr-RS', { maximumFractionDigits: 1 });
/** prosek uvek sa jednom decimalom (7,0 · 6,4), da kolona bude ujednačena */
const avgNum = (n) => Number(n).toLocaleString('sr-RS', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** 1 bod, 2 boda, 5 bodova, 21 bod */
function plural(n, one, few, many) {
  const d = n % 10, h = n % 100;
  if (d === 1 && h !== 11) return one;
  return d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many;
}
/** 7,5 boda */
const pointsWord = (n) => (Number.isInteger(n) ? plural(n, 'bod', 'boda', 'bodova') : 'boda');
const daysWord = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'dan' : 'dana');

/** izabrana kategorija: 'sum' (zbir) ili 'avg' (prosek) */
let tab = 'sum';

function head(v) {
  const h = t('div', 'month-head');
  h.append(t('h2', 'section-title', `🏆 Pref meseca · ${v.month}`),
    t('span', 'month-left', v.daysLeft ? `još ${v.daysLeft} ${daysWord(v.daysLeft)}` : 'poslednji dan'));
  return h;
}

function crown(v) {
  const box = t('div', 'month-crown');
  const txt = t('div');
  if (v.prev) {
    txt.append(t('small', '', `Pobednik ${v.prev.month}`),
      t('b', '', `${v.prev.name} · ${num(v.prev.points)} ${pointsWord(v.prev.points)}`));
  } else {
    txt.append(t('small', '', 'Pobednik prošlog meseca'), t('b', '', `Prvi pobednik — 1. ${v.nextOf}`));
  }
  if (v.prevAvg) txt.append(t('span', 'month-crown-avg', `⭐ Najbolji prosek: ${v.prevAvg.name} · ${avgNum(v.prevAvg.avg)} po meču`));
  box.append(t('span', 'month-crown-ic', '👑'), txt);
  return box;
}

function tabs(redraw) {
  const seg = t('div', 'month-seg');
  for (const [key, id, label] of [['sum', 'monthSum', 'Ukupno'], ['avg', 'monthAvg', 'Prosek']]) {
    const b = t('button', key === tab ? 'on' : '', label);
    b.type = 'button';
    b.id = id;
    b.setAttribute('aria-pressed', String(key === tab));
    b.addEventListener('click', () => { tab = key; redraw(); });
    seg.append(b);
  }
  return seg;
}

function table(v, myId) {
  const avg = tab === 'avg';
  const tbl = t('table', 'month-table');
  const hr = t('tr');
  for (const h of ['#', 'Igrač', 'Mečeva', avg ? 'Prosek' : 'Bodova']) hr.append(t('th', '', h));
  tbl.createTHead().append(hr);
  const body = tbl.createTBody();
  // prvih deset, a ja i ako sam niže
  const rows = (avg ? v.avgRows : v.rows).filter((r, i) => i < SHOWN || r.userId === myId);
  if (!rows.length) {
    const td = t('td', 'month-empty', 'Ovog meseca još nema odigranih mečeva. Budi prvi!');
    td.colSpan = 4;
    const tr = t('tr');
    tr.append(td);
    body.append(tr);
  }
  for (const r of rows) {
    // u proseku: ko nema dovoljno mečeva, stoji ispod, bez mesta i sa zvezdicom (objašnjenje ispod tabele)
    const short = avg && !r.ranked;
    const tr = t('tr', [r.userId === myId ? 'mine' : '', short ? 'short' : ''].join(' ').trim());
    const rank = t('td');
    rank.append(short ? t('span', 'month-no-rank', '–') : t('span', `month-rank r${r.rank}`, String(r.rank)));
    tr.append(rank, t('td', 'nm', r.name), t('td', '', short ? `${r.matches}*` : String(r.matches)),
      t('td', '', avg ? avgNum(r.avg) : num(r.points)));
    body.append(tr);
  }
  return tbl;
}

function render(box, v, myId) {
  const note = tab === 'avg' ? avgNote(v.avgMin) : NOTE;
  box.replaceChildren(head(v), crown(v), tabs(() => render(box, v, myId)), table(v, myId), t('p', 'month-note', note));
}

/** myId() — id prijavljenog igrača (za osvetljen red). Vraća refresh() koji Soba zove pri svakom osvežavanju. */
export function initMonthly({ myId }) {
  let at = 0;
  return {
    async refresh() {
      if (Date.now() - at < REFRESH_MS) return;
      at = Date.now();
      let v;
      try {
        const res = await fetch('/api/month');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        v = await res.json();
      } catch (e) {
        at = 0; // sledeće osvežavanje Sobe pokušava ponovo
        console.warn('Pref meseca:', e);
        return;
      }
      const box = $('monthBox');
      render(box, v, myId());
      box.hidden = false;
    },
  };
}
