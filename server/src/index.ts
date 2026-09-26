import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { initDb, flushPersist } from './db.js';
import { authRouter } from './auth/routes.js';
import { adminRouter } from './admin/routes.js';
import { registerSocketHandlers } from './socket/index.js';
import { removeAbandonedWaitingRooms, loadPersistedRooms } from './rooms/RoomManager.js';

// dist/index.js -> server/dist -> server -> project root, where
// preferans.html/app.js/engine/dist all live. Serving them same-origin
// with the API/socket avoids CORS and any hardcoded server URL in the
// client (fetch('/api/...') and io('/') just work on any host this runs on).
const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');

async function main(): Promise<void> {
  await initDb();

  // Korisnikov zahtev (2026-09-18): "da se pamte ruke i partija koje nisu
  // zavrsene, da se moze nastaviti u drugom terminu" — vraca sve
  // nezavrsene sobe iz baze nazad u memoriju PRE nego sto server pocne da
  // prima konekcije, tako da se M6 reconnect (registerRoomHandlers) desi
  // transparentno kao da server nikad nije ni restartovan.
  const loadedRooms = loadPersistedRooms();
  if (loadedRooms > 0) console.log(`[STARTUP] Restored ${loadedRooms} active room(s) from disk`);

  const app = express();
  // Nginx (proizvodnja) prosledjuje pravu IP adresu klijenta preko
  // X-Forwarded-For (vidi proxy_set_header u nginx configu), ali Express
  // NE koristi to zaglavlje za req.ip dok se eksplicitno ne kaze da veruje
  // proxy-ju — bez ovoga bi req.ip za SVAKI zahtev vracao 127.0.0.1 (samu
  // nginx masinu), sto bi rate-limiting (dole, po IP-u) ucinilo beskorisnim
  // (svi korisnici bi delili ISTI "IP"). `1` = veruj tacno jednom hop-u
  // (nas nginx), ne bilo kom X-Forwarded-For koji klijent sam izmisli.
  app.set('trust proxy', 1);
  app.use(express.json());
  // BAG (uzivo prijavljen, veceras VISE PUTA: "popravio si ali i dalje isto"
  // — poprvke SU stvarno bile na serveru, ali browser je i dalje ucitavao
  // STARI app.js iz keša). express.static bez opcija ne salje Cache-Control
  // — bez njega neki browseri heuristicki kesiraju staticke fajlove i BEZ
  // eksplicitnog zahteva, pa cak ni tvrdi F5 ne garantuje sveze ucitavanje.
  // no-cache (ne "no-store") i dalje dozvoljava keširanje ali FORSIRA
  // revalidaciju (If-None-Match/304) na SVAKI zahtev — uvek sveze, uz skoro
  // istu brzinu jer 304 odgovor nema telo.
  app.use(express.static(PROJECT_ROOT, {
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache');
    },
  }));

  app.get('/', (_req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, 'preferans.html'));
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api', authRouter);
  app.use('/api/admin', adminRouter);

  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, { cors: { origin: true } });
  registerSocketHandlers(io);

  const port = Number(process.env.PORT) || 3001;
  httpServer.listen(port, () => {
    console.log(`Preferans server listening on port ${port}`);
  });

  // pm2 restart/redeploy sends SIGTERM — flush any debounced DB write
  // (persist() batches writes over up to 2s) before the process actually
  // exits, so a restart can't silently drop the last write.
  const shutdown = (signal: string) => {
    console.log(`[SHUTDOWN] ${signal} received, flushing DB before exit`);
    flushPersist();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Uzivo prijavljen bag KROZ AUDIT (2026-09-26, pred lansiranje): nijedan
  // socket handler nije imao try/catch — JEDAN los-formiran zahtev od
  // JEDNOG klijenta (npr. discard sa nedostajucim cardIds) bi bacio
  // neuhvacen izuzetak i SRUSIO CEO PROCES, obarajuci SVE aktivne partije,
  // ne samo tog klijenta. Individualni handleri su sad umotani (vidi
  // wrapSocketErrors u socket/index.ts) — ovo je POSLEDNJA linija odbrane
  // za bilo sta sto ipak proklizi (npr. greska van bilo kog socket
  // handlera). Flush-uj bazu (isti razlog kao SIGTERM/SIGINT — persist() je
  // debounced do 2s) pre nego sto pustimo Node da izadje i PM2 restartuje.
  process.on('uncaughtException', (err) => {
    console.error('[FATAL] uncaughtException:', err);
    try { flushPersist(); } catch (flushErr) { console.error('[FATAL] flush failed:', flushErr); }
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] unhandledRejection:', reason);
    try { flushPersist(); } catch (flushErr) { console.error('[FATAL] flush failed:', flushErr); }
    process.exit(1);
  });

  // Svakih 5 minuta ocisti WAITING sobe bez aktivnih igraca starije od 30 min.
  setInterval(() => {
    const removed = removeAbandonedWaitingRooms();
    if (removed > 0) console.log(`[CLEANUP] Removed ${removed} abandoned waiting room(s)`);
  }, 5 * 60 * 1000);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
