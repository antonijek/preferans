// Primedbe, predlozi i pohvale (korisnikov zahtev 2026-10-28): prozor sa vrstom poruke i tekstom,
// dugmad na pocetnim ekranima i za stolom, i jednom poruka da ta mogucnost postoji. Salju svi, i
// gosti. Uz poruku iz partije ide trenutna ruka (getContext iz app.js). Server: server/src/feedback.ts.

import { el } from './dom.js';
import { askConfirm } from './dialog.js';

const KINDS = [['bug', '🐞 Greška'], ['idea', '💡 Predlog'], ['praise', '👍 Pohvala']];
const MAX_MESSAGE = 1000;
const INTRO_KEY = 'feedbackIntroSeen';
const INVITE = 'Primetio si grešku, imaš predlog ili ti se nešto dopalo? Javi nam — tako pomažeš da sajt bude bolji.';

let deps = { getToken: () => null, getContext: () => null };
let dlg = null;
let kind = null;

function buildDialog() {
  dlg = el('dialog', 'app-dialog feedback-dialog');
  dlg.id = 'feedbackDialog';
  dlg.innerHTML = `
    <h2 class="app-dialog-title" id="feedbackTitle"></h2>
    <p class="app-dialog-text" id="feedbackText"></p>
    <div id="feedbackForm">
      <div class="feedback-kinds" role="radiogroup" aria-label="Vrsta poruke"></div>
      <div class="text-field"><textarea id="feedbackMessage" rows="5"></textarea></div>
      <div class="feedback-count" id="feedbackCount"></div>
      <div class="text-field" id="feedbackContactField"><input id="feedbackContact" type="text" autocomplete="name"></div>
      <label class="feedback-attach" id="feedbackAttachRow">
        <input type="checkbox" id="feedbackAttach" checked> <span>Priloži trenutnu ruku (pomaže da nađemo grešku)</span>
      </label>
      <input id="feedbackWebsite" class="feedback-hp" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">
      <p class="field-error" id="feedbackError" role="alert"></p>
    </div>
    <div class="app-dialog-buttons">
      <button type="button" class="mode-btn" id="feedbackCancel">Otkaži</button>
      <button type="button" class="mode-btn primary" id="feedbackSend">Pošalji</button>
    </div>`;
  const kinds = dlg.querySelector('.feedback-kinds');
  for (const [value, label] of KINDS) {
    const btn = el('button', 'mode-btn feedback-kind');
    btn.type = 'button';
    btn.id = `feedbackKind-${value}`;
    btn.textContent = label;
    btn.setAttribute('role', 'radio');
    btn.onclick = () => selectKind(value);
    kinds.appendChild(btn);
  }
  const message = dlg.querySelector('#feedbackMessage');
  message.maxLength = MAX_MESSAGE;
  message.placeholder = 'Napiši šta si primetio. Ako je greška u igri, opiši šta se desilo.';
  message.oninput = () => {
    updateCount();
    showError('');
  };
  const contact = dlg.querySelector('#feedbackContact');
  contact.maxLength = 100;
  contact.placeholder = 'Ime ili kontakt, ako želiš odgovor (nije obavezno)';
  dlg.querySelector('#feedbackCancel').onclick = () => dlg.close();
  dlg.querySelector('#feedbackSend').onclick = send;
  document.body.appendChild(dlg);
}

function selectKind(value) {
  kind = value;
  if (value) showError('');
  for (const [v] of KINDS) {
    const btn = dlg.querySelector(`#feedbackKind-${v}`);
    btn.classList.toggle('primary', v === value);
    btn.setAttribute('aria-checked', String(v === value));
  }
}

function updateCount() {
  dlg.querySelector('#feedbackCount').textContent = `${dlg.querySelector('#feedbackMessage').value.length} / ${MAX_MESSAGE}`;
}

function showError(text) {
  dlg.querySelector('#feedbackError').textContent = text;
}

/** Prozor u stanju "forma" ili "hvala" (posle slanja ostaje samo Zatvori). */
function setStage(stage) {
  const form = stage === 'form';
  dlg.querySelector('#feedbackTitle').textContent = form ? 'Primedbe i pohvale' : 'Hvala!';
  dlg.querySelector('#feedbackText').textContent = form ? INVITE : 'Poruka je poslata. Hvala što pomažeš da sajt bude bolji.';
  dlg.querySelector('#feedbackForm').hidden = !form;
  dlg.querySelector('#feedbackSend').hidden = !form;
  dlg.querySelector('#feedbackCancel').textContent = form ? 'Otkaži' : 'Zatvori';
}

async function send() {
  const message = dlg.querySelector('#feedbackMessage').value.trim();
  if (!kind) return showError('Izaberi da li je greška, predlog ili pohvala.');
  if (message.length < 3) return showError('Napiši bar par reči.');
  showError('');
  const btn = dlg.querySelector('#feedbackSend');
  btn.disabled = true;
  btn.textContent = 'Šaljem…';
  const token = deps.getToken();
  const body = {
    kind,
    message,
    contact: token ? null : dlg.querySelector('#feedbackContact').value,
    website: dlg.querySelector('#feedbackWebsite').value,
    context: dlg.querySelector('#feedbackAttach').checked ? deps.getContext() : null,
  };
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Slanje nije uspelo. Pokušaj ponovo.');
    setStage('thanks');
  } catch (err) {
    showError(err instanceof TypeError ? 'Nema veze sa internetom. Pokušaj ponovo kad se veza vrati.' : err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Pošalji';
  }
}

/** Ruka iz igre protiv racunara, dovoljno da se ponovo odigra (karte kao "A♠"). */
export function handSnapshot(s) {
  const ids = (cards) => (cards ?? []).map((c) => c.id);
  const plays = (trick) => trick.map((p) => [p.player, p.card.id]);
  return {
    round: s.round, phase: s.phase, dealer: s.dealer, declaredGame: s.declaredGame, winner: s.winner,
    bids: s.bids, followChoices: s.followChoices, kontraLevel: s.kontraLevel, bulas: s.bulas,
    hands: s.players.map((p) => ids(p.hand)), talon: ids(s.lastTalon?.length ? s.lastTalon : s.talon),
    discard: ids(s.discard), tricks: (s.tricks ?? []).map(plays), currentTrick: plays(s.currentTrick ?? []),
  };
}

export function openFeedback() {
  if (!dlg) buildDialog();
  kind = null;
  selectKind(null);
  dlg.querySelector('#feedbackMessage').value = '';
  dlg.querySelector('#feedbackWebsite').value = '';
  dlg.querySelector('#feedbackContactField').hidden = !!deps.getToken();
  dlg.querySelector('#feedbackAttachRow').hidden = !deps.getContext();
  dlg.querySelector('#feedbackAttach').checked = true;
  showError('');
  updateCount();
  setStage('form');
  dlg.showModal();
}

/**
 * Jednom (po pregledacu) objasni da ova mogucnost postoji — samo na pocetnom ekranu, ne usred
 * partije i ne preko drugog prozora. Automatski testovi (navigator.webdriver) ga ne vide.
 */
function maybeShowIntro() {
  if (navigator.webdriver) return;
  try {
    if (localStorage.getItem(INTRO_KEY) === '1') return;
  } catch {
    return; // bez pamcenja bi iskakao pri svakom ulasku
  }
  const onStart = ['setupScreen', 'homeScreen'].some((id) => document.getElementById(id)?.classList.contains('active'));
  if (!onStart || document.querySelector('dialog[open]')) return;
  localStorage.setItem(INTRO_KEY, '1');
  askConfirm({
    title: 'Tvoje mišljenje nam znači',
    text: 'Ako primetiš grešku, imaš predlog ili ti se nešto dopadne, javi nam preko dugmeta „✉️ Primedbe i pohvale“. Tako pomažeš da sajt bude sve bolji.',
    ok: 'Napiši sada',
    cancel: 'Kasnije',
  }).then((write) => { if (write) openFeedback(); });
}

export function initFeedbackUi(d) {
  deps = { ...deps, ...d };
  window.openFeedback = openFeedback;
  setTimeout(maybeShowIntro, 2500);
}
