import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { initDb } from './db.js';
import { authRouter } from './auth/routes.js';
import { registerSocketHandlers } from './socket/index.js';

async function main(): Promise<void> {
  await initDb();

  const app = express();
  app.use(express.json());
  app.use(express.static(process.cwd()));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api', authRouter);

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
