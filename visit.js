// Posete (korisnik 2026-11-03): pri otvaranju sajta javi serveru odakle je posetilac dosao, a kad pocne igru
// i to (server/src/visits.ts, admin "Pregled"). Posetilac je nasumican broj sacuvan u pregledacu, bez IP adrese.
// Poseta se igracu ne prikazuje i ne sme da zaustavi igru, pa svaka greska samo ide u konzolu.
const VISITOR_KEY = 'pref_visitor';
const marked = new Set();
let deps = { getToken: () => null };
let sessionVisitor = null;

function visitorId() {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch (err) {
    console.warn('[poseta] pregledač ne pamti posetioca', err); // privatni mod ili stariji pregledač
    sessionVisitor ??= `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return sessionVisitor;
  }
}

function send(path, body) {
  const token = deps.getToken();
  fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ visitor: visitorId(), ...body }),
  }).catch((err) => console.warn('[poseta]', err));
}

function referrer() {
  try {
    const ref = document.referrer;
    return ref && new URL(ref).host === location.host ? '' : ref; // prelaz unutar sajta (npr. sa „Vodiča“)
  } catch (err) {
    console.warn('[poseta] referrer', err);
    return '';
  }
}

export function initVisits(options) {
  deps = options;
  send('/api/visit', {
    ref: referrer(),
    fb: new URLSearchParams(location.search).has('fbclid'),
    app: matchMedia('(display-mode: standalone)').matches,
  });
}

/** Poceo igru: 'local' (protiv racunara) ili 'online'; javlja se jednom po otvaranju sajta. */
export function markPlayed(kind) {
  if (marked.has(kind)) return;
  marked.add(kind);
  send('/api/visit/played', { kind });
}
