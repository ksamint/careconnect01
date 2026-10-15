import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useL } from '../../study/useL'
import SurveyRunner from '../../components/study/SurveyRunner'
import { FlowShell, PrimaryButton, SecondaryButton } from '../../components/layout'
import type { Filler, VisitLabel } from '../../study/types'

/** Patient fills the questionnaire on the nurse's tablet/phone (self), or the nurse reads it out and taps the answers (proxy). */
export default function FillOnDevice() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const L = useL()
  const [filler, setFiller] = useState<Filler | null>(null)
  const back = `/clinical/patient/${id}`
  const cycleNo = Number(params.get('cycle'))
  const visitLabel = params.get('visit') as VisitLabel

  if (!filler) {
    return (
      <FlowShell backTo={back} title={`${id} · ${visitLabel}`}>
        <div className="px-6 py-10 max-w-md mx-auto flex flex-col gap-4">
          <h1 className="text-xl font-bold">{L('谁来点选答案？', 'Who will tap the answers?')}</h1>
          <PrimaryButton onClick={() => setFiller('self')}>{L('患者自己在本设备上填写', 'The patient, on this device')}</PrimaryButton>
          <SecondaryButton onClick={() => setFiller('proxy')}>{L('护士读题、按患者回答代为点选', 'Nurse reads aloud and taps for the patient')}</SecondaryButton>
          <p className="text-xs text-on-surface-variant">{L('填写结束后将自动回到患者页面。', 'You will return to the patient page when done.')}</p>
        </div>
      </FlowShell>
    )
  }

  return (
    <SurveyRunner
      participantId={id!}
      cycleNo={cycleNo}
      visitLabel={visitLabel}
      mode="electronic"
      filler={filler}
      onExit={() => navigate(back)}
      onDone={() => navigate(back, { replace: true })}
    />
  )
}
