// Zajednicko za ekrane lige (league-ui.js spisak, league-create.js forma,
// league-page.js stranica lige): veza sa app.js, poziv API-ja, prikaz
// ekrana i gresaka, opis lige. Server: server/src/leagues.ts.

import { $ } from './dom.js';

// Ono sto zivi u app.js (token, socket, ulazak u sobu, red lobija) —
// app.js ga predaje jednom pri ucitavanju (initLeagueUi).
export let ctx = null;

export function initLeagueUi(deps) {
  ctx = deps;
}

// Prelazi izmedju ekrana lige — postavlja ih league-ui.js, da forma i
// stranica lige ne uvoze spisak (i obrnuto).
export const nav = { toList: null, toLeague: null };

export async function leagueApi(path, opts = {}) {
  const res = await fetch(`/api/leagues${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ctx.getToken()}` },
  });
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error(`Server nije odgovorio ispravno (${res.status}).`);
  }
  if (!res.ok) throw new Error(data.error || `Greška ${res.status}`);
  return data;
}

export const postJson = (body) => ({ method: 'POST', body: JSON.stringify(body) });

export function showLeagueScreen() {
  for (const id of ['homeScreen', 'roomScreen', 'loginScreen', 'setupScreen']) $(id).classList.remove('active');
  $('leagueScreen').classList.add('active');
  // skroluje se sam ekran (body ima overflow: hidden), ne prozor
  $('leagueScreen').scrollTop = 0;
}

export function showLeagueError(text) {
  const box = $('leagueError');
  if (box) box.textContent = text;
  else ctx.showToast(`⚠️ ${text}`);
}

export const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('sr-RS', { day: 'numeric', month: 'numeric', year: 'numeric' });

export function leagueStatusText(l) {
  if (l.status === 'upcoming') return `počinje ${fmtDate(l.startsAt)}`;
  if (l.status === 'finished') return `završena ${fmtDate(l.endsAt)}`;
  const days = Math.max(0, Math.ceil((Date.parse(l.endsAt) - Date.now()) / 86400000));
  return days <= 1 ? 'u toku · poslednji dan' : `u toku · još ${days} dana`;
}

export function leagueRulesText(l) {
  const scoring = l.scoring.mode === 'result' ? 'zbir rezultata' : `${l.scoring.points.join('-')} bodova po mestu`;
  const rank = l.rankBy === 'avg' ? 'poredak po proseku' : 'poredak po ukupnim bodovima';
  const turn = l.turnSeconds ? `${l.turnSeconds} s za potez` : 'bez vremena za potez';
  return `${scoring} · ${rank} · norma ${l.norma} partija · bula ${l.initialBule}, ${l.refePerPlayer} refe, ${turn}`;
}
