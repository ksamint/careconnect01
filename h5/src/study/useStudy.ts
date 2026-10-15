import { createContext, useContext } from 'react'
import type { StudyData } from './types'

export type OpName =
  | 'enroll' | 'resetPatientLogin' | 'updateParticipant' | 'submit' | 'revise' | 'verify'
  | 'contact' | 'markMissed' | 'alertAction' | 'updateConfig' | 'checklist' | 'setRealEnrollment'

export type OpResult<R = Record<string, unknown>> =
  | { ok: true; result: R; queued?: boolean }
  | { ok: false; error: string; extra: Record<string, unknown> }

export interface StudyContextValue {
  data: StudyData | null
  loading: boolean
  /** Last load error code, if the most recent refresh failed. */
  error: string | null
  online: boolean
  /** Submissions saved on this device and waiting to reach the server. */
  pendingCount: number
  refresh: () => Promise<void>
  mutate: <R = Record<string, unknown>>(op: OpName, payload: unknown, password?: string) => Promise<OpResult<R>>
  /** Like mutate('submit'), but queues on this device when offline and retries automatically. */
  submitSurvey: (payload: Record<string, unknown>) => Promise<OpResult<{ submissionId?: string }>>
}

export const StudyContext = createContext<StudyContextValue | null>(null)

export function useStudy(): StudyContextValue {
  const ctx = useContext(StudyContext)
  if (!ctx) throw new Error('useStudy must be used within StudyProvider')
  return ctx
}
