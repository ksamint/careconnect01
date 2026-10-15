import { useApp } from '../context/AppContext'
import { useStudy } from './useStudy'
import type { Participant } from './types'

/** The participant linked to the signed-in patient login (admins previewing the patient portal get the first one). */
export function usePatientRecord(): Participant | undefined {
  const { user } = useApp()
  const { data } = useStudy()
  if (!data) return undefined
  return data.participants.find(p => p.id === user?.participantId) ?? (user?.portal === 'patient' ? undefined : data.participants[0])
}
