// AI heuristike za Preferans — čiste funkcije, bez stanja
// Koriste se iz app.js za AI igrače
//
// OSNOVNO PRAVILO (korisnik 2026-10-26): karte se uvek broje. U svakom trenutku se zna sta je
// proslo u svakom stihu ove ruke, pa i sta je ostalo kod ostalih igraca — za sve boje. Primer:
// u 1. stihu prosli A, 10, 8, 7 karo, kod mene 9, K, J karo — dama karo je suva kod nekog.
// Svako pravilo za nosioca i pratioca racuna iz odigranog + svoje ruke, ne iz "visoka/niska karta".
//
// Implementacija je podeljena po temi (podela izvedena bez promene ponasanja):
//   aiHandEval.ts     — procena snage ruke, deljeno izmedju ostalih
//   aiBidding.ts       — licitacija, proglašavanje igre, Igra-confirm, refe
//   aiFollowKontra.ts  — Dodjem/Ne dodjem, Kontra, Zovem/Sam
//   aiDiscardPlay.ts   — odbacivanje u talon, odigravanje karte
// Svi dosadasnji importeri (app.js, server/src/ai/aiSeat.ts,
// engine/src/aiAutoplay.ts, engine/tools/*, engine/test/*) nastavljaju da
// importuju iz ./ai.js kao i do sad — nema promene na poziv-mestima.
export * from './aiHandEval.js';
export * from './aiBidding.js';
export * from './aiFollowKontra.js';
export * from './aiDiscardPlay.js';

export const AI_VERSION = '1.0';
