import { Router } from 'express';
import { get, run } from '../db.js';
import { hashPassword, verifyPassword } from './password.js';
import { signToken, requireAuth } from './middleware.js';
import type { AuthedRequest } from './middleware.js';

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  name: string | null;
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

  const user = get<UserRow>('SELECT id, password_hash FROM users WHERE email = ?', [email]);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }
  res.json({ token: signToken(user.id) });
});

authRouter.get('/me', requireAuth, (req: AuthedRequest, res) => {
  const user = get<Pick<UserRow, 'id' | 'email' | 'name'>>(
    'SELECT id, email, name FROM users WHERE id = ?',
    [req.userId!]
  );
  res.json({ user: user ? { ...user, name: user.name || user.email } : null });
});
