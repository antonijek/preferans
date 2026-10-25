// Promena posle ruke na pločici igrača (korisnik 2026-10-25, bule i supe da se
// "preračunavaju odmah"): kad se ruka završi, ispod bula i supa piše za koliko su se
// promenile. Ekran sa rezultatom prekriva sto, pa se oznake gase tek kad počne
// sledeća ruka i sto se opet vidi.

const FADE_MS = 2500;
let fadeTimer = null;
let active = false;

const signed = (n) => (n > 0 ? `+${n}` : `−${-n}`);

function setDelta(id, value, good) {
  const e = document.getElementById(id);
  if (!e || !value) return;
  e.textContent = signed(value);
  e.classList.toggle('good', good);
  e.classList.toggle('bad', !good);
  active = true;
}

/** deltas: [{ seat, bule, left, right }] — razlike posle upravo završene ruke. */
export function showSeatDeltas(deltas) {
  clearSeatDeltas();
  for (const d of deltas) {
    // bula koja pada je dobra (prolaz), supa koja raste je dobra
    setDelta(`delta-bule-${d.seat}`, d.bule, d.bule < 0);
    setDelta(`delta-left-${d.seat}`, d.left, d.left > 0);
    setDelta(`delta-right-${d.seat}`, d.right, d.right > 0);
  }
}

/** Sto se opet vidi (nova ruka) — oznake polako nestaju. */
export function fadeSeatDeltas() {
  if (!active || fadeTimer !== null) return;
  for (const e of document.querySelectorAll('.seat-delta')) e.classList.add('fading');
  fadeTimer = setTimeout(clearSeatDeltas, FADE_MS);
}

export function clearSeatDeltas() {
  clearTimeout(fadeTimer);
  fadeTimer = null;
  active = false;
  for (const e of document.querySelectorAll('.seat-delta')) {
    e.textContent = '';
    e.classList.remove('good', 'bad', 'fading');
  }
}
