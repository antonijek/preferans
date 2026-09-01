import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { get } from '../db.js';

export interface AuthedRequest extends Request {
  userId?: number;
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }
  return secret;
}

export function signToken(userId: number): string {
  return jwt.sign({ userId }, jwtSecret(), { expiresIn: '30d' });
}

export function verifyToken(token: string): { userId: number } {
  return jwt.verify(token, jwtSecret()) as { userId: number };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }
  try {
    const payload = verifyToken(header.slice('Bearer '.length));
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

/** requireAuth, plus the token's user must have is_admin=1 in the DB. */
export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const user = get<{ is_admin: number }>('SELECT is_admin FROM users WHERE id = ?', [req.userId!]);
    if (!user?.is_admin) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    next();
  });
}
