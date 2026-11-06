// „Zaboravili ste lozinku?“ (korisnik, 2026-11-06; isto kao u Lori, lora/reset.js): igrač upiše email
// i dobije link mejlom; link (?reset=…) otvara prozor za novu lozinku, posle čega je odmah prijavljen.
// Server: server/src/auth/passwordReset.ts. Tekstovi uvek kroz textContent.

import { $ } from './dom.js';

const SENT = 'Ako nalog sa tim emailom postoji, poslali smo vam link za novu lozinku. '
  + 'Pogledajte i neželjenu poštu (Spam).';
const OFFLINE = 'Ne mogu da se povežem sa serverom.';

async function post(path, body) {
  const res = await fetch(`/api/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

// link je jednokratan — ne ostaje u adresi (osvežavanje, deljenje, istorija)
function dropResetParam() {
  const url = new URL(location.href);
  url.searchParams.delete('reset');
  history.replaceState(null, '', url);
}

/** emailNow(): email iz forme za prijavu; onToken(token): prijava odmah posle nove lozinke. */
export function initPasswordReset({ emailNow, onToken }) {
  const forgotDlg = $('forgotDlg');
  $('forgotBtn').addEventListener('click', () => {
    $('forgotEmail').value = emailNow();
    $('forgotMsg').textContent = '';
    $('forgotError').textContent = '';
    $('forgotSend').textContent = 'Pošalji link';
    forgotDlg.showModal();
  });
  $('forgotClose').addEventListener('click', () => forgotDlg.close());
  $('forgotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('forgotMsg').textContent = '';
    $('forgotError').textContent = '';
    $('forgotSend').disabled = true;
    try {
      const { ok, data } = await post('password/forgot', { email: $('forgotEmail').value.trim(), app: 'preferans' });
      if (ok) {
        $('forgotMsg').textContent = SENT;
        $('forgotSend').textContent = 'Pošalji ponovo';
      } else {
        $('forgotError').textContent = data.error || 'Slanje nije uspelo. Pokušajte ponovo.';
      }
    } catch {
      $('forgotError').textContent = OFFLINE;
    } finally {
      $('forgotSend').disabled = false;
    }
  });

  const token = new URLSearchParams(location.search).get('reset');
  if (!token) return;
  const resetDlg = $('resetDlg');
  $('resetCancel').addEventListener('click', () => { dropResetParam(); resetDlg.close(); });
  $('resetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = $('resetPassword').value;
    if (password !== $('resetPassword2').value) {
      $('resetError').textContent = 'Lozinke se ne poklapaju.';
      return;
    }
    $('resetError').textContent = '';
    $('resetSave').disabled = true;
    try {
      const { data } = await post('password/reset', { token, password });
      if (data.token) {
        dropResetParam();
        resetDlg.close();
        onToken(data.token);
      } else {
        $('resetError').textContent = data.error || 'Lozinka nije sačuvana. Pokušajte ponovo.';
      }
    } catch {
      $('resetError').textContent = OFFLINE;
    } finally {
      $('resetSave').disabled = false;
    }
  });
  resetDlg.showModal();
}
