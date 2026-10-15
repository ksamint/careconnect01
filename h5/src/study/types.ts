import type { Responses } from './instrument'

export type VisitLabel = 'T0' | 'T1' | 'T2'
export type EntryMode = 'electronic' | 'paper' | 'phone'
export type Filler = 'self' | 'proxy'
export type AlertLevel = 'high' | 'medium' | 'none'
export type ContactChannel = 'push_am' | 'push_pm' | 'phone'
export type AlertActionType = 'teleConsult' | 'pathwayUpdate' | 'medicationAdjust' | 'adviceOnly'

export interface StudyConfig {
  studyCode: string
  ethicsApprovalNo: string
  ethicsApprovalDate: string
  consentVersion: string
  instrumentVersion: string
  instrumentLicensed: boolean
  instrumentLanguage: string
  alertRuleVersion: string
  realEnrollmentEnabled: boolean
  realEnrollmentEnabledBy?: string
  realEnrollmentEnabledAt?: string
  /** Pre-enrolment compliance checklist: item key → who/when ticked. */
  checklist: Record<string, { by: string; at: string } | undefined>
}

export interface Demographics {
  sex: string
  age: string
  ethnicity: string
  marital: string
  education: string
  occupation: string
  income: string
  payment: string
}

export interface ClinicalInfo {
  tumorType: string
  pathology: string
  stage: string
  comorbidity: string
  comorbidityDetail: string
  regimen: string
  priorChemoCount: string
  ecog: string
  antiemeticProphylaxis: string
  gcsfProphylaxis: string
}

export interface CycleOutcome {
  unplannedVisit: string
  unplannedVisitDate: string
  unplannedVisitType: string
  unplannedVisitReason: string
  plannedDose: string
  actualDose: string
  nextCycleDelayDays: string
}

export interface Cycle {
  cycleNo: number
  /** Infusion start date (day 0), Asia/Shanghai calendar date YYYY-MM-DD. */
  infusionDate: string
  outcome: CycleOutcome
}

export interface Participant {
  id: string
  synthetic: boolean
  alias: string
  /** Optional patient login linked to this participant (patient portal self-report). */
  username: string
  enrolledAt: string
  enrolledBy: string
  consentVersion: string
  consentDate: string
  status: 'active' | 'withdrawn'
  withdrawnAt?: string
  withdrawReason?: string
  demographics: Demographics
  clinical: ClinicalInfo
  cycles: Cycle[]
  susScore: string
}

export interface Submission {
  id: string
  participantId: string
  cycleNo: number
  visitLabel: VisitLabel
  /** When the patient actually filled it (for paper: the date written on the form). ISO UTC. */
  completedAt: string
  /** When the record was created in the system. ISO UTC. */
  enteredAt: string
  enteredBy: string
  mode: EntryMode
  filler: Filler
  durationSec: number | null
  instrumentVersion: string
  instrumentLanguage: string
  alertRuleVersion: string
  /** Original answers — never changed after creation. */
  responses: Responses
  verification?: { by: string; at: string }
}

export interface Revision {
  id: string
  submissionId: string
  responses: Responses
  reason: string
  editedBy: string
  editedAt: string
}

export interface Contact {
  id: string
  participantId: string
  cycleNo: number
  visitLabel: VisitLabel
  channel: ContactChannel
  reached: boolean
  at: string
  by: string
  note: string
}

export interface MissedVisit {
  id: string
  participantId: string
  cycleNo: number
  visitLabel: VisitLabel
  reason: string
  at: string
  by: string
}

export interface AlertAction {
  id: string
  submissionId: string
  participantId: string
  type: AlertActionType
  notes: string
  followUp: boolean
  handledAt: string
  handledBy: string
}

export interface AuditEntry {
  id: string
  at: string
  actor: string
  action: string
  entity: string
  entityId: string
  detail: string
}

export interface StudyData {
  schemaVersion: 1
  config: StudyConfig
  participants: Participant[]
  submissions: Submission[]
  revisions: Revision[]
  contacts: Contact[]
  missedVisits: MissedVisit[]
  alertActions: AlertAction[]
  audit: AuditEntry[]
}
