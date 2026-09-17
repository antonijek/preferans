import { Router } from 'express';
import { get, run, getMatchesForUser, getMatchById } from '../db.js';
import { hashPassword, verifyPassword } from './password.js';
import { signToken, requireAuth } from './middleware.js';
import type { AuthedRequest } from './middleware.js';

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  name: string | null;
  is_admin: number;
  banned: number;
  rating: number;
}

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const { email, password, name } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const existing = get<Pick<UserRow, 'id'>>('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const passwordHash = await hashPassword(password);
  run('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)', [email, passwordHash, name.trim().slice(0, 40)]);
  const user = get<Pick<UserRow, 'id'>>('SELECT id FROM users WHERE email = ?', [email]);
  res.status(201).json({ token: signToken(user!.id) });
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const user = get<UserRow>('SELECT id, password_hash, banned FROM users WHERE email = ?', [email]);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }
  if (user.banned) {
    res.status(403).json({ error: 'Nalog je suspendovan.' });
    return;
  }
  res.json({ token: signToken(user.id) });
});

authRouter.get('/me', requireAuth, (req: AuthedRequest, res) => {
  const user = get<Pick<UserRow, 'id' | 'email' | 'name' | 'is_admin' | 'rating'>>(
    'SELECT id, email, name, is_admin, rating FROM users WHERE id = ?',
    [req.userId!]
  );
  res.json({
    user: user ? { ...user, name: user.name || user.email, is_admin: !!user.is_admin } : null,
  });
});

// Istorija partija (korisnikov zahtev 2026-09-11) — igrac vidi SAMO partije
// u kojima je ucestvovao. Admin vidi sve preko /api/admin/matches.
authRouter.get('/matches', requireAuth, (req: AuthedRequest, res) => {
  const limitParam = Number(req.query.limit);
  const limit = Number.isInteger(limitParam) ? Math.min(Math.max(1, limitParam), 500) : 100;
  res.json({ matches: getMatchesForUser(req.userId!, limit) });
});

// Detalji jedne partije — samo ako je korisnik bio igrac u njoj.
authRouter.get('/matches/:id', requireAuth, (req: AuthedRequest, res) => {
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
  const userId = req.userId!;
  const participated =
    match.player0_user_id === userId ||
    match.player1_user_id === userId ||
    match.player2_user_id === userId;
  if (!participated) {
    res.status(403).json({ error: 'Not a participant in this match' });
    return;
  }
  res.json({ match });
});
