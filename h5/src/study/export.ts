import { ITEMS } from './instrument'
import {
  currentResponses, countMissing, symptomMean, interferenceMean, windowStatus, scheduledDate, studyDate,
  allVisitStates, alertLevel, rdi, daysBetween,
} from './logic'
import type { StudyData } from './types'

type Row = Record<string, string | number | boolean | null | undefined>

function toCsv(rows: Row[], columns?: string[]): string {
  const cols = columns ?? (rows.length ? Object.keys(rows[0]) : [])
  const cell = (v: Row[string]) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n')
}

/** Excludes demo/training participants unless asked. */
function participants(data: StudyData, includeSynthetic: boolean) {
  return data.participants.filter(p => includeSynthetic || !p.synthetic)
}

/** One row per submission (long format), current values after any corrections. Missing = empty cell, never 0. */
export function submissionsCsv(data: StudyData, includeSynthetic = false): string {
  const ids = new Set(participants(data, includeSynthetic).map(p => p.id))
  const rows = data.submissions.filter(s => ids.has(s.participantId)).map(s => {
    const p = data.participants.find(x => x.id === s.participantId)!
    const cycle = p.cycles.find(c => c.cycleNo === s.cycleNo)!
    const r = currentResponses(data, s)
    const win = windowStatus(cycle, s.visitLabel, s.completedAt)
    const contacts = data.contacts.filter(c => c.participantId === p.id && c.cycleNo === s.cycleNo && c.visitLabel === s.visitLabel)
    return {
      participant_id: p.id,
      synthetic: p.synthetic ? 1 : 0,
      cycle_no: s.cycleNo,
      visit_label: s.visitLabel,
      infusion_date: cycle.infusionDate,
      scheduled_date: scheduledDate(cycle, s.visitLabel),
      completed_at_utc: s.completedAt,
      completed_date_cst: studyDate(s.completedAt),
      day_offset: win.dayOffset,
      window_status: win.status,
      entry_mode: s.mode,
      filler: s.filler,
      entered_by: s.enteredBy,
      entered_at_utc: s.enteredAt,
      duration_sec: s.durationSec,
      reminders_sent: contacts.length,
      instrument_version: s.instrumentVersion,
      language: s.instrumentLanguage,
      alert_rule_version: s.alertRuleVersion,
      ...Object.fromEntries(ITEMS.map(i => [i.id, r[i.id]])),
      n_missing: countMissing(r),
      symptom_mean: symptomMean(r),
      interference_mean: interferenceMean(r),
      alert_level: alertLevel(r),
      revision_count: data.revisions.filter(x => x.submissionId === s.id).length,
      verified: s.mode === 'electronic' ? 'n/a' : s.verification ? 1 : 0,
    }
  })
  return toCsv(rows)
}

/** Every expected visit with its status — denominators for completion/adherence. */
export function visitStatusCsv(data: StudyData, includeSynthetic = false): string {
  const rows = participants(data, includeSynthetic).flatMap(p => allVisitStates(data, p).map(v => ({
    participant_id: p.id,
    cycle_no: v.cycle.cycleNo,
    visit_label: v.def.label,
    scheduled_date: v.scheduled,
    status: v.status,
    reminders_sent: v.contacts,
    missed_reason: data.missedVisits.find(m => m.participantId === p.id && m.cycleNo === v.cycle.cycleNo && m.visitLabel === v.def.label)?.reason ?? '',
  })))
  return toCsv(rows)
}

export function baselineCsv(data: StudyData, includeSynthetic = false): string {
  const rows = participants(data, includeSynthetic).map(p => ({
    participant_id: p.id,
    synthetic: p.synthetic ? 1 : 0,
    status: p.status,
    enrolled_at_utc: p.enrolledAt,
    consent_version: p.consentVersion,
    consent_date: p.consentDate,
    withdrawn_at_utc: p.withdrawnAt ?? '',
    withdraw_reason: p.withdrawReason ?? '',
    ...p.demographics,
    ...p.clinical,
    n_cycles: p.cycles.length,
    sus_score: p.susScore,
  }))
  return toCsv(rows)
}

export function outcomesCsv(data: StudyData, includeSynthetic = false): string {
  const rows = participants(data, includeSynthetic).flatMap(p => p.cycles.map(c => ({
    participant_id: p.id,
    cycle_no: c.cycleNo,
    infusion_date: c.infusionDate,
    unplanned_visit: c.outcome.unplannedVisit,
    unplanned_visit_date: c.outcome.unplannedVisitDate,
    unplanned_visit_type: c.outcome.unplannedVisitType,
    unplanned_visit_reason: c.outcome.unplannedVisitReason,
    planned_dose: c.outcome.plannedDose,
    actual_dose: c.outcome.actualDose,
    rdi: rdi(c),
    next_cycle_delay_days: c.outcome.nextCycleDelayDays,
  })))
  return toCsv(rows)
}

/** Alerts from electronic submissions and how fast they were handled. */
export function alertsCsv(data: StudyData, includeSynthetic = false): string {
  const ids = new Set(participants(data, includeSynthetic).map(p => p.id))
  const rows = data.submissions
    .filter(s => ids.has(s.participantId) && s.mode === 'electronic')
    .map(s => ({ s, level: alertLevel(currentResponses(data, s)) }))
    .filter(x => x.level !== 'none')
    .map(({ s, level }) => {
      const first = data.alertActions.filter(a => a.submissionId === s.id).sort((a, b) => (a.handledAt < b.handledAt ? -1 : 1))[0]
      return {
        submission_id: s.id,
        participant_id: s.participantId,
        cycle_no: s.cycleNo,
        visit_label: s.visitLabel,
        alert_level: level,
        alert_rule_version: s.alertRuleVersion,
        triggered_at_utc: s.completedAt,
        first_handled_at_utc: first?.handledAt ?? '',
        response_minutes: first ? Math.round((Date.parse(first.handledAt) - Date.parse(s.completedAt)) / 60_000) : '',
        action_type: first?.type ?? '',
        handled_by: first?.handledBy ?? '',
      }
    })
  return toCsv(rows)
}

export function contactsCsv(data: StudyData): string {
  return toCsv(data.contacts.map(c => ({ participant_id: c.participantId, cycle_no: c.cycleNo, visit_label: c.visitLabel, channel: c.channel, reached: c.reached ? 1 : 0, at_utc: c.at, by: c.by })))
}

export function revisionsCsv(data: StudyData): string {
  return toCsv(data.revisions.map(r => {
    const s = data.submissions.find(x => x.id === r.submissionId)
    return { revision_id: r.id, submission_id: r.submissionId, participant_id: s?.participantId, visit_label: s?.visitLabel, edited_at_utc: r.editedAt, edited_by: r.editedBy, reason: r.reason, ...Object.fromEntries(ITEMS.map(i => [i.id, r.responses[i.id]])) }
  }))
}

export function auditCsv(data: StudyData): string {
  return toCsv(data.audit.map(a => ({ at_utc: a.at, actor: a.actor, action: a.action, entity: a.entity, entity_id: a.entityId, detail: a.detail })))
}

export function dictionaryCsv(): string {
  const rows: Row[] = [
    ...ITEMS.map(i => ({ variable: i.id, description: `${i.order}. ${i.labelZh} / ${i.labelEn}`, values: '0–10 integer; empty = not answered (never imputed as 0)' })),
    { variable: 'symptom_mean', description: 'Mean of s1–s13', values: 'Only when all 13 answered; else empty' },
    { variable: 'interference_mean', description: 'Mean of i1–i6', values: 'Only when all 6 answered; else empty' },
    { variable: 'visit_label', description: 'T0 = before infusion (day −1..0); T1 = day 3 (±1); T2 = day 8 (±1)', values: 'T0/T1/T2' },
    { variable: 'day_offset', description: 'Completed date − infusion date, Asia/Shanghai calendar days', values: 'integer' },
    { variable: 'window_status', description: 'Whether day_offset falls inside the visit window', values: 'in_window/out_of_window' },
    { variable: 'entry_mode', description: 'How answers were collected', values: 'electronic/paper/phone' },
    { variable: 'filler', description: 'Who filled in the answers', values: 'self/proxy' },
    { variable: 'verified', description: 'Double-entry check passed (paper/phone only)', values: '1/0/n/a' },
    { variable: 'rdi', description: 'Relative dose intensity = actual_dose / planned_dose', values: 'ratio' },
    { variable: 'response_minutes', description: 'Alert trigger → first nurse response', values: 'minutes' },
  ]
  return toCsv(rows, ['variable', 'description', 'values'])
}

export interface CohortMetrics {
  participants: number
  expected: number
  done: number
  due: number
  missed: number
  overdue: number
  inWindowPct: number | null
  itemMissingPct: number | null
  medianResponseMin: number | null
}

export function cohortMetrics(data: StudyData, includeSynthetic: boolean): CohortMetrics {
  const ps = participants(data, includeSynthetic)
  const states = ps.flatMap(p => allVisitStates(data, p))
  const closed = states.filter(s => s.status !== 'upcoming' && s.status !== 'due')
  const subs = data.submissions.filter(s => ps.some(p => p.id === s.participantId))
  const inWindow = subs.filter(s => {
    const cycle = ps.find(p => p.id === s.participantId)!.cycles.find(c => c.cycleNo === s.cycleNo)!
    return windowStatus(cycle, s.visitLabel, s.completedAt).status === 'in_window'
  }).length
  const missingItems = subs.reduce((n, s) => n + countMissing(currentResponses(data, s)), 0)
  const times = subs
    .filter(s => s.mode === 'electronic' && alertLevel(currentResponses(data, s)) !== 'none')
    .map(s => data.alertActions.filter(a => a.submissionId === s.id).map(a => (Date.parse(a.handledAt) - Date.parse(s.completedAt)) / 60_000).sort((a, b) => a - b)[0])
    .filter((x): x is number => x !== undefined)
    .sort((a, b) => a - b)
  return {
    participants: ps.length,
    expected: closed.length,
    done: closed.filter(s => s.status === 'done').length,
    due: states.filter(s => s.status === 'due').length,
    missed: closed.filter(s => s.status === 'missed').length,
    overdue: closed.filter(s => s.status === 'overdue').length,
    inWindowPct: subs.length ? Math.round((inWindow / subs.length) * 100) : null,
    itemMissingPct: subs.length ? Math.round((missingItems / (subs.length * ITEMS.length)) * 1000) / 10 : null,
    medianResponseMin: times.length ? Math.round(times[Math.floor(times.length / 2)]) : null,
  }
}

export function enrollmentByWeek(data: StudyData, includeSynthetic: boolean): { week: string; n: number }[] {
  const ps = participants(data, includeSynthetic)
  if (!ps.length) return []
  const first = ps.map(p => studyDate(p.enrolledAt)).sort()[0]
  const buckets = new Map<number, number>()
  ps.forEach(p => {
    const w = Math.floor(daysBetween(first, studyDate(p.enrolledAt)) / 7)
    buckets.set(w, (buckets.get(w) ?? 0) + 1)
  })
  const max = Math.max(...buckets.keys())
  let total = 0
  return Array.from({ length: max + 1 }, (_, w) => {
    total += buckets.get(w) ?? 0
    return { week: `W${w + 1}`, n: total }
  })
}
