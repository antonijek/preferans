// Kartica "Utisci" u admin panelu: primedbe, predlozi i pohvale igraca (server/src/feedback.ts,
// korisnikov zahtev 2026-10-28). Tekst igraca ide samo kroz textContent. Koristi api() iz admin.html.

const FEEDBACK_KIND = { bug: '🐞 Greška', idea: '💡 Predlog', praise: '👍 Pohvala' };
const FEEDBACK_SEATS = ['Jug', 'Istok', 'Zapad'];

function feedbackCell(row, text) {
  const td = document.createElement('td');
  td.textContent = text;
  row.appendChild(td);
  return td;
}

function feedbackButton(label, onClick) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.onclick = onClick;
  return btn;
}

/** Kratak opis prilozene partije, i za igru protiv racunara sve karte (da se ruka ponovo odigra). */
function feedbackContext(json) {
  const ctx = json ? JSON.parse(json) : null;
  if (!ctx) return { summary: '—', detail: null };
  if (ctx.mode === 'online') return { summary: `Online, soba ${ctx.room}, ruka ${ctx.round ?? '?'}`, detail: null };
  const who = (i) => `${i === 0 ? 'Igrač' : `Računar ${i}`} (${FEEDBACK_SEATS[i]})`;
  const lines = ctx.hands.map((h, i) => `${who(i)}: ${h.join(' ') || '—'}`);
  if (ctx.talon?.length) lines.push(`Talon: ${ctx.talon.join(' ')}`);
  if (ctx.discard?.length) lines.push(`Škart: ${ctx.discard.join(' ')}`);
  ctx.tricks.forEach((t, i) => lines.push(`${i + 1}. štih: ${t.map(([p, c]) => `${FEEDBACK_SEATS[p]} ${c}`).join(', ')}`));
  if (ctx.currentTrick.length) lines.push(`Na stolu: ${ctx.currentTrick.map(([p, c]) => `${FEEDBACK_SEATS[p]} ${c}`).join(', ')}`);
  const game = ctx.declaredGame ? `, ${ctx.declaredGame}` : '';
  return { summary: `Protiv računara, ruka ${ctx.round}${game}`, detail: lines.join('\n') };
}

async function loadFeedback() {
  const err = document.getElementById('feedbackErr');
  try {
    const { feedback, unread } = await api('/api/admin/feedback');
    err.style.display = 'none';
    document.getElementById('feedbackUnread').textContent = unread ? `(${unread})` : '';
    const body = document.getElementById('feedbackBody');
    body.replaceChildren();
    for (const f of feedback) {
      const tr = document.createElement('tr');
      tr.style.fontWeight = f.is_read ? '' : '700';
      feedbackCell(tr, new Date(f.created_at.replace(' ', 'T') + 'Z').toLocaleString('sr-RS'));
      feedbackCell(tr, FEEDBACK_KIND[f.kind] ?? f.kind);
      feedbackCell(tr, f.user_name ?? (f.contact ? `gost — ${f.contact}` : 'gost'));
      feedbackCell(tr, f.message).style.whiteSpace = 'pre-wrap';
      const { summary, detail } = feedbackContext(f.context_json);
      const ctxCell = feedbackCell(tr, summary);
      if (detail) {
        const pre = document.createElement('pre');
        pre.textContent = detail;
        pre.style.display = 'none';
        ctxCell.append(' ', feedbackButton('Karte', () => { pre.style.display = pre.style.display === 'none' ? '' : 'none'; }), pre);
      }
      const actions = feedbackCell(tr, '');
      actions.append(
        feedbackButton(f.is_read ? 'Nepročitano' : 'Pročitano', () => setFeedbackRead(f.id, !f.is_read)),
        ' ',
        feedbackButton('Obriši', () => deleteFeedback(f.id)),
      );
      body.appendChild(tr);
    }
    document.getElementById('feedbackEmpty').style.display = feedback.length ? 'none' : 'block';
  } catch (e) {
    err.textContent = 'Utisci nisu učitani: ' + e.message;
    err.style.display = 'block';
  }
}

async function setFeedbackRead(id, read) {
  await api(`/api/admin/feedback/${id}/read`, { method: 'POST', body: JSON.stringify({ read }) });
  loadFeedback();
}

async function deleteFeedback(id) {
  if (!confirm('Obrisati ovu poruku? Ovo je nepovratno.')) return;
  await api(`/api/admin/feedback/${id}`, { method: 'DELETE' });
  loadFeedback();
}
