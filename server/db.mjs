// SQLite storage for CareConnect. Uses Node's built-in node:sqlite (no native deps).
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data')
mkdirSync(DATA_DIR, { recursive: true })
export const DB_PATH = join(DATA_DIR, 'careconnect.db')

export const db = new DatabaseSync(DB_PATH)
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL,
    portal TEXT,
    display_zh TEXT NOT NULL,
    display_en TEXT NOT NULL,
    org TEXT NOT NULL,
    participant_id TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL REFERENCES users(username),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS participants (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    participant_id TEXT NOT NULL REFERENCES participants(id),
    cycle_no INTEGER NOT NULL,
    visit_label TEXT NOT NULL,
    client_id TEXT,
    data TEXT NOT NULL,
    UNIQUE (participant_id, cycle_no, visit_label)
  );
  CREATE TABLE IF NOT EXISTS verifications (
    submission_id TEXT PRIMARY KEY REFERENCES submissions(id),
    verified_by TEXT NOT NULL,
    verified_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS revisions (id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES submissions(id), data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, participant_id TEXT NOT NULL, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS missed_visits (
    id TEXT PRIMARY KEY, participant_id TEXT NOT NULL, cycle_no INTEGER NOT NULL, visit_label TEXT NOT NULL, data TEXT NOT NULL,
    UNIQUE (participant_id, cycle_no, visit_label)
  );
  CREATE TABLE IF NOT EXISTS alert_actions (id TEXT PRIMARY KEY, submission_id TEXT NOT NULL, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS drafts (username TEXT NOT NULL, draft_key TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (username, draft_key));
  CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL);

  -- Original submissions, revisions and the audit trail are append-only.
  CREATE TRIGGER IF NOT EXISTS submissions_no_update BEFORE UPDATE ON submissions BEGIN SELECT RAISE(ABORT, 'submissions are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS submissions_no_delete BEFORE DELETE ON submissions BEGIN SELECT RAISE(ABORT, 'submissions are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS revisions_no_update BEFORE UPDATE ON revisions BEGIN SELECT RAISE(ABORT, 'revisions are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS revisions_no_delete BEFORE DELETE ON revisions BEGIN SELECT RAISE(ABORT, 'revisions are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;
  CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;
`)

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// ---------- passwords ----------

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 32).toString('hex') }
}

export function checkPassword(user, password) {
  if (!user || typeof password !== 'string') return false
  const { hash } = hashPassword(password, user.salt)
  return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.password_hash, 'hex'))
}

export function randomPassword() {
  // 6 digits — easy for an older patient to type on a phone.
  return String(100000 + (randomBytes(4).readUInt32BE() % 900000))
}

// ---------- JSON row helpers ----------

export const parse = row => (row ? JSON.parse(row.data) : null)
export const all = (sql, ...params) => db.prepare(sql).all(...params)
export const get = (sql, ...params) => db.prepare(sql).get(...params)
export const run = (sql, ...params) => db.prepare(sql).run(...params)

export function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
}

export function audit(actor, action, entity, entityId, detail = '') {
  const entry = { id: newId('AUD'), at: new Date().toISOString(), actor, action, entity, entityId, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) }
  run('INSERT INTO audit (data) VALUES (?)', JSON.stringify(entry))
  return entry
}

// ---------- automatic backups ----------

const BACKUP_DIR = join(DATA_DIR, 'backups')
const KEEP_BACKUPS = Number(process.env.KEEP_BACKUPS || 14)

export function backupNow() {
  mkdirSync(BACKUP_DIR, { recursive: true })
  const file = join(BACKUP_DIR, `careconnect-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
  const files = readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort()
  for (const old of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) unlinkSync(join(BACKUP_DIR, old))
  return file
}
