// Slika igrača (korisnik 2026-10-25, po uzoru na Loru): klik na kružić pored "Zdravo" otvara
// prozor "Tvoja slika". Pregledač sam iseče sliku u kvadrat 256×256 i pošalje je kao fajl, a
// server (server/src/avatars.ts) proverava da je stvarno slika. Slika se vidi na pločici za
// stolom i u spisku ko je online; ko je nema, ima prvo slovo imena.

import { el } from './dom.js';

const SIZE = 256;
const MAX_BYTES = 80 * 1024; // isto kao MAX_AVATAR_BYTES na serveru
const CAMERA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/>' +
  '<circle cx="12" cy="13" r="3.5"/></svg>';

let getToken = () => null;
let myAvatar = null;
let myName = '';
let dlg = null;

/** Kružić: slika ako je ima, inače slovo (ili 🤖 / ?). Postojeća slika se ne crta ponovo. */
export function paintAvatar(target, url, letter) {
  target.classList.toggle('has-photo', !!url);
  if (!url) {
    target.textContent = letter;
    return;
  }
  const img = target.querySelector('img') ?? el('img');
  img.alt = '';
  if (img.getAttribute('src') !== url) img.src = url;
  if (target.childNodes.length !== 1 || target.firstChild !== img) target.replaceChildren(img);
}

/** Prvo slovo imena za kružić bez slike. */
export const firstLetter = (name) => (name || '?').trim().charAt(0).toUpperCase();

function paintMine() {
  const btn = document.getElementById('homeAvatarBtn');
  if (btn) {
    paintAvatar(btn.querySelector('.home-avatar-face'), myAvatar, firstLetter(myName));
    btn.hidden = !myName;
  }
  if (dlg) {
    paintAvatar(dlg.querySelector('#avatarPreview'), myAvatar, firstLetter(myName));
    dlg.querySelector('#avatarRemove').hidden = !myAvatar;
  }
}

/** Posle /api/me (prijava) — moja slika i ime za kružić na početnom ekranu. */
export function setMyAvatar(url, name) {
  myAvatar = url || null;
  myName = name || '';
  paintMine();
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Iseci na sredini u kvadrat i smanji (WebP, a gde ga pregledač ne pravi — JPEG). */
async function squareImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Ta slika ne može da se otvori.'));
      i.src = url;
    });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, SIZE, SIZE);
    let blob = await canvasBlob(c, 'image/webp', 0.85);
    if (!blob || blob.type !== 'image/webp') blob = await canvasBlob(c, 'image/jpeg', 0.85);
    for (const q of [0.7, 0.5]) if (blob && blob.size > MAX_BYTES) blob = await canvasBlob(c, 'image/jpeg', q);
    if (!blob) throw new Error('Ta slika ne može da se otvori.');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function send(method, body = null) {
  const headers = { Authorization: `Bearer ${getToken()}` };
  if (body) headers['Content-Type'] = body.type;
  const res = await fetch('/api/avatar', { method, headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Slika nije poslata. Pokušaj ponovo.');
  return data;
}

function dialogEl() {
  if (dlg) return dlg;
  dlg = el('dialog', 'app-dialog avatar-dialog');
  dlg.id = 'avatarDlg';
  dlg.innerHTML = `
    <h2 class="app-dialog-title">Tvoja slika</h2>
    <p class="app-dialog-text">Vide je ostali igrači za stolom. Izaberi sliku iz galerije ili se slikaj —
      sama se iseče u krug.</p>
    <div class="avatar-preview"><span class="avatar-circle" id="avatarPreview"></span></div>
    <p class="avatar-msg" id="avatarMsg" role="alert"></p>
    <input type="file" accept="image/*" id="avatarFile" hidden>
    <div class="app-dialog-buttons">
      <button type="button" class="mode-btn primary" id="avatarChoose">Izaberi sliku</button>
      <button type="button" class="mode-btn danger" id="avatarRemove">Ukloni</button>
      <button type="button" class="mode-btn" id="avatarClose">Zatvori</button>
    </div>`;
  document.body.appendChild(dlg);
  const msg = (text) => { dlg.querySelector('#avatarMsg').textContent = text; };
  const file = dlg.querySelector('#avatarFile');
  dlg.querySelector('#avatarChoose').onclick = () => file.click();
  dlg.querySelector('#avatarClose').onclick = () => dlg.close();
  file.onchange = async () => {
    const chosen = file.files?.[0];
    file.value = '';
    if (!chosen) return;
    msg('Šaljem sliku…');
    try {
      const data = await send('POST', await squareImage(chosen));
      myAvatar = data.url;
      paintMine();
      msg('');
    } catch (e) {
      msg(e.message);
    }
  };
  dlg.querySelector('#avatarRemove').onclick = async () => {
    try {
      await send('DELETE');
      myAvatar = null;
      paintMine();
      msg('');
    } catch (e) {
      msg(e.message);
    }
  };
  return dlg;
}

/** Kružić sa foto-aparatom pored pozdrava otvara prozor "Tvoja slika". */
export function initAvatarUi(deps) {
  getToken = deps.getToken;
  const btn = document.getElementById('homeAvatarBtn');
  if (!btn) return;
  btn.querySelector('.home-avatar-cam').innerHTML = CAMERA;
  btn.onclick = () => {
    const d = dialogEl();
    d.querySelector('#avatarMsg').textContent = '';
    paintMine();
    d.showModal();
  };
}
