// Stranica jedne lige: status i pravila, ligaska soba, stolovi lige u toku,
// tabela, pozivni link i clanovi za admina. Imena su korisnicki unos —
// samo textContent/escapeHtml.

import { $, el, escapeHtml, IS_PHONE_UA } from './dom.js';
import { askConfirm, copyLink } from './dialog.js';
import {
  ctx, nav, leagueApi, postJson, showLeagueScreen, showLeagueError, fmtDate, leagueStatusText, leagueRulesText,
} from './league-common.js';

const leagueUrl = (code) => `${location.origin}${location.pathname}?liga=${code}`;

function renderInviteRow(l) {
  const text = encodeURIComponent(`Pozivam te u preferans ligu „${l.name}“. Uđi ovde: ${leagueUrl(l.code)}`);
  return `<span class="room-share-row">` +
    `<a class="share-btn wa" href="https://wa.me/?text=${text}" target="_blank" rel="noopener">WhatsApp</a>` +
    (IS_PHONE_UA ? `<a class="share-btn viber" href="viber://forward?text=${text}">Viber</a>` : '') +
    `<button class="share-btn" type="button" id="leagueCopyLinkBtn">🔗 Kopiraj link</button>` +
    `</span>`;
}

let openLeagueId = null;

export async function openLeague(id) {
  openLeagueId = id;
  showLeagueScreen();
  let data;
  try {
    data = await leagueApi(`/${id}`);
  } catch (e) {
    await nav.toList();
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
  $('leagueBackBtn').onclick = () => nav.toList();
  $('leagueCopyLinkBtn').onclick = (ev) => copyLink(leagueUrl(l.code), 'Link lige', ev.currentTarget);
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
      removeBtn.onclick = async () => {
        const yes = await askConfirm({
          title: 'Ukloniti igrača?', text: `${m.name} više neće biti član lige.`, ok: 'Ukloni', danger: true,
        });
        if (yes) act(`${m.userId}/remove`, {});
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
