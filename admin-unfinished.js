// Kartica "Nezavršene partije" u admin tabu Partije (server/src/unfinished.ts, korisnikov zahtev 2026-11-12).
// Imena igrača idu samo kroz textContent. Koristi api() iz admin.html.

async function loadUnfinished() {
  try {
    const { unfinished } = await api('/api/admin/unfinished');
    const body = document.getElementById('unfinishedBody');
    body.innerHTML = '';
    document.getElementById('unfinishedEmpty').style.display = unfinished.length === 0 ? 'block' : 'none';
    for (const u of unfinished) {
      const tr = document.createElement('tr');
      const when = u.closedAt ? new Date(u.closedAt + 'Z').toLocaleString('sr-RS') : 'otvoren';
      const last = new Date(u.lastActivityAt + 'Z').toLocaleString('sr-RS');
      const cells = [
        u.roomCode, when, last, u.reason, String(u.roundsPlayed), u.phase,
        u.names.map((n) => n || '—').join(' / '), u.bulas.join(' / '), u.hadBots ? 'da' : 'ne',
      ];
      for (const text of cells) {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
  } catch (e) {
    alert('Nezavršene partije: ' + e.message);
  }
}
