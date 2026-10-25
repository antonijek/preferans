// Javno je SAMO ono sto treba pregledacu (isti princip kao Lora). Do 2026-10-25 je
// express.static delio ceo koren projekta, pa su se sa sajta mogli preuzeti
// server/data.db (nalozi za Preferans i Loru), kod servera, alati i beleske.
// Tacke u putanji su dozvoljene samo ispred ekstenzije, pa ".." ne moze da izadje iz foldera.

const PUBLIC: RegExp[] = [
  /^\/$/,
  /^\/[\w-]+\.(?:html|js|css)$/, // stranice, klijentski moduli, sw.js, stilovi
  /^\/(?:icon\.svg|manifest\.json)$/,
  /^\/icons\/(?:[\w-]+\/)*[\w-]+\.(?:svg|png|jpg|webp)$/,
  /^\/engine\/dist\/[\w-]+\.js$/,
];

/** Da li sme da se posluzi staticki fajl na ovoj putanji (req.path, jos nedekodiran). */
export function isPublicPath(urlPath: string): boolean {
  return PUBLIC.some((re) => re.test(urlPath));
}
