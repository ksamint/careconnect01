// CareConnect API + static H5 server. Zero npm dependencies: node:http + node:sqlite.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, normalize, extname, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { get, run, all, checkPassword, hashPassword, backupNow, audit, DB_PATH } from './db.mjs'
import { applyOp, studyFor, saveDraft, loadDraft, deleteDraft, HttpError } from './study.mjs'
import { seed } from './seed.mjs'

const PORT = Number(process.env.PORT || 8787)
const STATIC_DIR = resolve(process.env.STATIC_DIR || join(process.cwd(), '..', 'h5', 'dist'))
const STAFF_SESSION_HOURS = 12
const PATIENT_SESSION_DAYS = 30

seed()

// ---------- auth ----------

const failures = new Map() // username → { count, until }

function toUser(row) {
  return {
    username: row.username,
    role: row.role,
    displayNameZh: row.display_zh,
    displayNameEn: row.display_en,
    portal: row.portal,
    organizationId: row.org,
    participantId: row.participant_id ?? null,
  }
}

function sessionUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '')
  if (!token) return null
  const row = get('SELECT u.* , s.expires_at FROM sessions s JOIN users u ON u.username = s.username WHERE s.token = ?', token)
  if (!row || row.expires_at < new Date().toISOString()) return null
  return toUser(row)
}

function requireUser(req) {
  const user = sessionUser(req)
  if (!user) throw new HttpError(401, 'unauthorized')
  return user
}

const isAdmin = u => u.role === 'system_admin' || u.role === 'org_admin'

// ---------- http helpers ----------

function send(res, status, body) {
  const json = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(json)
}

async function readBody(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > 1_000_000) throw new HttpError(413, 'too_large')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'invalid_json')
  }
}

// ---------- routes ----------

async function api(req, res, url) {
  const path = url.pathname
  const method = req.method

  if (path === '/api/health') return send(res, 200, { ok: true })

  if (path === '/api/login' && method === 'POST') {
    const { username, password } = await readBody(req)
    const key = String(username || '').trim().toLowerCase()
    const f = failures.get(key)
    if (f && f.until > Date.now()) return send(res, 423, { error: 'account_locked' })
    const row = get('SELECT * FROM users WHERE username = ?', key)
    if (!row || !checkPassword(row, password)) {
      const count = (f?.count ?? 0) + 1
      failures.set(key, { count, until: count >= 5 ? Date.now() + 5 * 60_000 : 0 })
      return send(res, 401, { error: 'invalid_credentials' })
    }
    if (row.participant_id) {
      const p = get('SELECT data FROM participants WHERE id = ?', row.participant_id)
      if (p && JSON.parse(p.data).status === 'withdrawn') return send(res, 403, { error: 'withdrawn' })
    }
    failures.delete(key)
    const token = randomBytes(24).toString('base64url')
    const ms = row.portal === 'patient' ? PATIENT_SESSION_DAYS * 86_400_000 : STAFF_SESSION_HOURS * 3_600_000
    run('INSERT INTO sessions (token, username, created_at, expires_at) VALUES (?, ?, ?, ?)', token, key, new Date().toISOString(), new Date(Date.now() + ms).toISOString())
    run('DELETE FROM sessions WHERE expires_at < ?', new Date().toISOString())
    return send(res, 200, { token, user: toUser(row) })
  }

  if (path === '/api/logout' && method === 'POST') {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '')
    if (token) run('DELETE FROM sessions WHERE token = ?', token)
    return send(res, 200, { ok: true })
  }

  const user = requireUser(req)

  if (path === '/api/me') return send(res, 200, { user })

  if (path === '/api/verify-password' && method === 'POST') {
    const { password } = await readBody(req)
    const row = get('SELECT * FROM users WHERE username = ?', user.username)
    if (!checkPassword(row, password)) return send(res, 403, { error: 'wrong_password' })
    return send(res, 200, { ok: true })
  }

  if (path === '/api/study' && method === 'GET') return send(res, 200, studyFor(user))

  if (path === '/api/ops' && method === 'POST') {
    const { op, payload, password } = await readBody(req)
    const result = applyOp(user, op, payload, password)
    return send(res, 200, { ok: true, result, study: studyFor(user) })
  }

  if (path.startsWith('/api/drafts/')) {
    const key = decodeURIComponent(path.slice('/api/drafts/'.length))
    if (method === 'GET') return send(res, 200, { draft: loadDraft(user, key) })
    if (method === 'PUT') {
      saveDraft(user, key, (await readBody(req)).data)
      return send(res, 200, { ok: true })
    }
    if (method === 'DELETE') {
      deleteDraft(user, key)
      return send(res, 200, { ok: true })
    }
  }

  if (path === '/api/users' && method === 'GET') {
    if (!isAdmin(user)) throw new HttpError(403, 'forbidden')
    const rows = all("SELECT * FROM users WHERE portal IS NULL OR portal != 'patient' ORDER BY username").map(toUser)
    return send(res, 200, { users: user.role === 'system_admin' ? rows : rows.filter(u => u.role === 'external_user') })
  }

  if (path === '/api/users/reset-password' && method === 'POST') {
    if (!isAdmin(user)) throw new HttpError(403, 'forbidden')
    const { username, newPassword } = await readBody(req)
    const target = get('SELECT * FROM users WHERE username = ?', String(username || '').toLowerCase())
    if (!target) throw new HttpError(404, 'not_found')
    if (target.role === 'system_admin' && user.role !== 'system_admin') throw new HttpError(403, 'forbidden')
    if (typeof newPassword !== 'string' || newPassword.length < 6) throw new HttpError(400, 'weak_password')
    const { salt, hash } = hashPassword(newPassword)
    run('UPDATE users SET password_hash = ?, salt = ? WHERE username = ?', hash, salt, target.username)
    run('DELETE FROM sessions WHERE username = ?', target.username)
    audit(user.username, 'reset_password', 'user', target.username)
    return send(res, 200, { ok: true })
  }

  if (path === '/api/admin/backup' && method === 'POST') {
    if (!isAdmin(user)) throw new HttpError(403, 'forbidden')
    const file = backupNow()
    audit(user.username, 'backup', 'database', file)
    return send(res, 200, { ok: true, file })
  }

  throw new HttpError(404, 'not_found')
}

// ---------- static H5 ----------

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
}

async function serveStatic(res, pathname) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '')
  let file = join(STATIC_DIR, safe)
  if (!file.startsWith(STATIC_DIR)) file = join(STATIC_DIR, 'index.html')
  let isIndex = false
  try {
    if (!(await stat(file)).isFile()) throw new Error('dir')
  } catch {
    if (extname(safe)) {
      res.writeHead(404)
      return res.end()
    }
    file = join(STATIC_DIR, 'index.html')
    isIndex = true
  }
  isIndex ||= file.endsWith('index.html')
  const body = await readFile(file)
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] || 'application/octet-stream',
    'Cache-Control': isIndex ? 'no-store' : 'public, max-age=604800, immutable',
  })
  res.end(body)
}

const server = createServer(async (req, res) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  const url = new URL(req.url, 'http://localhost')
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url)
    return await serveStatic(res, url.pathname)
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.status, { error: err.code, ...(err.extra ?? {}) })
    console.error(err)
    return send(res, 500, { error: 'server_error' })
  }
})

// Daily automatic backup into DATA_DIR/backups (plus one at start-up).
try { backupNow() } catch (err) { console.error('backup failed', err) }
setInterval(() => { try { backupNow() } catch (err) { console.error('backup failed', err) } }, 24 * 3_600_000).unref()

server.listen(PORT, () => console.log(`CareConnect server on :${PORT} (db ${DB_PATH}, static ${STATIC_DIR})`))
