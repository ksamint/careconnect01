// Study domain rules enforced on the server: permissions, validation, immutability, audit.
import { db, all, get, run, tx, parse, audit, newId, hashPassword, checkPassword, randomPassword } from './db.mjs'

export const ITEM_IDS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12', 's13', 'i1', 'i2', 'i3', 'i4', 'i5', 'i6']
const VISIT_LABELS = ['T0', 'T1', 'T2']
const MODES = ['electronic', 'paper', 'phone']
const FILLERS = ['self', 'proxy']
const CONTACT_CHANNELS = ['push_am', 'push_pm', 'phone']
const ACTION_TYPES = ['teleConsult', 'pathwayUpdate', 'medicationAdjust', 'adviceOnly']

export const CHECKLIST_KEYS = [
  'license', 'itemText', 'ethics', 'protocolV11', 'consentForm', 'alertSop',
  'notDiagnostic', 'linkSecurity', 'serverSecurity', 'withdrawalRule', 'piSignoff',
]

export const DEFAULT_CONFIG = {
  studyCode: 'C-194',
  ethicsApprovalNo: '',
  ethicsApprovalDate: '',
  consentVersion: '',
  instrumentVersion: 'label-placeholder-v1',
  instrumentLicensed: false,
  instrumentLanguage: 'zh-CN',
  alertRuleVersion: 'alert-rule-v1 (any symptom ≥7 high; ≥4 medium)',
  realEnrollmentEnabled: false,
  checklist: {},
}

export class HttpError extends Error {
  constructor(status, code, extra) {
    super(code)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

const isAdmin = u => u.role === 'system_admin' || u.role === 'org_admin'
const isStaff = u => isAdmin(u) || u.portal === 'clinical'
const canRead = u => isStaff(u) || u.portal === 'research'

export function getConfig() {
  const row = get('SELECT data FROM config WHERE id = 1')
  return row ? { ...DEFAULT_CONFIG, ...parse(row) } : { ...DEFAULT_CONFIG }
}

function saveConfig(cfg) {
  run('INSERT INTO config (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data', JSON.stringify(cfg))
}

export function getParticipant(id) {
  return parse(get('SELECT data FROM participants WHERE id = ?', id))
}

function saveParticipant(p) {
  run(
    'INSERT INTO participants (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
    p.id, JSON.stringify(p), new Date().toISOString(),
  )
}

function getSubmission(id) {
  return parse(get('SELECT data FROM submissions WHERE id = ?', id))
}

function currentResponses(sub) {
  const revs = all('SELECT data FROM revisions WHERE submission_id = ?', sub.id).map(parse)
  if (!revs.length) return sub.responses
  return revs.reduce((a, b) => (a.editedAt >= b.editedAt ? a : b)).responses
}

// ---------- validation ----------

function str(v, max = 500) {
  if (v === undefined || v === null) return ''
  if (typeof v !== 'string' && typeof v !== 'number') throw new HttpError(400, 'invalid_field')
  return String(v).slice(0, max)
}

function date(v, { required = false } = {}) {
  const s = str(v, 10)
  if (!s && !required) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new HttpError(400, 'invalid_date')
  return s
}

function responses(v) {
  if (!v || typeof v !== 'object') throw new HttpError(400, 'invalid_responses')
  const out = {}
  for (const id of ITEM_IDS) {
    const val = v[id]
    if (val === null || val === undefined) out[id] = null
    else if (Number.isInteger(val) && val >= 0 && val <= 10) out[id] = val
    else throw new HttpError(400, 'invalid_responses')
  }
  return out
}

function cleanObject(src, keys) {
  const out = {}
  for (const k of keys) out[k] = str(src?.[k])
  return out
}

const DEMO_KEYS = ['sex', 'age', 'ethnicity', 'marital', 'education', 'occupation', 'income', 'payment']
const CLIN_KEYS = ['tumorType', 'pathology', 'stage', 'comorbidity', 'comorbidityDetail', 'regimen', 'priorChemoCount', 'ecog', 'antiemeticProphylaxis', 'gcsfProphylaxis']
const OUTCOME_KEYS = ['unplannedVisit', 'unplannedVisitDate', 'unplannedVisitType', 'unplannedVisitReason', 'plannedDose', 'actualDose', 'nextCycleDelayDays']

function cycles(v) {
  if (!Array.isArray(v)) throw new HttpError(400, 'invalid_cycles')
  const seen = new Set()
  return v.map(c => {
    const cycleNo = Number(c?.cycleNo)
    if (!Number.isInteger(cycleNo) || cycleNo < 1 || cycleNo > 99 || seen.has(cycleNo)) throw new HttpError(400, 'invalid_cycles')
    seen.add(cycleNo)
    return { cycleNo, infusionDate: date(c.infusionDate, { required: true }), outcome: cleanObject(c.outcome, OUTCOME_KEYS) }
  })
}

function requirePassword(user, password) {
  const row = get('SELECT * FROM users WHERE username = ?', user.username)
  if (!checkPassword(row, password)) throw new HttpError(403, 'wrong_password')
}

function requireStaff(user) {
  if (!isStaff(user)) throw new HttpError(403, 'forbidden')
}

function nextParticipantId(synthetic) {
  const prefix = synthetic ? 'DEMO' : 'C194'
  const ids = all('SELECT id FROM participants WHERE id LIKE ?', `${prefix}-%`).map(r => Number(r.id.split('-')[1]) || 0)
  return `${prefix}-${String((ids.length ? Math.max(...ids) : 0) + 1).padStart(3, '0')}`
}

function createPatientLogin(participant) {
  const username = participant.id.toLowerCase()
  const password = randomPassword()
  const { salt, hash } = hashPassword(password)
  run(
    'INSERT INTO users (username, password_hash, salt, role, portal, display_zh, display_en, org, participant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    username, hash, salt, 'external_user', 'patient', participant.alias || participant.id, participant.alias || participant.id, 'org-careconnect', participant.id,
  )
  return { username, password }
}

// ---------- read model ----------

export function studyFor(user) {
  const config = getConfig()
  const verifications = new Map(all('SELECT * FROM verifications').map(v => [v.submission_id, { by: v.verified_by, at: v.verified_at }]))
  const withVerification = s => (verifications.has(s.id) ? { ...s, verification: verifications.get(s.id) } : s)

  if (!canRead(user)) {
    // Patients see only their own record and submissions — nothing about other participants.
    const pid = get('SELECT participant_id FROM users WHERE username = ?', user.username)?.participant_id
    const participant = pid ? getParticipant(pid) : null
    return {
      schemaVersion: 1,
      config,
      participants: participant ? [participant] : [],
      submissions: participant ? all('SELECT data FROM submissions WHERE participant_id = ?', pid).map(parse).map(withVerification) : [],
      revisions: participant ? all('SELECT r.data FROM revisions r JOIN submissions s ON s.id = r.submission_id WHERE s.participant_id = ?', pid).map(parse) : [],
      contacts: [],
      missedVisits: participant ? all('SELECT data FROM missed_visits WHERE participant_id = ?', pid).map(parse) : [],
      alertActions: [],
      audit: [],
    }
  }

  return {
    schemaVersion: 1,
    config,
    participants: all('SELECT data FROM participants ORDER BY id').map(parse),
    submissions: all('SELECT data FROM submissions').map(parse).map(withVerification),
    revisions: all('SELECT data FROM revisions').map(parse),
    contacts: all('SELECT data FROM contacts').map(parse),
    missedVisits: all('SELECT data FROM missed_visits').map(parse),
    alertActions: all('SELECT data FROM alert_actions').map(parse),
    audit: isAdmin(user) || user.portal === 'research' ? all('SELECT data FROM audit ORDER BY seq DESC').map(parse) : [],
  }
}

// ---------- operations ----------

export function applyOp(user, op, payload = {}, password) {
  const actor = user.username
  const now = new Date().toISOString()

  switch (op) {
    case 'enroll': {
      requireStaff(user)
      const cfg = getConfig()
      const synthetic = payload.synthetic !== false
      if (!synthetic && !cfg.realEnrollmentEnabled) throw new HttpError(403, 'real_enrollment_disabled')
      return tx(() => {
        const p = {
          id: nextParticipantId(synthetic),
          synthetic,
          alias: str(payload.alias, 40),
          username: '',
          enrolledAt: now,
          enrolledBy: actor,
          consentVersion: synthetic ? str(payload.consentVersion, 60) : cfg.consentVersion,
          consentDate: date(payload.consentDate, { required: !synthetic }),
          status: 'active',
          demographics: cleanObject(payload.demographics, DEMO_KEYS),
          clinical: cleanObject(payload.clinical, CLIN_KEYS),
          cycles: cycles(payload.cycles ?? []),
          susScore: '',
        }
        let login = null
        if (payload.createLogin) {
          login = createPatientLogin(p)
          p.username = login.username
        }
        saveParticipant(p)
        audit(actor, 'enroll', 'participant', p.id, { synthetic, consentVersion: p.consentVersion })
        return { participantId: p.id, login }
      })
    }

    case 'resetPatientLogin': {
      requireStaff(user)
      return tx(() => {
        const p = getParticipant(str(payload.participantId))
        if (!p) throw new HttpError(404, 'not_found')
        let login
        if (p.username) {
          const pw = randomPassword()
          const { salt, hash } = hashPassword(pw)
          run('UPDATE users SET password_hash = ?, salt = ? WHERE username = ?', hash, salt, p.username)
          run('DELETE FROM sessions WHERE username = ?', p.username)
          login = { username: p.username, password: pw }
        } else {
          login = createPatientLogin(p)
          p.username = login.username
          saveParticipant(p)
        }
        audit(actor, 'reset_patient_login', 'participant', p.id)
        return { login }
      })
    }

    case 'updateParticipant': {
      requireStaff(user)
      return tx(() => {
        const p = getParticipant(str(payload.id))
        if (!p) throw new HttpError(404, 'not_found')
        const before = JSON.stringify(p)
        if (payload.alias !== undefined) p.alias = str(payload.alias, 40)
        if (payload.demographics) p.demographics = cleanObject(payload.demographics, DEMO_KEYS)
        if (payload.clinical) p.clinical = cleanObject(payload.clinical, CLIN_KEYS)
        if (payload.cycles) p.cycles = cycles(payload.cycles)
        if (payload.susScore !== undefined) {
          const sus = str(payload.susScore, 6)
          if (sus && !(Number(sus) >= 0 && Number(sus) <= 100)) throw new HttpError(400, 'invalid_sus')
          p.susScore = sus
        }
        if (payload.withdraw) {
          p.status = 'withdrawn'
          p.withdrawnAt = now
          p.withdrawReason = str(payload.withdrawReason, 300)
          if (p.username) run('DELETE FROM sessions WHERE username = ?', p.username)
        }
        // Removing a cycle that already has submissions would orphan them.
        const kept = new Set(p.cycles.map(c => c.cycleNo))
        const used = all('SELECT DISTINCT cycle_no FROM submissions WHERE participant_id = ?', p.id).map(r => r.cycle_no)
        if (used.some(n => !kept.has(n))) throw new HttpError(409, 'cycle_has_data')
        saveParticipant(p)
        audit(actor, payload.withdraw ? 'withdraw' : 'update_participant', 'participant', p.id, { before: JSON.parse(before), after: p })
        return { participantId: p.id }
      })
    }

    case 'submit': {
      const p = getParticipant(str(payload.participantId))
      if (!p) throw new HttpError(404, 'not_found')
      const linked = get('SELECT participant_id FROM users WHERE username = ?', actor)?.participant_id
      const self = linked === p.id
      if (!self) requireStaff(user)
      if (p.status !== 'active') throw new HttpError(409, 'withdrawn')
      const cycleNo = Number(payload.cycleNo)
      if (!p.cycles.some(c => c.cycleNo === cycleNo)) throw new HttpError(400, 'invalid_cycle')
      const visitLabel = str(payload.visitLabel)
      if (!VISIT_LABELS.includes(visitLabel)) throw new HttpError(400, 'invalid_visit')
      const mode = self ? 'electronic' : str(payload.mode)
      const filler = self ? 'self' : str(payload.filler)
      if (!MODES.includes(mode) || !FILLERS.includes(filler)) throw new HttpError(400, 'invalid_mode')
      const completedAt = str(payload.completedAt, 40)
      const t = Date.parse(completedAt)
      if (!t || t > Date.now() + 10 * 60_000) throw new HttpError(400, 'invalid_completed_at')
      const clientId = str(payload.clientId, 80)
      const cfg = getConfig()
      return tx(() => {
        const existing = get('SELECT id, client_id FROM submissions WHERE participant_id = ? AND cycle_no = ? AND visit_label = ?', p.id, cycleNo, visitLabel)
        if (existing) {
          // Same client retrying a queued submit — idempotent success.
          if (clientId && existing.client_id === clientId) return { submissionId: existing.id, duplicate: true }
          throw new HttpError(409, 'already_submitted', { submissionId: existing.id })
        }
        run('DELETE FROM missed_visits WHERE participant_id = ? AND cycle_no = ? AND visit_label = ?', p.id, cycleNo, visitLabel)
        const sub = {
          id: newId('SUB'),
          participantId: p.id,
          cycleNo,
          visitLabel,
          completedAt: new Date(t).toISOString(),
          enteredAt: now,
          enteredBy: actor,
          mode,
          filler,
          durationSec: Number.isFinite(payload.durationSec) ? Math.max(0, Math.round(payload.durationSec)) : null,
          instrumentVersion: cfg.instrumentVersion,
          instrumentLanguage: cfg.instrumentLanguage,
          alertRuleVersion: cfg.alertRuleVersion,
          responses: responses(payload.responses),
        }
        run('INSERT INTO submissions (id, participant_id, cycle_no, visit_label, client_id, data) VALUES (?, ?, ?, ?, ?, ?)',
          sub.id, p.id, cycleNo, visitLabel, clientId || null, JSON.stringify(sub))
        run('DELETE FROM drafts WHERE draft_key = ?', `${p.id}:${cycleNo}:${visitLabel}`)
        audit(actor, 'submit', 'submission', sub.id, { participantId: p.id, cycleNo, visitLabel, mode, filler })
        return { submissionId: sub.id }
      })
    }

    case 'revise': {
      requireStaff(user)
      requirePassword(user, password)
      const sub = getSubmission(str(payload.submissionId))
      if (!sub) throw new HttpError(404, 'not_found')
      const reason = str(payload.reason, 500).trim()
      if (!reason) throw new HttpError(400, 'reason_required')
      const next = responses(payload.responses)
      return tx(() => {
        const prev = currentResponses(sub)
        const changes = ITEM_IDS.filter(id => prev[id] !== next[id]).map(id => ({ item: id, from: prev[id], to: next[id] }))
        if (!changes.length) throw new HttpError(400, 'no_changes')
        const rev = { id: newId('REV'), submissionId: sub.id, responses: next, reason, editedBy: actor, editedAt: now }
        run('INSERT INTO revisions (id, submission_id, data) VALUES (?, ?, ?)', rev.id, sub.id, JSON.stringify(rev))
        // Values changed, so any earlier double-entry check no longer covers them.
        run('DELETE FROM verifications WHERE submission_id = ?', sub.id)
        audit(actor, 'revise', 'submission', sub.id, { reason, changes })
        return { revisionId: rev.id, changes }
      })
    }

    case 'verify': {
      requireStaff(user)
      const sub = getSubmission(str(payload.submissionId))
      if (!sub) throw new HttpError(404, 'not_found')
      if (sub.enteredBy === actor) throw new HttpError(403, 'same_person')
      const blind = responses(payload.responses)
      return tx(() => {
        const current = currentResponses(sub)
        const lastEditor = all('SELECT data FROM revisions WHERE submission_id = ?', sub.id).map(parse).reduce((a, b) => (!a || b.editedAt > a.editedAt ? b : a), null)?.editedBy
        if (lastEditor === actor) throw new HttpError(403, 'same_person')
        const mismatches = ITEM_IDS.filter(id => current[id] !== blind[id])
        if (mismatches.length) {
          audit(actor, 'verify_mismatch', 'submission', sub.id, { mismatches })
          return { verified: false, mismatches }
        }
        run('INSERT INTO verifications (submission_id, verified_by, verified_at) VALUES (?, ?, ?) ON CONFLICT(submission_id) DO UPDATE SET verified_by = excluded.verified_by, verified_at = excluded.verified_at', sub.id, actor, now)
        audit(actor, 'verify', 'submission', sub.id)
        return { verified: true, mismatches: [] }
      })
    }

    case 'contact': {
      requireStaff(user)
      const c = {
        id: newId('CON'),
        participantId: str(payload.participantId),
        cycleNo: Number(payload.cycleNo),
        visitLabel: str(payload.visitLabel),
        channel: str(payload.channel),
        reached: !!payload.reached,
        at: now,
        by: actor,
        note: str(payload.note, 300),
      }
      if (!getParticipant(c.participantId) || !VISIT_LABELS.includes(c.visitLabel) || !CONTACT_CHANNELS.includes(c.channel)) throw new HttpError(400, 'invalid_contact')
      return tx(() => {
        run('INSERT INTO contacts (id, participant_id, data) VALUES (?, ?, ?)', c.id, c.participantId, JSON.stringify(c))
        audit(actor, 'contact', 'participant', c.participantId, { cycleNo: c.cycleNo, visitLabel: c.visitLabel, channel: c.channel, reached: c.reached })
        return { contactId: c.id }
      })
    }

    case 'markMissed': {
      requireStaff(user)
      const m = { id: newId('MIS'), participantId: str(payload.participantId), cycleNo: Number(payload.cycleNo), visitLabel: str(payload.visitLabel), reason: str(payload.reason, 300), at: now, by: actor }
      if (!getParticipant(m.participantId) || !VISIT_LABELS.includes(m.visitLabel)) throw new HttpError(400, 'invalid_missed')
      if (!m.reason.trim()) throw new HttpError(400, 'reason_required')
      return tx(() => {
        if (get('SELECT 1 FROM submissions WHERE participant_id = ? AND cycle_no = ? AND visit_label = ?', m.participantId, m.cycleNo, m.visitLabel)) throw new HttpError(409, 'already_submitted')
        run('INSERT INTO missed_visits (id, participant_id, cycle_no, visit_label, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING', m.id, m.participantId, m.cycleNo, m.visitLabel, JSON.stringify(m))
        audit(actor, 'mark_missed', 'participant', m.participantId, { cycleNo: m.cycleNo, visitLabel: m.visitLabel, reason: m.reason })
        return { missedId: m.id }
      })
    }

    case 'alertAction': {
      requireStaff(user)
      const sub = getSubmission(str(payload.submissionId))
      if (!sub) throw new HttpError(404, 'not_found')
      const type = str(payload.type)
      if (!ACTION_TYPES.includes(type)) throw new HttpError(400, 'invalid_action')
      const a = { id: newId('ACT'), submissionId: sub.id, participantId: sub.participantId, type, notes: str(payload.notes, 1000), followUp: !!payload.followUp, handledAt: now, handledBy: actor }
      return tx(() => {
        run('INSERT INTO alert_actions (id, submission_id, data) VALUES (?, ?, ?)', a.id, sub.id, JSON.stringify(a))
        audit(actor, 'alert_action', 'submission', sub.id, { type, followUp: a.followUp })
        return { actionId: a.id }
      })
    }

    case 'updateConfig': {
      if (!isAdmin(user)) throw new HttpError(403, 'forbidden')
      requirePassword(user, password)
      return tx(() => {
        const cfg = getConfig()
        const next = {
          ...cfg,
          ethicsApprovalNo: str(payload.ethicsApprovalNo ?? cfg.ethicsApprovalNo, 80),
          ethicsApprovalDate: date(payload.ethicsApprovalDate ?? cfg.ethicsApprovalDate),
          consentVersion: str(payload.consentVersion ?? cfg.consentVersion, 80),
          instrumentVersion: str(payload.instrumentVersion ?? cfg.instrumentVersion, 120),
          instrumentLicensed: payload.instrumentLicensed ?? cfg.instrumentLicensed,
          instrumentLanguage: str(payload.instrumentLanguage ?? cfg.instrumentLanguage, 20),
          alertRuleVersion: str(payload.alertRuleVersion ?? cfg.alertRuleVersion, 120),
        }
        saveConfig(next)
        audit(actor, 'update_config', 'config', '1', { before: cfg, after: next })
        return { ok: true }
      })
    }

    case 'checklist': {
      if (!isAdmin(user)) throw new HttpError(403, 'forbidden')
      const key = str(payload.key)
      if (!CHECKLIST_KEYS.includes(key)) throw new HttpError(400, 'invalid_key')
      return tx(() => {
        const cfg = getConfig()
        cfg.checklist = { ...cfg.checklist, [key]: payload.done ? { by: actor, at: now } : undefined }
        saveConfig(cfg)
        audit(actor, payload.done ? 'checklist_tick' : 'checklist_untick', 'config', key)
        return { ok: true }
      })
    }

    case 'setRealEnrollment': {
      if (!isAdmin(user)) throw new HttpError(403, 'forbidden')
      requirePassword(user, password)
      return tx(() => {
        const cfg = getConfig()
        if (payload.enabled) {
          const missing = []
          if (!cfg.instrumentLicensed) missing.push('instrumentLicensed')
          if (!cfg.instrumentVersion || cfg.instrumentVersion.includes('placeholder')) missing.push('instrumentVersion')
          if (!cfg.consentVersion) missing.push('consentVersion')
          if (!cfg.ethicsApprovalNo) missing.push('ethicsApprovalNo')
          const unticked = CHECKLIST_KEYS.filter(k => !cfg.checklist?.[k])
          if (unticked.length) missing.push(...unticked.map(k => `checklist.${k}`))
          if (missing.length) throw new HttpError(409, 'preconditions_not_met', { missing })
        }
        cfg.realEnrollmentEnabled = !!payload.enabled
        cfg.realEnrollmentEnabledBy = actor
        cfg.realEnrollmentEnabledAt = now
        saveConfig(cfg)
        audit(actor, payload.enabled ? 'enable_real_enrollment' : 'disable_real_enrollment', 'config', '1')
        return { ok: true }
      })
    }

    default:
      throw new HttpError(400, 'unknown_op')
  }
}

// ---------- drafts (autosave of in-progress answers) ----------

export function saveDraft(user, key, data) {
  if (typeof key !== 'string' || key.length > 80) throw new HttpError(400, 'invalid_key')
  const body = JSON.stringify(data ?? null)
  if (body.length > 20_000) throw new HttpError(413, 'too_large')
  run(
    'INSERT INTO drafts (username, draft_key, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(username, draft_key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
    user.username, key, body, new Date().toISOString(),
  )
}

export function loadDraft(user, key) {
  const row = get('SELECT data, updated_at FROM drafts WHERE username = ? AND draft_key = ?', user.username, key)
  return row ? { data: JSON.parse(row.data), updatedAt: row.updated_at } : null
}

export function deleteDraft(user, key) {
  run('DELETE FROM drafts WHERE username = ? AND draft_key = ?', user.username, key)
}

export { db }
