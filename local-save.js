// Partija protiv računara se čuva na uređaju posle svakog poteza (korisnik 2026-11-24: partije su ostajale
// nedovršene jer telefon ugasi aplikaciju u pozadini ili se stranica osveži, a partija nigde nije bila sačuvana).
// Nastavlja se tačno od mesta gde je stala, i usred ruke, pa osvežavanje ne donosi novo deljenje.

const KEY = 'pref_local_match';
// Podići kad se promeni oblik stanja igre (engine GameState), da se stara sačuvana partija ne učita pogrešno.
const VERSION = 1;

export function saveLocalMatch(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, savedAt: Date.now(), ...data }));
  } catch (e) {
    console.warn('[local-save] partija nije sačuvana:', e);
  }
}

/** Sačuvana nedovršena partija ili null (nema je, stara verzija ili oštećen zapis). */
export function loadLocalMatch() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch (e) {
    console.warn('[local-save] čitanje nije uspelo:', e);
    return null;
  }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data?.version === VERSION && data.state?.phase && data.state.phase !== 'MATCH_OVER') return data;
  } catch (e) {
    console.warn('[local-save] oštećen zapis, brišem:', e);
  }
  clearLocalMatch();
  return null;
}

export function clearLocalMatch() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    console.warn('[local-save] brisanje nije uspelo:', e);
  }
}

/** Tekst za dugme: „Nastavi partiju (krug 7)“. */
export function resumeLabel(data) {
  return `▶ Nastavi partiju (krug ${data.state.round ?? 1})`;
}
