// First-run seeding: staff accounts, default config and (optionally) synthetic demo participants.
import { get, run, tx, hashPassword, audit, newId } from './db.mjs'
import { DEFAULT_CONFIG, ITEM_IDS, getConfig } from './study.mjs'

const STAFF = [
  { username: 'admin', role: 'system_admin', portal: null, zh: '系统管理员', en: 'System Admin', env: 'ADMIN_PASSWORD' },
  { username: 'orgadmin', role: 'org_admin', portal: null, zh: '组织管理员', en: 'Org Admin', env: 'ORGADMIN_PASSWORD' },
  { username: 'user2', role: 'external_user', portal: 'clinical', zh: '护士 A', en: 'Nurse A', env: 'NURSE_PASSWORD' },
  { username: 'user4', role: 'external_user', portal: 'clinical', zh: '护士 B', en: 'Nurse B', env: 'NURSE_PASSWORD' },
  { username: 'user3', role: 'external_user', portal: 'research', zh: '研究协调员', en: 'Research Coordinator', env: 'RESEARCH_PASSWORD' },
]

const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || '123456a'

function addUser(u, participantId = null) {
  if (get('SELECT 1 FROM users WHERE username = ?', u.username)) return
  const { salt, hash } = hashPassword(process.env[u.env] || DEFAULT_PASSWORD)
  run(
    'INSERT INTO users (username, password_hash, salt, role, portal, display_zh, display_en, org, participant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    u.username, hash, salt, u.role, u.portal, u.zh, u.en, 'org-careconnect', participantId,
  )
}

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function addDays(date, days) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** A timestamp at 10:00 Beijing time on the given date. */
function at10(date) {
  return new Date(`${date}T02:00:00.000Z`).toISOString()
}

function fakeResponses(seed, level) {
  let x = seed
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280)
  return Object.fromEntries(ITEM_IDS.map(id => [id, Math.max(0, Math.min(10, Math.round(level + (rnd() - 0.5) * 4)))]))
}

const emptyDemo = { sex: '', age: '', ethnicity: '', marital: '', education: '', occupation: '', income: '', payment: '' }
const emptyClin = { tumorType: '', pathology: '', stage: '', comorbidity: '', comorbidityDetail: '', regimen: '', priorChemoCount: '', ecog: '', antiemeticProphylaxis: '', gcsfProphylaxis: '' }
const emptyOutcome = { unplannedVisit: '', unplannedVisitDate: '', unplannedVisitType: '', unplannedVisitReason: '', plannedDose: '', actualDose: '', nextCycleDelayDays: '' }

function seedDemoParticipants() {
  const t = today()
  const cfg = getConfig()
  const demos = [
    // [id, alias, infusion offset from today, done visits, symptom level, regimen, mode, patient login]
    ['DEMO-001', '演示患者 A', -3, ['T0'], 3, 'FOLFOX', 'electronic', 'user1'],
    ['DEMO-002', '演示患者 B', -8, ['T0', 'T1'], 7, 'AC-T', 'electronic', null],
    ['DEMO-003', '演示患者 C', -12, ['T0', 'T1', 'T2'], 2, 'FOLFOX', 'paper', null],
    ['DEMO-004', '演示患者 D', 1, [], 0, '紫杉醇', 'electronic', null],
    ['DEMO-005', '演示患者 E', -5, ['T0'], 5, 'AC-T', 'electronic', null],
  ]
  demos.forEach(([id, alias, offset, done, level, regimen, mode, login], idx) => {
    const infusionDate = addDays(t, offset)
    const p = {
      id, synthetic: true, alias, username: login ?? '', enrolledAt: at10(addDays(infusionDate, -2)), enrolledBy: 'seed',
      consentVersion: 'DEMO', consentDate: addDays(infusionDate, -2), status: 'active',
      demographics: { ...emptyDemo, sex: idx % 2 ? 'F' : 'M', age: String(48 + idx * 5) },
      clinical: { ...emptyClin, regimen, ecog: String(idx % 2) },
      cycles: [{ cycleNo: 1, infusionDate, outcome: { ...emptyOutcome } }],
      susScore: '',
    }
    run('INSERT INTO participants (id, data, updated_at) VALUES (?, ?, ?)', id, JSON.stringify(p), new Date().toISOString())
    if (login) addUser({ username: login, role: 'external_user', portal: 'patient', zh: '小康', en: 'Alex', env: 'PATIENT_DEMO_PASSWORD' }, id)
    const target = { T0: -1, T1: 3, T2: 8 }
    for (const label of done) {
      const completed = at10(addDays(infusionDate, target[label]))
      const sub = {
        id: newId('SUB'), participantId: id, cycleNo: 1, visitLabel: label,
        completedAt: completed, enteredAt: mode === 'paper' ? new Date().toISOString() : completed,
        enteredBy: mode === 'paper' ? 'user2' : (login ?? 'user2'), mode, filler: 'self', durationSec: 180 + idx * 20,
        instrumentVersion: cfg.instrumentVersion, instrumentLanguage: cfg.instrumentLanguage, alertRuleVersion: cfg.alertRuleVersion,
        responses: fakeResponses(idx * 31 + label.charCodeAt(1), label === 'T0' ? Math.max(0, level - 3) : level),
      }
      if (label === 'T1' && idx === 4) sub.responses.s11 = null // one skipped item, to show missing handling
      run('INSERT INTO submissions (id, participant_id, cycle_no, visit_label, client_id, data) VALUES (?, ?, ?, ?, ?, ?)', sub.id, id, 1, label, null, JSON.stringify(sub))
    }
  })
}

export function seed() {
  tx(() => {
    if (!get('SELECT 1 FROM config WHERE id = 1')) {
      run('INSERT INTO config (id, data) VALUES (1, ?)', JSON.stringify(DEFAULT_CONFIG))
    }
    STAFF.forEach(u => addUser(u))
    const empty = !get('SELECT 1 FROM participants LIMIT 1')
    if (empty && process.env.SEED_DEMO !== '0') {
      seedDemoParticipants()
      audit('seed', 'seed_demo', 'study', 'demo', 'synthetic demo participants created')
    }
  })
}
