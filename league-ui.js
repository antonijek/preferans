// === ONLINE: zatvorene lige (korisnikov zahtev 2026-10-14) ===
// Spisak mojih liga, pravljenje lige (trajanje, norma, bodovanje za 3
// igraca, poredak, prekopiraj igrace iz prethodne lige), tabela, stolovi
// lige u toku, pozivni link (?liga=KOD) i clanovi za admina.
// Server: server/src/leagues.ts. Nazivi i imena su korisnicki unos — samo
// textContent/escapeHtml.

import { $, el, escapeHtml, IS_PHONE_UA } from './dom.js';

// Ono sto zivi u app.js (token, socket, ulazak u sobu, red lobija) —
// app.js ga predaje jednom pri ucitavanju, vidi initLeagueUi().
let ctx = null;

export function initLeagueUi(deps) {
  ctx = deps;
}

// ?liga=KOD u linku — posle prijave sam ulazi u ligu (vidi consumeLeagueLink)
export const wantedLeagueCode = (() => {
  const v = new URLSearchParams(location.search).get('liga');
  return v ? v.trim().toUpperCase() : null;
})();

async function leagueApi(path, opts = {}) {
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

const postJson = (body) => ({ method: 'POST', body: JSON.stringify(body) });

function showLeagueScreen() {
  for (const id of ['homeScreen', 'roomScreen', 'loginScreen', 'setupScreen']) $(id).classList.remove('active');
  $('leagueScreen').classList.add('active');
  // skroluje se sam ekran (body ima overflow: hidden), ne prozor
  $('leagueScreen').scrollTop = 0;
}

function leaveLeagueScreen() {
  $('leagueScreen').classList.remove('active');
  $('homeScreen').classList.add('active');
}

function showLeagueError(text) {
  const box = $('leagueError');
  if (box) box.textContent = text;
  else ctx.showToast(`⚠️ ${text}`);
}

const fmtDate = (iso) => new Date(iso).toLocaleDateString('sr-RS', { day: 'numeric', month: 'numeric', year: 'numeric' });

function leagueStatusText(l) {
  if (l.status === 'upcoming') return `počinje ${fmtDate(l.startsAt)}`;
  if (l.status === 'finished') return `završena ${fmtDate(l.endsAt)}`;
  const days = Math.max(0, Math.ceil((Date.parse(l.endsAt) - Date.now()) / 86400000));
  return days <= 1 ? 'u toku · poslednji dan' : `u toku · još ${days} dana`;
}

function leagueRulesText(l) {
  const scoring = l.scoring.mode === 'result' ? 'zbir rezultata' : `${l.scoring.points.join('-')} bodova po mestu`;
  const rank = l.rankBy === 'avg' ? 'poredak po proseku' : 'poredak po ukupnim bodovima';
  const turn = l.turnSeconds ? `${l.turnSeconds} s za potez` : 'bez vremena za potez';
  return `${scoring} · ${rank} · norma ${l.norma} partija · bula ${l.initialBule}, ${l.refePerPlayer} refe, ${turn}`;
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

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function openLeagueCreate() {
  $('leagueView').innerHTML = `
    <h1 class="room-hero-title">Nova liga</h1>
    <div class="league-form">
      <div class="text-field"><label for="lgName">Naziv lige</label><input type="text" id="lgName" maxlength="40" placeholder="npr. Liga Beograd — novembar"></div>
      <div class="text-field"><label for="lgStart">Početak</label><input type="date" id="lgStart" value="${todayIso()}"></div>
      <div class="setup-field"><label for="lgDays">Trajanje (dana)</label><input type="number" id="lgDays" value="25" min="1" max="90"></div>
      <div class="setup-field"><label for="lgNorma">Norma (najmanje partija)</label><input type="number" id="lgNorma" value="10" min="0" max="500"></div>
      <div class="league-form-group">
        <div class="league-form-label">Bodovanje partije (3 igrača)</div>
        <label class="league-radio"><input type="radio" name="lgScoring" value="places" checked> Bodovi po mestu:</label>
        <div class="league-points">
          <div class="setup-field"><label for="lgP1">1. mesto</label><input type="number" id="lgP1" value="10" min="0" max="100"></div>
          <div class="setup-field"><label for="lgP2">2. mesto</label><input type="number" id="lgP2" value="5" min="0" max="100"></div>
          <div class="setup-field"><label for="lgP3">3. mesto</label><input type="number" id="lgP3" value="1" min="0" max="100"></div>
        </div>
        <label class="league-radio"><input type="radio" name="lgScoring" value="result"> Zbir rezultata (koliko je ko dobio/izgubio)</label>
      </div>
      <div class="league-form-group">
        <div class="league-form-label">Poredak u tabeli</div>
        <label class="league-radio"><input type="radio" name="lgRank" value="total" checked> Ukupno bodova</label>
        <label class="league-radio"><input type="radio" name="lgRank" value="avg"> Prosek po partiji</label>
      </div>
      <div class="setup-field"><label for="lgBula">Početna bula</label><input type="number" id="lgBula" value="100" min="50" max="300" step="10"></div>
      <div class="setup-field"><label for="lgRefe">Refe po igraču</label><input type="number" id="lgRefe" value="2" min="0" max="5"></div>
      <div class="setup-field"><label for="lgTurn">Vreme za potez</label>
        <select id="lgTurn"><option value="15">15 s</option><option value="30" selected>30 s</option><option value="60">60 s</option><option value="0">bez ograničenja</option></select></div>
      <div class="setup-field" id="lgCopyRow" style="display:none"><label for="lgCopy">Prekopiraj igrače iz lige</label><select id="lgCopy"><option value="">— ne —</option></select></div>
      <p class="league-note" id="lgEarlyEndNote"></p>
      <div class="field-error" id="leagueError"></div>
      <div class="league-actions">
        <button class="mode-btn primary" id="lgSubmitBtn">Napravi ligu</button>
        <button class="mode-btn" id="lgCancelBtn">Odustani</button>
      </div>
    </div>`;
  $('lgSubmitBtn').onclick = submitLeagueCreate;
  $('lgCancelBtn').onclick = goToLeagues;
  // lige u kojima sam admin — iz njih mogu da prekopiram igrace
  try {
    const { leagues, minHandsEarlyEnd } = await leagueApi('');
    $('lgEarlyEndNote').textContent =
      `Partija prekinuta dogovorom ili napuštanjem ulazi u tabelu tek posle ${minHandsEarlyEnd} odigranih ruku.`;
    const adminLeagues = leagues.filter((l) => l.isAdmin);
    const copy = $('lgCopy');
    for (const l of adminLeagues) {
      const o = document.createElement('option');
      o.value = String(l.id);
      o.textContent = `${l.name} (${l.members})`;
      copy.appendChild(o);
    }
    if (adminLeagues.length > 0) $('lgCopyRow').style.display = '';
  } catch (e) {
    showLeagueError(`Spisak tvojih liga nije učitan, pa kopiranje igrača nije dostupno: ${e.message}`);
  }
}

async function submitLeagueCreate() {
  const num = (id) => parseInt($(id).value, 10);
  const body = {
    name: $('lgName').value,
    startsAt: new Date(`${$('lgStart').value}T00:00:00`).toISOString(),
    days: num('lgDays'),
    norma: num('lgNorma'),
    scoringMode: document.querySelector('input[name="lgScoring"]:checked').value,
    points: [num('lgP1'), num('lgP2'), num('lgP3')],
    rankBy: document.querySelector('input[name="lgRank"]:checked').value,
    initialBule: num('lgBula'),
    refePerPlayer: num('lgRefe'),
    turnSeconds: num('lgTurn'),
    copyFromLeagueId: $('lgCopy').value ? Number($('lgCopy').value) : null,
  };
  try {
    const { league } = await leagueApi('', postJson(body));
    ctx.showToast(`🏆 Liga „${league.name}“ je napravljena — pošalji igračima pozivni link.`);
    openLeague(league.id);
  } catch (e) {
    showLeagueError(e.message);
  }
}

const leagueUrl = (code) => `${location.origin}${location.pathname}?liga=${code}`;

function renderInviteRow(l) {
  const text = encodeURIComponent(`Pozivam te u preferans ligu „${l.name}“. Uđi ovde: ${leagueUrl(l.code)}`);
  return `<span class="room-share-row">` +
    `<a class="share-btn wa" href="https://wa.me/?text=${text}" target="_blank" rel="noopener">WhatsApp</a>` +
    (IS_PHONE_UA ? `<a class="share-btn viber" href="viber://forward?text=${text}">Viber</a>` : '') +
    `<button class="share-btn" type="button" id="leagueCopyLinkBtn">🔗 Kopiraj link</button>` +
    `</span>`;
}

function copyLeagueLink(code, btn) {
  const url = leagueUrl(code);
  const done = () => {
    const old = btn.textContent;
    btn.textContent = 'Kopirano ✓';
    setTimeout(() => { btn.textContent = old; }, 2000);
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done).catch(() => prompt('Link lige:', url));
  else prompt('Link lige:', url);
}

let openLeagueId = null;

async function openLeague(id) {
  openLeagueId = id;
  showLeagueScreen();
  let data;
  try {
    data = await leagueApi(`/${id}`);
  } catch (e) {
    await goToLeagues();
    showLeagueError(e.message);
    return;
  }
  const { league: l, isAdmin, myUserId, members, standings } = data;
  const playBlock = l.status === 'active'
    ? '<button class="mode-btn primary league-play" id="leaguePlayBtn">🎮 Napravi ligašku sobu</button>'
    : `<div class="league-note">${l.status === 'upcoming' ? 'Ligaške sobe se prave kad liga počne.' : 'Liga je završena — tabela je konačna.'}</div>`;
  $('leagueView').innerHTML = `
    <h1 class="room-hero-title league-title" id="leagueTitle"></h1>
    <div class="league-status status-${l.status}">${leagueStatusText(l)} · ${fmtDate(l.startsAt)} – ${fmtDate(l.endsAt)}</div>
    <div class="league-rules">${leagueRulesText(l)}</div>
    ${playBlock}
    <div class="field-error" id="leagueError"></div>
    <h2 class="section-title">Stolovi lige</h2>
    <div class="lobby-table-list" id="leagueTables"><div class="room-list-empty">Učitavanje...</div></div>
    <h2 class="section-title">Tabela</h2>
    <div class="league-table-wrap"><table class="league-table">
      <thead><tr><th>#</th><th>Igrač</th><th title="Odigrane partije">P</th><th>${l.scoring.mode === 'result' ? 'Rez.' : 'Bodovi'}</th><th title="Prosek po partiji">Pros.</th><th title="Zbir rezultata (plus je dobro)">±</th></tr></thead>
      <tbody id="leagueStandings"></tbody>
    </table></div>
    <div class="league-note">Ispod norme (manje od ${l.norma} partija) — na dnu tabele, sivo. Partija prekinuta pre ${l.minHandsEarlyEnd} ruku se ne računa.</div>
    <div class="league-invite">
      <div>Pozivni kod: <b id="leagueCode">${escapeHtml(l.code)}</b> — pošalji link igračima:</div>
      ${renderInviteRow(l)}
    </div>
    <div id="leagueAdmin"></div>
    <button class="mode-btn league-back" id="leagueBackBtn">← Sve lige</button>`;
  $('leagueTitle').textContent = l.name;
  $('leagueBackBtn').onclick = goToLeagues;
  $('leagueCopyLinkBtn').onclick = (ev) => copyLeagueLink(l.code, ev.currentTarget);
  if (l.status === 'active') $('leaguePlayBtn').onclick = createLeagueRoom;
  renderStandings(standings, myUserId);
  renderLeagueTables(l.id);
  if (isAdmin) renderLeagueAdmin(l, members, myUserId);
}

function renderStandings(standings, myUserId) {
  const body = $('leagueStandings');
  let place = 0;
  for (const r of standings) {
    const tr = document.createElement('tr');
    if (!r.meetsNorma) tr.classList.add('below-norma');
    if (r.userId === myUserId) tr.classList.add('me');
    if (r.meetsNorma) place++;
    const cells = [
      r.meetsNorma ? String(place) : '–',
      r.name,
      String(r.matches),
      String(r.points),
      r.matches ? String(r.avg) : '–',
      r.result > 0 ? `+${r.result}` : r.result < 0 ? `−${-r.result}` : '0',
    ];
    for (const c of cells) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
}

// Stolovi ove lige iz istog spiska kao lobi (room:list) — isti red sa
// Sedi/Gledaj, da clanovi vide gde se ceka igrac.
function renderLeagueTables(leagueId) {
  const box = $('leagueTables');
  const socket = ctx.getSocket();
  if (!socket) { box.innerHTML = '<div class="room-list-empty">Nema veze sa serverom.</div>'; return; }
  socket.emit('room:list', {}, (res) => {
    if (openLeagueId !== leagueId || !$('leagueTables')) return;
    const rooms = (res?.rooms ?? []).filter((r) => r.league?.id === leagueId);
    box.innerHTML = '';
    if (rooms.length === 0) {
      box.appendChild(el('div', 'room-list-empty', 'Trenutno nema stolova ove lige — napravi ligašku sobu i pozovi igrače.'));
      return;
    }
    for (const r of rooms) box.appendChild(ctx.buildLobbyRow(r));
  });
}

function renderLeagueAdmin(l, members, myUserId) {
  $('leagueAdmin').innerHTML = `<h2 class="section-title">Igrači (${members.length}) — admin</h2><div class="league-members" id="leagueMembers"></div>`;
  const list = $('leagueMembers');
  const act = async (path, body) => {
    try {
      await leagueApi(`/${l.id}/members/${path}`, postJson(body));
      openLeague(l.id);
    } catch (e) {
      ctx.showToast(`⚠️ ${e.message}`);
    }
  };
  for (const m of members) {
    const row = el('div', 'league-member');
    const name = el('span', 'league-member-name');
    name.textContent = m.name + (m.isAdmin ? ' (admin)' : '');
    row.appendChild(name);
    if (m.userId !== myUserId) {
      const adminBtn = el('button', 'mode-btn', m.isAdmin ? 'Ukini admina' : 'Postavi za admina');
      adminBtn.onclick = () => act(`${m.userId}/admin`, { admin: !m.isAdmin });
      const removeBtn = el('button', 'mode-btn danger', 'Ukloni');
      removeBtn.onclick = () => {
        if (confirm(`Ukloniti ${m.name} iz lige?`)) act(`${m.userId}/remove`, {});
      };
      row.append(adminBtn, removeBtn);
    }
    list.appendChild(row);
  }
}

// ligaska soba: podesavanja diktira liga, sedaju samo clanovi, bez racunara
function createLeagueRoom() {
  const socket = ctx.getSocket();
  if (!socket || openLeagueId === null) return;
  socket.emit('room:create', { leagueId: openLeagueId }, (res) => {
    if (res.error) { showLeagueError(res.error); return; }
    ctx.enterCreatedRoom(res);
  });
}
