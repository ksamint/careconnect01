import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const here = dirname(fileURLToPath(import.meta.url))
const PORT = 18000 + Math.floor(Math.random() * 1000)
const BASE = `http://127.0.0.1:${PORT}`
let proc
let dataDir

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: await res.json() }
}

async function login(username, password = '123456a') {
  const r = await call('/api/login', { method: 'POST', body: { username, password } })
  assert.equal(r.status, 200, `login ${username}`)
  return r.body.token
}

const op = (token, op, payload, password) => call('/api/ops', { method: 'POST', token, body: { op, payload, password } })
const answers = v => Object.fromEntries(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12', 's13', 'i1', 'i2', 'i3', 'i4', 'i5', 'i6'].map(id => [id, v]))

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'cc-test-'))
  proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(here, '..', 'index.mjs')], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, STATIC_DIR: dataDir },
    stdio: 'ignore',
  })
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return } catch { /* starting */ }
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('server did not start')
})

after(() => {
  proc?.kill()
  rmSync(dataDir, { recursive: true, force: true })
})

test('rejects bad credentials and unauthenticated access', async () => {
  assert.equal((await call('/api/login', { method: 'POST', body: { username: 'admin', password: 'nope' } })).status, 401)
  assert.equal((await call('/api/study')).status, 401)
})

test('patient sees only their own participant', async () => {
  const token = await login('user1')
  const { body } = await call('/api/study', { token })
  assert.deepEqual(body.participants.map(p => p.id), ['DEMO-001'])
  assert.ok(body.submissions.every(s => s.participantId === 'DEMO-001'))
  assert.equal(body.audit.length, 0)
})

test('patient cannot submit for someone else', async () => {
  const token = await login('user1')
  const r = await op(token, 'submit', { participantId: 'DEMO-002', cycleNo: 1, visitLabel: 'T2', responses: answers(1), completedAt: new Date().toISOString() })
  assert.equal(r.status, 403)
})

test('real enrolment is blocked until enabled', async () => {
  const nurse = await login('user2')
  const r = await op(nurse, 'enroll', { synthetic: false, consentDate: '2026-10-01', cycles: [] })
  assert.equal(r.status, 403)
  assert.equal(r.body.error, 'real_enrollment_disabled')
})

test('submit keeps 0 and missing apart, is idempotent per clientId, and unique per visit', async () => {
  const nurse = await login('user2')
  const enr = await op(nurse, 'enroll', { synthetic: true, alias: 't', cycles: [{ cycleNo: 1, infusionDate: '2026-10-10' }] })
  assert.equal(enr.status, 200)
  const pid = enr.body.result.participantId
  const resp = { ...answers(0), s11: null }
  const payload = { participantId: pid, cycleNo: 1, visitLabel: 'T0', responses: resp, completedAt: '2026-10-09T02:00:00Z', mode: 'paper', filler: 'self', clientId: 'c-1' }
  const first = await op(nurse, 'submit', payload)
  assert.equal(first.status, 200)
  const again = await op(nurse, 'submit', payload)
  assert.equal(again.status, 200)
  assert.equal(again.body.result.duplicate, true)
  const other = await op(nurse, 'submit', { ...payload, clientId: 'c-2' })
  assert.equal(other.status, 409)
  const sub = first.body.study.submissions.find(s => s.participantId === pid)
  assert.equal(sub.responses.s1, 0)
  assert.equal(sub.responses.s11, null)
})

test('revise needs the password and a reason, keeps the original, and voids verification', async () => {
  const nurseA = await login('user2')
  const nurseB = await login('user4')
  const enr = await op(nurseA, 'enroll', { synthetic: true, cycles: [{ cycleNo: 1, infusionDate: '2026-10-10' }] })
  const pid = enr.body.result.participantId
  const sub = await op(nurseA, 'submit', { participantId: pid, cycleNo: 1, visitLabel: 'T1', responses: answers(2), completedAt: '2026-10-13T02:00:00Z', mode: 'paper', filler: 'self' })
  const sid = sub.body.result.submissionId

  // Same person cannot double-check their own entry.
  assert.equal((await op(nurseA, 'verify', { submissionId: sid, responses: answers(2) })).status, 403)
  // Blind re-entry that differs is reported as a mismatch.
  const mismatch = await op(nurseB, 'verify', { submissionId: sid, responses: { ...answers(2), s3: 5 } })
  assert.deepEqual(mismatch.body.result.mismatches, ['s3'])
  const ok = await op(nurseB, 'verify', { submissionId: sid, responses: answers(2) })
  assert.equal(ok.body.result.verified, true)

  assert.equal((await op(nurseB, 'revise', { submissionId: sid, responses: { ...answers(2), s3: 5 }, reason: 'x' }, 'wrong')).status, 403)
  assert.equal((await op(nurseB, 'revise', { submissionId: sid, responses: { ...answers(2), s3: 5 }, reason: '' }, '123456a')).status, 400)
  const rev = await op(nurseB, 'revise', { submissionId: sid, responses: { ...answers(2), s3: 5 }, reason: '纸质表核对更正' }, '123456a')
  assert.equal(rev.status, 200)
  assert.deepEqual(rev.body.result.changes, [{ item: 's3', from: 2, to: 5 }])
  const stored = rev.body.study.submissions.find(s => s.id === sid)
  assert.equal(stored.responses.s3, 2, 'original is unchanged')
  assert.equal(stored.verification, undefined, 'verification voided after edit')
  assert.equal(rev.body.study.revisions.filter(r => r.submissionId === sid).length, 1)
  const admin = await login('admin')
  const full = await call('/api/study', { token: admin })
  assert.ok(full.body.audit.some(a => a.action === 'revise' && a.entityId === sid))
})

test('research role can read but not write', async () => {
  const research = await login('user3')
  assert.equal((await call('/api/study', { token: research })).status, 200)
  assert.equal((await op(research, 'enroll', { synthetic: true })).status, 403)
})

test('enabling real enrolment requires preconditions', async () => {
  const admin = await login('admin')
  const r = await op(admin, 'setRealEnrollment', { enabled: true }, '123456a')
  assert.equal(r.status, 409)
  assert.ok(r.body.missing.includes('instrumentLicensed'))
})

test('drafts autosave per user', async () => {
  const token = await login('user1')
  await call('/api/drafts/DEMO-001%3A1%3AT1', { method: 'PUT', token, body: { data: { step: 4 } } })
  const r = await call('/api/drafts/DEMO-001%3A1%3AT1', { token })
  assert.deepEqual(r.body.draft.data, { step: 4 })
})

const registration = { phone: '19900000001', name: '虚构测试患者', birthday: '1980-02-29', synthetic: true }
const register = body => call('/api/patient-registration', { method: 'POST', body })

test('registration preserves the real-enrollment gate and validates identity fields', async () => {
  assert.equal((await call('/api/patient-registration')).body.realEnrollmentEnabled, false)
  assert.equal((await register({ ...registration, synthetic: false })).status, 403)
  assert.equal((await register({ ...registration, synthetic: undefined })).status, 403)
  for (const [field, value] of [['phone', '123'], ['name', ' '], ['name', 'x'.repeat(81)], ['birthday', '1981-02-29'], ['birthday', '1980-13-01'], ['birthday', '2999-01-01']]) {
    const result = await register({ ...registration, [field]: value })
    assert.equal(result.status, 400, field)
    assert.equal(result.body.error, 'invalid_' + field)
  }
  const crossOrigin = await fetch(BASE + '/api/patient-registration', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://unrelated.example' }, body: JSON.stringify(registration) })
  assert.equal(crossOrigin.status, 403)
})

test('registration creates one linked patient, supports phone login, and protects identity from research', async () => {
  const results = await Promise.all([register(registration), register({ ...registration, phone: '+86 19900000001' })])
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409])
  const account = results.find(r => r.status === 201).body
  assert.equal(account.password, 'kangfu999')
  assert.notEqual(account.username, registration.phone)
  const token = await login('+86 19900000001', 'kangfu999')
  const own = (await call('/api/study', { token })).body
  assert.deepEqual(own.participants.map(p => p.id), [account.participantId])
  assert.deepEqual(own.participants[0].identity, { phone: registration.phone, name: registration.name, birthday: registration.birthday })
  assert.deepEqual(own.participants[0].cycles, [], 'no invented treatment dates')
  assert.equal(own.participants[0].synthetic, true)
  assert.equal((await call('/api/users', { token })).status, 403)
  const other = await login('user1')
  assert.ok(!(await call('/api/study', { token: other })).body.participants.some(p => p.id === account.participantId))
  const nurse = await login('user2')
  const staffRecord = (await call('/api/study', { token: nurse })).body.participants.find(p => p.id === account.participantId)
  assert.equal(staffRecord.identity.name, registration.name)
  const researcher = await login('user3')
  const research = (await call('/api/study', { token: researcher })).body
  assert.ok(research.participants.find(p => p.id === account.participantId))
  for (const value of [registration.phone, registration.name, registration.birthday]) assert.ok(!JSON.stringify(research).includes(value), 'identity excluded from research')
  const admin = await login('admin')
  await call('/api/users/reset-password', { method: 'POST', token: admin, body: { username: account.username, newPassword: 'changed999' } })
  assert.equal((await register(registration)).status, 409)
  assert.ok(await login(registration.phone, 'changed999'), 'repeat registration cannot reset password')
  await op(nurse, 'updateParticipant', { id: account.participantId, withdraw: true, withdrawReason: 'test' })
  assert.equal((await call('/api/login', { method: 'POST', body: { username: registration.phone, password: 'changed999' } })).status, 403)
  assert.equal((await register(registration)).status, 409, 'withdrawal cannot be bypassed by registering again')
})

test('patient cookie lasts 60 days, restores without bearer, and logout revokes it', async () => {
  const response = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'user1', password: '123456a' }) })
  assert.equal(response.status, 200)
  const header = response.headers.get('set-cookie')
  assert.match(header, /HttpOnly/)
  assert.match(header, /SameSite=Lax/)
  assert.match(header, /Max-Age=5184000/)
  const cookie = header.split(';')[0]
  const session = await response.json()
  const db = new DatabaseSync(join(dataDir, 'careconnect.db'))
  const row = db.prepare('SELECT expires_at FROM sessions WHERE token = ?').get(session.token)
  assert.ok(Math.abs(Date.parse(row.expires_at) - Date.now() - 60 * 86_400_000) < 5000)
  db.close()
  const me = await fetch(BASE + '/api/me', { headers: { Cookie: cookie } })
  assert.equal(me.status, 200)
  assert.equal((await me.json()).user.username, 'user1')
  assert.equal((await fetch(BASE + '/api/logout', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'https://wrong.example' }, body: '{}' })).status, 403)
  assert.equal((await fetch(BASE + '/api/logout', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'text/plain' }, body: '{}' })).status, 415)
  const logout = await fetch(BASE + '/api/logout', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(logout.status, 200)
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/)
  assert.equal((await fetch(BASE + '/api/me', { headers: { Cookie: cookie } })).status, 401)
  assert.equal((await call('/api/me', { token: session.token })).status, 401)
})

test('staff sessions stay 12 hours, expired sessions fail, and password reset revokes cookies', async () => {
  const response = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: '123456a' }) })
  assert.match(response.headers.get('set-cookie'), /Max-Age=43200/)
  const session = await response.json()
  const db = new DatabaseSync(join(dataDir, 'careconnect.db'))
  db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run('2000-01-01T00:00:00.000Z', session.token)
  db.close()
  assert.equal((await fetch(BASE + '/api/me', { headers: { Cookie: response.headers.get('set-cookie').split(';')[0] } })).status, 401)
  const patient = await login('user1')
  const admin = await login('admin')
  await call('/api/users/reset-password', { method: 'POST', token: admin, body: { username: 'user1', newPassword: '123456a' } })
  assert.equal((await fetch(BASE + '/api/me', { headers: { Cookie: 'careconnect_session=' + patient } })).status, 401)
})

test('opened real registration needs consent and creates an identified real participant', async () => {
  const db = new DatabaseSync(join(dataDir, 'careconnect.db'))
  const original = db.prepare('SELECT data FROM config WHERE id = 1').get().data
  // Isolated fixture models the operator explicitly opening registration; no approval fields are invented.
  db.prepare('UPDATE config SET data = ? WHERE id = 1').run(JSON.stringify({ ...JSON.parse(original), realEnrollmentEnabled: true }))
  try {
    const body = { ...registration, phone: '19900000002', synthetic: false, consentVersion: '' }
    assert.equal((await register(body)).status, 400)
    const created = await register({ ...body, consentConfirmed: true })
    assert.equal(created.status, 201)
    const token = await login(body.phone, 'kangfu999')
    const record = (await call('/api/study', { token })).body.participants[0]
    assert.equal(record.synthetic, false)
    assert.equal(record.id, created.body.participantId)
    assert.equal(record.identity.phone, body.phone)
  } finally {
    db.prepare('UPDATE config SET data = ? WHERE id = 1').run(original)
    db.close()
  }
})

test('registration attempts are rate-limited', async () => {
  const results = []
  for (let i = 0; i < 31; i++) results.push((await register({ ...registration, phone: 'bad' })).status)
  assert.ok(results.includes(429))
})

test('admin hide is reversible, retains source rows, revokes login, and filters study data', async () => {
  const admin = await login('admin')
  const nurse = await login('user2')
  const enrolled = await op(nurse, 'enroll', { synthetic: true, alias: 'archive-test', createLogin: true, cycles: [{ cycleNo: 1, infusionDate: '2026-11-01' }] })
  const { participantId: pid, login: credentials } = enrolled.body.result
  const patient = await login(credentials.username, credentials.password)
  const submitted = await op(nurse, 'submit', { participantId: pid, cycleNo: 1, visitLabel: 'T0', responses: answers(1), completedAt: '2026-10-31T02:00:00Z', mode: 'paper', filler: 'self', clientId: 'hide-preserved' })
  assert.equal(submitted.status, 200)
  assert.equal((await op(nurse, 'hideParticipant', { participantId: pid, reason: 'T2 超窗' })).status, 403)
  assert.equal((await op(patient, 'hideParticipant', { participantId: pid, reason: 'T2 超窗' })).status, 403)
  assert.equal((await op(admin, 'hideParticipant', { participantId: pid, reason: ' ' })).status, 400)
  assert.equal((await op(admin, 'hideParticipant', { participantId: pid, reason: 'T2 超窗' })).status, 200)
  assert.equal((await call('/api/study', { token: patient })).status, 401)
  assert.equal((await call('/api/login', { method: 'POST', body: credentials })).status, 403)
  for (const token of [admin, nurse]) {
    const { body } = await call('/api/study', { token })
    assert.ok(!body.participants.some(p => p.id === pid))
    assert.ok(!body.submissions.some(s => s.participantId === pid))
    assert.equal(body.hiddenParticipants.some(p => p.id === pid), token === admin)
  }
  const researcher = await login('user3')
  const researchView = (await call('/api/study', { token: researcher })).body
  assert.ok(!researchView.audit.some(a => a.entityId === pid || a.entityId === submitted.body.result.submissionId), 'hidden patient leaks through research audit')
  assert.equal((await op(nurse, 'updateParticipant', { id: pid, alias: 'stale edit' })).body.error, 'participant_hidden')
  for (const operation of ['verify', 'alertAction']) {
    assert.equal((await op(nurse, operation, { submissionId: submitted.body.result.submissionId })).body.error, 'participant_hidden')
  }
  assert.equal((await op(nurse, 'revise', { submissionId: submitted.body.result.submissionId }, '123456a')).body.error, 'participant_hidden')
  const blocked = await op(nurse, 'submit', { participantId: pid })
  assert.equal(blocked.body.error, 'participant_hidden')
  const db = new DatabaseSync(join(dataDir, 'careconnect.db'), { readOnly: true })
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM participants WHERE id = ?').get(pid).n, 1)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM submissions WHERE participant_id = ?').get(pid).n, 1)
  db.close()
  assert.equal((await op(nurse, 'restoreParticipant', { participantId: pid })).status, 403)
  assert.equal((await op(admin, 'restoreParticipant', { participantId: pid })).status, 200)
  const { body } = await call('/api/study', { token: admin })
  assert.ok(body.participants.some(p => p.id === pid && p.status === 'active'))
  assert.ok(body.submissions.some(s => s.participantId === pid))
  assert.ok(body.audit.some(a => a.action === 'hide_participant'))
  await login(credentials.username, credentials.password)
})
