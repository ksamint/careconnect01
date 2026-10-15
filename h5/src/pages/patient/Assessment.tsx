import { useNavigate } from 'react-router-dom'
import { useStudy } from '../../study/useStudy'
import { useL } from '../../study/useL'
import { usePatientRecord } from '../../study/usePatientRecord'
import { pendingVisit, nextUpcoming } from '../../study/logic'
import SurveyRunner from '../../components/study/SurveyRunner'
import { FlowShell, PrimaryButton } from '../../components/layout'
import { GlassCard, Icon } from '../../components/ui'

export default function Assessment() {
  const navigate = useNavigate()
  const { data } = useStudy()
  const L = useL()
  const participant = usePatientRecord()

  if (!data) {
    return <div className="min-h-[100dvh] flex items-center justify-center text-on-surface-variant">{L('加载中…', 'Loading…')}</div>
  }

  const visit = participant ? pendingVisit(data, participant) : undefined
  if (!participant || !visit) {
    const next = participant ? nextUpcoming(data, participant) : undefined
    return (
      <FlowShell backTo="/patient/home" footer={<PrimaryButton onClick={() => navigate('/patient/home')}>{L('返回首页', 'Back to home')}</PrimaryButton>}>
        <div className="px-6 py-12 max-w-md mx-auto text-center flex flex-col items-center gap-4">
          <Icon name="event_available" className="text-primary text-5xl" />
          <GlassCard className="p-6 w-full">
            <p className="text-lg font-medium text-on-surface">{L('目前没有需要填写的问卷', 'No questionnaire is due right now')}</p>
            {next && <p className="text-sm text-on-surface-variant mt-2">{L(`下一次：${next.def.label}（${next.scheduled}）`, `Next: ${next.def.label} (${next.scheduled})`)}</p>}
            {!participant && <p className="text-sm text-on-surface-variant mt-2">{L('您的账号尚未关联研究编号，请联系护士。', 'Your account is not linked to a study ID yet — please contact your nurse.')}</p>}
          </GlassCard>
        </div>
      </FlowShell>
    )
  }

  return (
    <SurveyRunner
      participantId={participant.id}
      cycleNo={visit.cycle.cycleNo}
      visitLabel={visit.def.label}
      mode="electronic"
      filler="self"
      onExit={() => navigate('/patient/home')}
      onDone={info => navigate('/patient/assessment/success', { state: info })}
    />
  )
}
