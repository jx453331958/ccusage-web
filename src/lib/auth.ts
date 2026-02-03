import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import getDb, { type User } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

export interface JWTPayload {
  userId: number;
  username: string;
}

export function generateToken(user: User): string {
  return jwt.sign(
    { userId: user.id, username: user.username } as JWTPayload,
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;

  if (!token) {
    return null;
  }

  const payload = verifyToken(token);
  if (!payload) {
    return null;
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId) as User | undefined;
  return user || null;
}

export function authenticateUser(username: string, password: string): User | null {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;

  if (!user) {
    return null;
  }

  const isValid = bcrypt.compareSync(password, user.password_hash);
  return isValid ? user : null;
}

export function generateApiKey(): string {
  // Generate a random API key (32 bytes = 64 hex characters)
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = 'ccusage_';
  for (let i = 0; i < 48; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

export function verifyApiKey(key: string): { id: number; device_name: string } | null {
  const db = getDb();
  const apiKey = db.prepare('SELECT id, device_name FROM api_keys WHERE key = ?').get(key) as { id: number; device_name: string } | undefined;

  if (apiKey) {
    // Update last_used_at
    db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), apiKey.id);
    return apiKey;
  }

  return null;
}
