import { Router } from 'express';
import { get, all, run } from '../db.js';
import { requireAdmin } from '../auth/middleware.js';
import type { AuthedRequest } from '../auth/middleware.js';
import { listAllRoomsDetailed } from '../rooms/RoomManager.js';

interface UserRow {
  id: number;
  email: string;
  name: string | null;
  is_admin: number;
  credits: number;
  created_at: string;
}

export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get('/users', (_req, res) => {
  const users = all<UserRow>(
    'SELECT id, email, name, is_admin, credits, created_at FROM users ORDER BY id DESC'
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

adminRouter.get('/rooms', (_req, res) => {
  res.json({ rooms: listAllRoomsDetailed() });
});
