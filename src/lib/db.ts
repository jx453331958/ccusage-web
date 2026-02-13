import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const DB_PATH = process.env.DATABASE_PATH || './data/ccusage.db';

let db: Database.Database | null = null;

function getDatabase(): Database.Database {
  if (!db) {
    // Ensure data directory exists
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Initialize database
    db = new Database(DB_PATH);

    // Enable WAL mode for better concurrent access
    db.pragma('journal_mode = WAL');

    // Initialize schema on first access
    initializeDatabase();
  }
  return db;
}

// Initialize schema
function initializeDatabase() {
  const database = db!;
  // Users table (admin accounts)
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

  // API Keys table (for agents)
  database.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      device_name TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      last_used_at INTEGER
    )
  `);

  // Usage records table
  database.exec(`
    CREATE TABLE IF NOT EXISTS usage_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key_id INTEGER NOT NULL,
      device_name TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      session_id TEXT,
      timestamp INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
    )
  `);

  // Migration: Add model column if it doesn't exist
  const columns = database.prepare("PRAGMA table_info(usage_records)").all() as { name: string }[];
  const hasModelColumn = columns.some((col) => col.name === 'model');
  if (!hasModelColumn) {
    database.exec(`ALTER TABLE usage_records ADD COLUMN model TEXT DEFAULT 'unknown'`);
  }

  // Migration: Add cache token columns if they don't exist
  const columnsAfterModel = database.prepare("PRAGMA table_info(usage_records)").all() as { name: string }[];
  const hasCacheCreateColumn = columnsAfterModel.some((col) => col.name === 'cache_create_tokens');
  if (!hasCacheCreateColumn) {
    database.exec(`ALTER TABLE usage_records ADD COLUMN cache_create_tokens INTEGER DEFAULT 0`);
    database.exec(`ALTER TABLE usage_records ADD COLUMN cache_read_tokens INTEGER DEFAULT 0`);
  }

  // Settings table (for auto-generated secrets, etc.)
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Auto-generate JWT secret if not exists
  const jwtSecret = database.prepare('SELECT value FROM settings WHERE key = ?').get('jwt_secret') as { value: string } | undefined;
  if (!jwtSecret) {
    const secret = crypto.randomBytes(64).toString('hex');
    database.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('jwt_secret', secret);
  }

  // Create indices for better query performance
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_records(timestamp);
    CREATE INDEX IF NOT EXISTS idx_usage_device ON usage_records(device_name);
    CREATE INDEX IF NOT EXISTS idx_usage_api_key ON usage_records(api_key_id);
    CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_records(model);
  `);

  // Create default admin user if no users exist
  const userCount = database.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };

  if (userCount.count === 0) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    const passwordHash = bcrypt.hashSync(password, 10);

    database.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
    console.log(`Default admin user created: ${username}`);
  }
}

export function getJwtSecret(): string {
  const database = getDatabase();
  const row = database.prepare('SELECT value FROM settings WHERE key = ?').get('jwt_secret') as { value: string };
  return row.value;
}

export default getDatabase;

// Type definitions
export interface User {
  id: number;
  username: string;
  password_hash: string;
  created_at: number;
}

export interface ApiKey {
  id: number;
  key: string;
  device_name: string;
  created_at: number;
  last_used_at: number | null;
}

export interface UsageRecord {
  id: number;
  api_key_id: number;
  device_name: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cache_create_tokens: number;
  cache_read_tokens: number;
  session_id: string | null;
  model: string;
  timestamp: number;
  created_at: number;
}
