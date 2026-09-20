import { Router } from 'express';
import { get, all, run, getAllMatches, getMatchById, updateUserRating } from '../db.js';
import { requireAdmin } from '../auth/middleware.js';
import type { AuthedRequest } from '../auth/middleware.js';
import { listAllRoomsDetailed, getRoomByCode, getUserLocation, clearUserLocation } from '../rooms/RoomManager.js';
import { adminKickSeat, adminCloseRoom } from '../socket/roomAdmin.js';
import { forceDisconnectUser } from '../socket/index.js';
import { listOnlineUsers, listOnlineUsersDetailed } from '../presence.js';

interface UserRow {
  id: number;
  email: string;
  name: string | null;
  is_admin: number;
  banned: number;
  credits: number;
  rating: number;
  created_at: string;
}

export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get('/users', (_req, res) => {
  const users = all<UserRow>(
    'SELECT id, email, name, is_admin, banned, credits, rating, created_at FROM users ORDER BY id DESC'
  );
  res.json({ users });
});

adminRouter.delete('/users/:id', (req: AuthedRequest, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId)) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }
  if (targetId === req.userId) {
    res.status(400).json({ error: 'Cannot delete your own admin account' });
    return;
  }
  const existing = get<Pick<UserRow, 'id'>>('SELECT id FROM users WHERE id = ?', [targetId]);
  if (!existing) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  run('DELETE FROM users WHERE id = ?', [targetId]);
  res.json({ ok: true });
});

adminRouter.post('/users/:id/credits', (req: AuthedRequest, res) => {
  const targetId = Number(req.params.id);
  const { delta, reason } = req.body ?? {};
  if (!Number.isInteger(targetId)) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }
  if (!Number.isInteger(delta) || delta === 0) {
    res.status(400).json({ error: 'delta must be a non-zero integer' });
    return;
  }
  const user = get<Pick<UserRow, 'id' | 'credits'>>('SELECT id, credits FROM users WHERE id = ?', [targetId]);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const newBalance = user.credits + delta;
  if (newBalance < 0) {
    res.status(400).json({ error: 'Adjustment would make balance negative' });
    return;
  }
  run('UPDATE users SET credits = ? WHERE id = ?', [newBalance, targetId]);
  run(
    'INSERT INTO credit_log (user_id, delta, reason, admin_user_id) VALUES (?, ?, ?, ?)',
    [targetId, delta, typeof reason === 'string' ? reason.slice(0, 200) : null, req.userId!]
  );
  res.json({ ok: true, credits: newBalance });
});

adminRouter.post('/users/:id/rating', (req: AuthedRequest, res) => {
  const targetId = Number(req.params.id);
  const { rating } = req.body ?? {};
  if (!Number.isInteger(targetId)) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }
  if (!Number.isInteger(rating) || rating < 0 || rating > 5000) {
    res.status(400).json({ error: 'rating must be an integer between 0 and 5000' });
    return;
  }
  const user = get<Pick<UserRow, 'id'>>('SELECT id FROM users WHERE id = ?', [targetId]);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  updateUserRating(targetId, rating);
  res.json({ ok: true, rating });
});

adminRouter.post('/users/:id/name', (req: AuthedRequest, res) => {
  const targetId = Number(req.params.id);
  const { name } = req.body ?? {};
  if (!Number.isInteger(targetId)) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }
  const trimmed = typeof name === 'string' ? name.trim().slice(0, 40) : '';
  if (!trimmed) {
    res.status(400).json({ error: 'name must be a non-empty string' });
    return;
  }
  const user = get<Pick<UserRow, 'id'>>('SELECT id FROM users WHERE id = ?', [targetId]);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  run('UPDATE users SET name = ? WHERE id = ?', [trimmed, targetId]);
  res.json({ ok: true, name: trimmed });
});

adminRouter.post('/users/:id/admin', (req: AuthedRequest, res) => {
  const targetId = Number(req.params.id);
  const { is_admin } = req.body ?? {};
  if (!Number.isInteger(targetId)) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }
  if (typeof is_admin !== 'boolean') {
    res.status(400).json({ error: 'is_admin must be a boolean' });
    return;
  }
  // Ne dozvoli sebi da skines admin prava — requireAdmin ponovo cita is_admin
  // iz baze na SVAKOM sledecem zahtevu, pa bi ovo zakljucalo nalog van SVIH
  // admin ruta, uklj. one koja bi mogla da to vrati nazad.
  if (targetId === req.userId && is_admin === false) {
    res.status(400).json({ error: 'Cannot revoke your own admin rights' });
    return;
  }
  const user = get<Pick<UserRow, 'id'>>('SELECT id FROM users WHERE id = ?', [targetId]);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  run('UPDATE users SET is_admin = ? WHERE id = ?', [is_admin ? 1 : 0, targetId]);
  res.json({ ok: true, is_admin });
});

adminRouter.post('/users/:id/ban', (req: AuthedRequest, res) => {
  const targetId = Number(req.params.id);
  const { banned } = req.body ?? {};
  if (!Number.isInteger(targetId)) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }
  if (typeof banned !== 'boolean') {
    res.status(400).json({ error: 'banned must be a boolean' });
    return;
  }
  // Samo-banovanje ne bi ni prekinulo TRENUTNU sesiju (ban se proverava samo
  // na login/socket-connect, ne po JWT-u) ali bi trajno zakljucalo jedinog
  // admina van sledeceg logina, bez nacina da se to vrati.
  if (targetId === req.userId && banned === true) {
    res.status(400).json({ error: 'Cannot ban your own admin account' });
    return;
  }
  const user = get<Pick<UserRow, 'id'>>('SELECT id FROM users WHERE id = ?', [targetId]);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  run('UPDATE users SET banned = ? WHERE id = ?', [banned ? 1 : 0, targetId]);
  if (banned) {
    // Ako je trenutno za stolom, izbaci ga (AI preuzima) PRE nego sto mu se
    // sokет ugasi — plain disconnect bi ostavio sediste zamrznuto zauvek,
    // banovan igrac se nikad ne moze vratiti da ga oslobodi.
    const loc = getUserLocation(targetId);
    if (loc?.role === 'player') {
      const room = getRoomByCode(loc.code);
      if (room) adminKickSeat(room, loc.seat, 'Nalog suspendovan');
    } else if (loc?.role === 'spectator') {
      clearUserLocation(targetId);
    }
    forceDisconnectUser(targetId);
  }
  res.json({ ok: true, banned });
});

adminRouter.get('/rooms', (_req, res) => {
  res.json({ rooms: listAllRoomsDetailed() });
});

adminRouter.post('/rooms/:code/kick', (req, res) => {
  const code = String(req.params.code || '');
  const { seat, reason } = req.body ?? {};
  const room = getRoomByCode(code);
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }
  if (seat !== 0 && seat !== 1 && seat !== 2) {
    res.status(400).json({ error: 'seat must be 0, 1, or 2' });
    return;
  }
  const result = adminKickSeat(room, seat, typeof reason === 'string' ? reason : undefined);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ ok: true, frozenBula: result.frozenBula });
});

adminRouter.post('/rooms/:code/close', (req, res) => {
  const code = String(req.params.code || '');
  const { reason } = req.body ?? {};
  const room = getRoomByCode(code);
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }
  adminCloseRoom(room, typeof reason === 'string' ? reason : undefined);
  res.json({ ok: true });
});

// Istorija partija (korisnikov zahtev 2026-09-11) — admin vidi SVE partije.
// `limit` je opcionalan (default 100, max 500). JSON polja ostaju stringovi
// — admin frontend ih parsira (ili salje sirove, svejedno).
adminRouter.get('/matches', (req, res) => {
  const limitParam = Number(req.query.limit);
  const limit = Number.isInteger(limitParam) ? Math.min(Math.max(1, limitParam), 500) : 100;
  res.json({ matches: getAllMatches(limit) });
});

// Detalji jedne partije — ukljucuje hands_json (niz rundi) za replay.
adminRouter.get('/matches/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Invalid match id' });
    return;
  }
  const match = getMatchById(id);
  if (!match) {
    res.status(404).json({ error: 'Match not found' });
    return;
  }
  res.json({ match });
});

// Kredit audit trail (korisnikov zahtev 2026-09-17) — podatak vec postoji
// (credit_log se pise od pocetka), samo nije imao read endpoint. Inline SQL
// (isti obrazac kao ostale admin upite ovde) — JOIN dva puta na users da
// klijent ne mora da radi N+1 lookup za imena.
adminRouter.get('/credit-log', (req, res) => {
  const limitParam = Number(req.query.limit);
  const limit = Number.isInteger(limitParam) ? Math.min(Math.max(1, limitParam), 500) : 100;
  const userIdParam = Number(req.query.userId);
  const hasUserFilter = Number.isInteger(userIdParam);
  const entries = all(
    `SELECT cl.id, cl.user_id, u.email AS user_email, u.name AS user_name,
            cl.delta, cl.reason, cl.admin_user_id, a.email AS admin_email, cl.created_at
     FROM credit_log cl
     JOIN users u ON u.id = cl.user_id
     JOIN users a ON a.id = cl.admin_user_id
     ${hasUserFilter ? 'WHERE cl.user_id = ?' : ''}
     ORDER BY cl.id DESC LIMIT ?`,
    hasUserFilter ? [userIdParam, limit] : [limit]
  );
  res.json({ entries });
});

// "Ko je online" (korisnikov zahtev 2026-09-20 — "zelim da vidim ko
// dolazi na sajt", povodom novog posetioca koji je otisao pre nego sto
// je iko stigao da mu se pridruzi) — spaja presence.ts (live konekcije)
// sa users tabelom (email/rejting/datum registracije) da admin panel
// pokaze KO je trenutno na sajtu, ne samo broj.
adminRouter.get('/online-users', (_req, res) => {
  const detailed = listOnlineUsersDetailed();
  const users = detailed.map((u) => {
    const row = get<{ email: string; rating: number; created_at: string }>(
      'SELECT email, rating, created_at FROM users WHERE id = ?',
      [u.userId]
    );
    return {
      userId: u.userId,
      name: u.name,
      email: row?.email ?? null,
      rating: row?.rating ?? null,
      registeredAt: row?.created_at ?? null,
      connectedAt: new Date(u.connectedAt).toISOString(),
    };
  });
  res.json({ users });
});

// Dashboard "Pregled" tab — agregira iz vec postojecih izvora, bez nove tabele.
adminRouter.get('/dashboard-stats', (_req, res) => {
  const totalUsers = get<{ c: number }>('SELECT COUNT(*) AS c FROM users')?.c ?? 0;
  // ended_at je upisan preko datetime('now') (UTC) — date('now') je isto UTC,
  // dosledno sa kako se ended_at vec tretira svuda drugde (+'Z' trik u
  // matches.html/admin.html pri parsiranju).
  const matchesToday = get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM match_log WHERE date(ended_at) = date('now')"
  )?.c ?? 0;
  res.json({
    totalUsers,
    onlineNow: listOnlineUsers().length,
    activeRooms: listAllRoomsDetailed().length,
    matchesToday,
  });
});
