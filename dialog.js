// Prozori u stilu igre umesto sistemskih confirm()/prompt() (po uzoru na
// Loru, 2026-10-20) — sistemski su beli, sa adresom sajta u naslovu, i na
// telefonu deluju kao greska. Izgled: dialog.app-dialog (preferans.css,
// isto kao .box) + dialog.css. Tekst uvek kroz textContent.

import { el } from './dom.js';

let dlg = null;

function dialogEl() {
  if (dlg) return dlg;
  dlg = el('dialog', 'app-dialog');
  dlg.id = 'appDialog';
  dlg.innerHTML = `
    <h2 class="app-dialog-title" id="appDialogTitle"></h2>
    <p class="app-dialog-text" id="appDialogText"></p>
    <div id="appDialogExtra"></div>
    <div class="app-dialog-buttons">
      <button type="button" class="mode-btn" id="appDialogCancel"></button>
      <button type="button" class="mode-btn primary" id="appDialogOk"></button>
    </div>`;
  document.body.appendChild(dlg);
  return dlg;
}

/** Pitanje sa U redu/Otkaži. Vraca true samo za U redu (Esc i Otkaži = false). cancel: null = bez Otkaži. */
export function askConfirm({ title, text = '', ok = 'U redu', cancel = 'Otkaži', danger = false, extra = null }) {
  const d = dialogEl();
  d.querySelector('#appDialogTitle').textContent = title;
  d.querySelector('#appDialogText').textContent = text;
  d.querySelector('#appDialogExtra').replaceChildren(...(extra ? [extra] : []));
  const okBtn = d.querySelector('#appDialogOk');
  okBtn.textContent = ok;
  okBtn.className = `mode-btn ${danger ? 'danger' : 'primary'}`;
  const cancelBtn = d.querySelector('#appDialogCancel');
  cancelBtn.textContent = cancel ?? '';
  cancelBtn.hidden = cancel === null;
  return new Promise((resolve) => {
    const onClose = () => {
      d.removeEventListener('close', onClose);
      resolve(d.returnValue === 'ok');
    };
    d.returnValue = '';
    d.addEventListener('close', onClose);
    okBtn.onclick = () => d.close('ok');
    cancelBtn.onclick = () => d.close('');
    d.showModal();
  });
}

/** Link koji pregledac nije dao da se sam kopira — prikazan oznacen, da se kopira rukom. */
export function showLink({ title, url }) {
  const field = el('div', 'text-field');
  const input = el('input');
  input.id = 'appDialogLink';
  input.readOnly = true;
  input.value = url;
  field.appendChild(input);
  const closed = askConfirm({
    title, text: 'Pregledač nije dozvolio automatsko kopiranje — označi link i kopiraj ga.', ok: 'Zatvori', cancel: null, extra: field,
  });
  input.focus();
  input.select();
  return closed;
}

/** Kopira link (dugme na 2 s pise "Kopirano ✓"); ako pregledac to ne dozvoli, prikaze ga u prozoru. */
export function copyLink(url, title, btn) {
  const copied = () => {
    if (!btn) return;
    const old = btn.textContent;
    btn.textContent = 'Kopirano ✓';
    setTimeout(() => { btn.textContent = old; }, 2000);
  };
  if (!navigator.clipboard?.writeText) return showLink({ title, url });
  return navigator.clipboard.writeText(url).then(copied, () => showLink({ title, url }));
}
