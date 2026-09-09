import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { initDb } from './db.js';
import { authRouter } from './auth/routes.js';
import { adminRouter } from './admin/routes.js';
import { registerSocketHandlers } from './socket/index.js';

// dist/index.js -> server/dist -> server -> project root, where
// preferans.html/app.js/engine/dist all live. Serving them same-origin
// with the API/socket avoids CORS and any hardcoded server URL in the
// client (fetch('/api/...') and io('/') just work on any host this runs on).
const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');

async function main(): Promise<void> {
  await initDb();

  const app = express();
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
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
