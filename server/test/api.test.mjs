import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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
