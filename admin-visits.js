// Posete na "Pregled" (server/src/visits.ts, korisnikov zahtev 2026-11-03): odakle je posetilac dosao, sa kog
// uredjaja, da li je igrao i da li se vraca. Tekst ide samo kroz textContent. Koristi api() iz admin.html.

function visitCell(row, text) {
  const td = document.createElement('td');
  td.textContent = text;
  row.appendChild(td);
}

function visitTime(sqlTime) {
  return new Date(sqlTime.replace(' ', 'T') + 'Z').toLocaleString('sr-RS', {
    day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function visitPlayed(v) {
  const kinds = [];
  if (v.played_local) kinds.push('protiv računara');
  if (v.played_online) kinds.push('online soba');
  return kinds.length ? kinds.join(', ') : '—';
}

async function loadVisits() {
  const err = document.getElementById('visitsErr');
  try {
    const { today, visits } = await api('/api/admin/visits');
    err.style.display = 'none';
    document.getElementById('statVisitsToday').textContent = today;
    const body = document.getElementById('visitsBody');
    body.replaceChildren();
    for (const v of visits) {
      const tr = document.createElement('tr');
      visitCell(tr, visitTime(v.created_at));
      visitCell(tr, v.source);
      visitCell(tr, v.device + (v.installed ? ' (aplikacija)' : ''));
      visitCell(tr, visitPlayed(v));
      visitCell(tr, (v.user_name ?? 'gost') + (v.earlier ? ` · vraća se (${v.earlier + 1}. put)` : ''));
      body.appendChild(tr);
    }
    document.getElementById('visitsEmpty').style.display = visits.length ? 'none' : 'block';
  } catch (e) {
    err.textContent = `Posete nisu učitane: ${e.message}`;
    err.style.display = 'block';
  }
}
