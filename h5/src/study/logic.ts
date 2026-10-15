import { ITEMS, SYMPTOM_ITEMS, INTERFERENCE_ITEMS, type Responses } from './instrument'
import type { AlertLevel, Participant, StudyData, Submission, VisitLabel, Cycle } from './types'

export const STUDY_TZ = 'Asia/Shanghai'

export interface VisitDef {
  label: VisitLabel
  /** Target day relative to infusion day 0. */
  targetDay: number
  windowFrom: number
  windowTo: number
}

/**
 * Follow-up schedule. Day 0 = infusion start date.
 * T0 must be completed before infusion (day −1 or day 0 before the drip starts);
 * T1 and T2 allow ±1 day.
 */
export const VISITS: VisitDef[] = [
  { label: 'T0', targetDay: -1, windowFrom: -1, windowTo: 0 },
  { label: 'T1', targetDay: 3, windowFrom: 2, windowTo: 4 },
  { label: 'T2', targetDay: 8, windowFrom: 7, windowTo: 9 },
]

export const MAX_CONTACTS_BEFORE_MISSING = 3

const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: STUDY_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** Calendar date (YYYY-MM-DD) of an instant, in the study time zone. */
export function studyDate(at: Date | string = new Date()): string {
  return dayFormatter.format(typeof at === 'string' ? new Date(at) : at)
}

function dateToUtcDays(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** Date + time in the study time zone, for display. */
export function fmtTime(iso: string, locale: 'zh' | 'en'): string {
  return new Date(iso).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-GB', {
    timeZone: STUDY_TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export function daysBetween(from: string, to: string): number {
  return dateToUtcDays(to) - dateToUtcDays(from)
}

export function addDays(date: string, days: number): string {
  const ms = (dateToUtcDays(date) + days) * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

export function visitDef(label: VisitLabel): VisitDef {
  return VISITS.find(v => v.label === label)!
}

export function scheduledDate(cycle: Cycle, label: VisitLabel): string {
  return addDays(cycle.infusionDate, visitDef(label).targetDay)
}

export type WindowStatus = 'in_window' | 'out_of_window'

export function windowStatus(cycle: Cycle, label: VisitLabel, completedAt: string): { dayOffset: number; status: WindowStatus } {
  const def = visitDef(label)
  const dayOffset = daysBetween(cycle.infusionDate, studyDate(completedAt))
  return { dayOffset, status: dayOffset >= def.windowFrom && dayOffset <= def.windowTo ? 'in_window' : 'out_of_window' }
}

// ---------- scoring ----------

export function countMissing(r: Responses): number {
  return ITEMS.filter(i => r[i.id] === null || r[i.id] === undefined).length
}

function mean(values: number[]): number {
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
}

/** Domain mean only when every item in the domain was answered; otherwise null. No imputation. */
export function symptomMean(r: Responses): number | null {
  const vals = SYMPTOM_ITEMS.map(i => r[i.id])
  return vals.every(v => typeof v === 'number') ? mean(vals as number[]) : null
}

export function interferenceMean(r: Responses): number | null {
  const vals = INTERFERENCE_ITEMS.map(i => r[i.id])
  return vals.every(v => typeof v === 'number') ? mean(vals as number[]) : null
}

/** Mean of answered symptom items, for display only (never exported as a score). */
export function displayMean(r: Responses): number | null {
  const vals = SYMPTOM_ITEMS.map(i => r[i.id]).filter((v): v is number => typeof v === 'number')
  return vals.length ? Math.round(mean(vals) * 10) / 10 : null
}

// ---------- alerts ----------

export const ALERT_HIGH = 7
export const ALERT_MEDIUM = 4

/** Alert rule v1: any symptom item ≥7 → high; any ≥4 → medium. Interference items do not trigger alerts. */
export function alertLevel(r: Responses): AlertLevel {
  const vals = SYMPTOM_ITEMS.map(i => r[i.id]).filter((v): v is number => typeof v === 'number')
  if (vals.some(v => v >= ALERT_HIGH)) return 'high'
  if (vals.some(v => v >= ALERT_MEDIUM)) return 'medium'
  return 'none'
}

// ---------- derived views ----------

export function currentResponses(data: StudyData, s: Submission): Responses {
  const revs = data.revisions.filter(r => r.submissionId === s.id)
  if (!revs.length) return s.responses
  return revs.reduce((a, b) => (a.editedAt >= b.editedAt ? a : b)).responses
}

export function findSubmission(data: StudyData, participantId: string, cycleNo: number, label: VisitLabel): Submission | undefined {
  return data.submissions.find(s => s.participantId === participantId && s.cycleNo === cycleNo && s.visitLabel === label)
}

export type VisitStatus = 'done' | 'missed' | 'due' | 'overdue' | 'upcoming'

export interface VisitState {
  cycle: Cycle
  def: VisitDef
  scheduled: string
  status: VisitStatus
  submission?: Submission
  contacts: number
}

export function visitState(data: StudyData, p: Participant, cycle: Cycle, label: VisitLabel, today = studyDate()): VisitState {
  const def = visitDef(label)
  const submission = findSubmission(data, p.id, cycle.cycleNo, label)
  const contacts = data.contacts.filter(c => c.participantId === p.id && c.cycleNo === cycle.cycleNo && c.visitLabel === label).length
  const scheduled = scheduledDate(cycle, label)
  const offset = daysBetween(cycle.infusionDate, today)
  let status: VisitStatus
  if (submission) status = 'done'
  else if (data.missedVisits.some(m => m.participantId === p.id && m.cycleNo === cycle.cycleNo && m.visitLabel === label)) status = 'missed'
  else if (offset < def.windowFrom) status = 'upcoming'
  else if (offset <= def.windowTo) status = 'due'
  else status = 'overdue'
  return { cycle, def, scheduled, status, submission, contacts }
}

export function allVisitStates(data: StudyData, p: Participant, today = studyDate()): VisitState[] {
  return [...p.cycles]
    .sort((a, b) => a.cycleNo - b.cycleNo)
    .flatMap(c => VISITS.map(v => visitState(data, p, c, v.label, today)))
}

/** The visit a patient should fill now: one due today, else the oldest overdue one. */
export function pendingVisit(data: StudyData, p: Participant, today = studyDate()): VisitState | undefined {
  const states = allVisitStates(data, p, today)
  return states.find(s => s.status === 'due') ?? states.find(s => s.status === 'overdue')
}

export function nextUpcoming(data: StudyData, p: Participant, today = studyDate()): VisitState | undefined {
  return allVisitStates(data, p, today).find(s => s.status === 'upcoming')
}

export function latestSubmission(data: StudyData, participantId: string): Submission | undefined {
  return data.submissions
    .filter(s => s.participantId === participantId)
    .reduce<Submission | undefined>((a, b) => (!a || b.completedAt > a.completedAt ? b : a), undefined)
}

export function latestCycle(p: Participant): Cycle | undefined {
  return p.cycles.reduce<Cycle | undefined>((a, b) => (!a || b.cycleNo > a.cycleNo ? b : a), undefined)
}

/** Relative dose intensity for one cycle = actual / planned dose (null if either is missing). */
export function rdi(cycle: Cycle): number | null {
  const planned = Number(cycle.outcome.plannedDose)
  const actual = Number(cycle.outcome.actualDose)
  if (!cycle.outcome.plannedDose || !cycle.outcome.actualDose || !planned) return null
  return Math.round((actual / planned) * 1000) / 1000
}

export function crfCompleteness(p: Participant): { demographics: number; clinical: number } {
  const d = Object.values(p.demographics)
  const c = Object.entries(p.clinical).filter(([k]) => k !== 'comorbidityDetail').map(([, v]) => v)
  const pct = (vals: string[]) => Math.round((vals.filter(v => v !== '').length / vals.length) * 100)
  return { demographics: pct(d), clinical: pct(c) }
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
