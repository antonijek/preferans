// === ONLINE: zatvorene lige (korisnikov zahtev 2026-10-14) ===
// Ulaz za app.js: pozivni link (?liga=KOD), spisak mojih liga, ulazak
// kodom. Forma za novu ligu je u league-create.js, stranica lige u
// league-page.js, zajednicko u league-common.js. Server: leagues.ts.

import { $, el, escapeHtml } from './dom.js';
import { ctx, nav, leagueApi, postJson, showLeagueScreen, showLeagueError, leagueStatusText } from './league-common.js';
import { openLeagueCreate } from './league-create.js';
import { openLeague } from './league-page.js';

export { initLeagueUi } from './league-common.js';

// ?liga=KOD u linku — posle prijave sam ulazi u ligu (vidi consumeLeagueLink)
export const wantedLeagueCode = (() => {
  const v = new URLSearchParams(location.search).get('liga');
  return v ? v.trim().toUpperCase() : null;
})();

function leaveLeagueScreen() {
  $('leagueScreen').classList.remove('active');
  $('homeScreen').classList.add('active');
}

export async function goToLeagues() {
  showLeagueScreen();
  $('leagueView').innerHTML = '<div class="room-list-empty">Učitavanje...</div>';
  let leagues;
  try {
    leagues = (await leagueApi('')).leagues;
  } catch (e) {
    $('leagueView').innerHTML = '';
    $('leagueView').appendChild(el('div', 'field-error', escapeHtml(e.message)));
    return;
  }
  renderLeagueList(leagues);
}

nav.toList = goToLeagues;
nav.toLeague = openLeague;

function renderLeagueList(leagues) {
  $('leagueView').innerHTML = `
    <h1 class="room-hero-title">🏆 Lige</h1>
    <p class="league-intro">Zatvorena liga: igrači ulaze pozivnim linkom, igraju partije međusobno u zadatom periodu i vode tabelu sa normom.</p>
    <div class="league-list" id="leagueList"></div>
    <div class="league-actions">
      <button class="mode-btn primary" id="leagueCreateBtn">➕ Napravi ligu</button>
    </div>
    <div class="text-field league-join">
      <label for="leagueJoinCode">Imaš pozivni kod lige?</label>
      <div class="league-join-row">
        <input type="text" id="leagueJoinCode" placeholder="npr. K7XQ2M" maxlength="6" autocomplete="off">
        <button class="mode-btn" id="leagueJoinBtn">Uđi u ligu</button>
      </div>
      <div class="field-error" id="leagueError"></div>
    </div>
    <button class="mode-btn league-back" id="leagueBackBtn">← Nazad</button>`;
  $('leagueCreateBtn').onclick = openLeagueCreate;
  $('leagueJoinBtn').onclick = joinLeagueFromInput;
  $('leagueBackBtn').onclick = leaveLeagueScreen;
  const list = $('leagueList');
  if (leagues.length === 0) {
    list.appendChild(el('div', 'room-list-empty', 'Još nisi ni u jednoj ligi. Napravi svoju ili uđi pozivnim kodom.'));
  }
  for (const l of leagues) {
    const card = el('button', `league-card status-${l.status}`);
    card.type = 'button';
    card.dataset.leagueId = String(l.id);
    const name = el('div', 'league-card-name');
    name.textContent = l.name;
    const meta = el('div', 'league-card-meta');
    meta.textContent = `${leagueStatusText(l)} · ${l.members} ${l.members === 1 ? 'igrač' : 'igrača'}${l.isAdmin ? ' · admin' : ''}`;
    card.append(name, meta);
    card.onclick = () => openLeague(l.id);
    list.appendChild(card);
  }
}

async function joinLeagueFromInput() {
  const code = $('leagueJoinCode').value.trim().toUpperCase();
  if (!code) { showLeagueError('Unesi pozivni kod.'); return; }
  try {
    const { league } = await leagueApi('/join', postJson({ code }));
    openLeague(league.id);
  } catch (e) {
    showLeagueError(e.message);
  }
}

// Posle prijave sa ?liga=KOD linkom: jednom po sesiji (kao ?room=), da
// greska (npr. zavrsena liga) ne vraca coveka u petlju. Vraca true ako je
// preuzela prikaz.
export function consumeLeagueLink() {
  if (!wantedLeagueCode) return false;
  const key = `pref_tried_league:${wantedLeagueCode}`;
  try {
    if (sessionStorage.getItem(key) === '1') return false;
    sessionStorage.setItem(key, '1');
  } catch (e) {
    console.warn('[liga] sessionStorage nedostupan, link lige se ne pamti:', e);
  }
  joinLeagueFromLink();
  return true;
}

async function joinLeagueFromLink() {
  showLeagueScreen();
  try {
    const { league } = await leagueApi('/join', postJson({ code: wantedLeagueCode }));
    ctx.showToast(`🏆 Ušao si u ligu „${league.name}“`);
    openLeague(league.id);
  } catch (e) {
    await goToLeagues();
    showLeagueError(e.message);
  }
}
