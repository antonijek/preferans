// Licna statistika na stranici "Moje partije" (matches.html) — podatke
// racuna server (server/src/stats.ts, /api/stats/me). Ucitava se kad
// matches.html javi da je igrac prijavljen (pref:matches-ready).

import { $, el } from './dom.js';

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');
const GAME_ORDER = ['Pik', 'Karo', 'Herc', 'Tref', 'Betl', 'Sans', 'Igra'];

function tile(value, label) {
  const t = el('div', 'stat-tile');
  t.appendChild(el('div', 'stat-value')).textContent = value;
  t.appendChild(el('div', 'stat-label')).textContent = label;
  return t;
}

function render(s) {
  const box = $('statsBox');
  box.innerHTML = '<h2><span>Moja statistika</span></h2>';
  if (s.matches === 0) {
    box.appendChild(el('div', 'muted')).textContent = 'Još nema završenih partija — statistika se pravi od online partija.';
    box.hidden = false;
    return;
  }
  const grid = el('div', 'stats-grid');
  grid.append(
    tile(String(s.matches), s.withComputer ? `partija (${s.withComputer} sa računarom)` : 'partija'),
    tile(`${s.places[0]} (${pct(s.places[0], s.matches)})`, 'pobeda — 1. mesto'),
    tile(`${s.places[1]} / ${s.places[2]}`, '2. / 3. mesto'),
    tile(signed(s.avgResult), 'prosečan rezultat'),
    tile(signed(s.bestResult), 'najbolja partija'),
    tile(signed(s.worstResult), 'najgora partija'),
    tile(s.rating !== null ? String(s.rating) : '—', s.peakRating ? `rejting (najviši ${s.peakRating})` : 'rejting'),
    tile(s.declared ? `${s.declared} (${pct(s.declaredPassed, s.declared)})` : '0', 'ruku kao nosilac (prošao)'),
    tile(String(s.kontraAgainstMe), 'kontri protiv mene'),
    tile(`${s.currentStreak} / ${s.longestStreak}`, `niz dana sada / najduži (${s.daysPlayed} dana ukupno)`),
  );
  box.appendChild(grid);
  const games = GAME_ORDER.filter((g) => s.games[g]).map((g) => `${g} ${s.games[g]}`);
  if (games.length) box.appendChild(el('div', 'stat-games')).textContent = `Igre kao nosilac: ${games.join(' · ')}`;
  box.hidden = false;
}

async function loadStats() {
  let token = null;
  try { token = localStorage.getItem('pref_token'); } catch (e) { console.warn('[statistika] localStorage nedostupan:', e); }
  if (!token) return;
  const box = $('statsBox');
  try {
    const res = await fetch('/api/stats/me', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Greška ${res.status}`);
    render(data.stats);
  } catch (e) {
    box.innerHTML = '<h2><span>Moja statistika</span></h2>';
    box.appendChild(el('div', 'muted')).textContent = `Statistika nije učitana: ${e.message}`;
    box.hidden = false;
  }
}

if (document.body.dataset.ready === '1') loadStats();
document.addEventListener('pref:matches-ready', loadStats);
