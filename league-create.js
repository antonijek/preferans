// Forma za novu ligu: trajanje, norma, bodovanje za 3 igraca (po mestu ili
// zbir rezultata), poredak, podesavanja partije, prekopiraj igrace iz lige
// u kojoj sam admin. Server proverava sve (leagues.ts createLeague).

import { $ } from './dom.js';
import { ctx, nav, leagueApi, postJson, showLeagueError } from './league-common.js';

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function openLeagueCreate() {
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
  $('lgCancelBtn').onclick = () => nav.toList();
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
    nav.toLeague(league.id);
  } catch (e) {
    showLeagueError(e.message);
  }
}
