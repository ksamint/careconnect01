import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useL } from '../../study/useL'
import { ITEMS, SYMPTOM_ITEMS, itemLabel, type Responses } from '../../study/instrument'
import { displayMean, alertLevel } from '../../study/logic'
import { FlowShell, PrimaryButton, SecondaryButton } from '../../components/layout'
import { GlassCard, Icon } from '../../components/ui'

export default function AssessmentSuccess() {
  const { tr, locale } = useApp()
  const L = useL()
  const navigate = useNavigate()
  const state = useLocation().state as { queued?: boolean; responses?: Responses } | null
  const responses = state?.responses
  const avg = responses ? displayMean(responses) : null
  const top = responses
    ? SYMPTOM_ITEMS.filter(i => typeof responses[i.id] === 'number').sort((a, b) => (responses[b.id] as number) - (responses[a.id] as number))[0]
    : undefined
  const high = responses ? alertLevel(responses) === 'high' : false

  return (
    <FlowShell
      backTo="/patient/home"
      backLabel={tr.backHome}
      footer={
        <div className="flex flex-col gap-3">
          <PrimaryButton onClick={() => navigate('/patient/home')}>{tr.backHome}</PrimaryButton>
          <SecondaryButton onClick={() => navigate('/patient/wisdom/1')}>{tr.viewWisdom}</SecondaryButton>
        </div>
      }
    >
      <div className="px-[var(--spacing-container-padding)] py-8 max-w-md mx-auto flex flex-col items-center text-center">
        <div className="w-24 h-24 rounded-full bg-primary-fixed flex items-center justify-center mb-6 pulse-glow shadow-lg">
          <Icon name={state?.queued ? 'cloud_upload' : 'check_circle'} filled className="text-primary text-5xl" />
        </div>
        <h1 className="text-2xl font-bold text-on-surface mb-2">{tr.successTitle}</h1>
        <p className="text-on-surface-variant max-w-xs mb-6">
          {state?.queued
            ? L('网络暂时不通，问卷已保存在手机上，联网后会自动上传。', 'You are offline. Your answers are saved on this phone and will upload automatically.')
            : tr.successBody}
        </p>

        {high && (
          <GlassCard className="w-full p-4 mb-4 text-left border border-red-200">
            <p className="text-sm text-risk-critical font-medium">
              {L('您有症状评分较高，护士会尽快与您联系。如感觉非常不适，请直接就医或拨打 120，不要等待平台回复。',
                'Some of your scores are high; a nurse will contact you. If you feel very unwell, seek care or call 120 directly — do not wait for the app.')}
            </p>
          </GlassCard>
        )}

        {responses && (
          <GlassCard className="w-full p-5 mb-6 text-left">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-outline">{tr.avgScore}</span>
              <span className="text-2xl font-light text-primary">{avg ?? '—'}</span>
            </div>
            {top && (
              <div className="flex justify-between items-center pb-3 mb-3 border-b border-surface-variant">
                <span className="text-sm text-outline">{tr.highestSymptom}</span>
                <span className="font-medium text-sm">{itemLabel(top, locale)} · {responses[top.id]}/10</span>
              </div>
            )}
            <div className="grid grid-cols-13 gap-1">
              {ITEMS.slice(0, 13).map(i => (
                <div key={i.id} className="h-8 rounded bg-surface-container flex items-end overflow-hidden">
                  <div className="w-full bg-primary-container/70" style={{ height: `${(responses[i.id] ?? 0) * 10}%` }} />
                </div>
              ))}
            </div>
          </GlassCard>
        )}
        <p className="text-on-surface-variant text-sm italic">{tr.reflectionPrompt}</p>
      </div>
    </FlowShell>
  )
}
