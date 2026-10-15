import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { PatientHeader, PatientLayout } from '../../components/layout'
import { GlassCard, Icon } from '../../components/ui'
import { SyncBanner } from '../../components/study'
import { useStudy } from '../../study/useStudy'
import { useL } from '../../study/useL'
import { usePatientRecord } from '../../study/usePatientRecord'
import { pendingVisit, nextUpcoming, latestCycle, daysBetween, studyDate } from '../../study/logic'

export default function PatientHome() {
  const { tr, locale, user, wisdomRead } = useApp()
  const { data } = useStudy()
  const L = useL()
  const participant = usePatientRecord()
  const navigate = useNavigate()
  const visit = data && participant ? pendingVisit(data, participant) : undefined
  const next = data && participant ? nextUpcoming(data, participant) : undefined
  const cycle = participant ? latestCycle(participant) : undefined
  const dayNo = cycle ? daysBetween(cycle.infusionDate, studyDate()) : null
  const doneCount = data && participant ? data.submissions.filter(s => s.participantId === participant.id).length : 0
  const totalVisits = participant ? participant.cycles.length * 3 : 0
  const patientName = user
    ? (locale === 'zh' ? user.displayNameZh : user.displayNameEn)
    : (locale === 'zh' ? '小康' : 'Alex')

  return (
    <>
      <PatientHeader />
      <PatientLayout>
        <main className="flex-1 px-[var(--spacing-container-padding)] flex flex-col gap-[var(--spacing-stack-gap-lg)] max-w-2xl mx-auto w-full">
          <SyncBanner />
          <section className="flex flex-col gap-1 pt-2">
            <div className="flex items-center gap-2 mb-1">
              <Icon name="shield_person" className="text-[16px] text-outline" />
              <span className="text-[13px] text-outline font-light tracking-wide">{tr.privacyModeOn}</span>
            </div>
            <h1 className="text-[32px] leading-tight font-light text-on-surface tracking-tight">
              {tr.greeting}<span className="font-medium text-gradient">{patientName}</span>
            </h1>
            <p className="text-base text-on-surface-variant font-light mt-1 opacity-80">{tr.greetingSub}</p>
          </section>

          <section className="flex flex-col gap-5">
            <h2 className="text-sm text-on-surface-variant font-medium tracking-widest uppercase opacity-60 ml-1">{tr.recoveryJourney}</h2>
            <GlassCard className="p-7 relative overflow-hidden">
              <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
              <div className="flex justify-between items-start mb-6 relative z-10">
                <div className="flex flex-col gap-1.5">
                  <span className="text-2xl font-medium text-on-surface">{cycle ? L(`化疗第 ${cycle.cycleNo} 周期`, `Chemo cycle ${cycle.cycleNo}`) : participant?.id ?? '—'}</span>
                  <span className="text-[15px] font-light text-outline">
                    {dayNo === null ? '' : dayNo < 0 ? L(`距输注还有 ${-dayNo} 天`, `${-dayNo} day(s) until infusion`) : L(`化疗后第 ${dayNo} 天`, `Day ${dayNo} after infusion`)}
                  </span>
                </div>
                <div className="bg-secondary/5 text-secondary px-4 py-2 rounded-2xl text-[13px] font-medium flex items-center gap-2 border border-secondary/10">
                  <Icon name="water_drop" filled className="text-[18px]" />
                  {tr.hydrating}
                </div>
              </div>
              <div className="flex items-center gap-6 relative z-10">
                <div className="flex flex-col items-center">
                  <span className="text-3xl font-light text-primary">{doneCount}/{totalVisits}</span>
                  <span className="text-xs text-outline">{L('已完成问卷', 'Questionnaires done')}</span>
                </div>
                <div className="flex-1 h-2 bg-surface-variant/60 rounded-full overflow-hidden">
                  <div className="h-full bg-secondary rounded-full" style={{ width: `${totalVisits ? (doneCount / totalVisits) * 100 : 0}%` }} />
                </div>
              </div>
            </GlassCard>
          </section>

          <section className="flex flex-col gap-5">
            <h2 className="text-sm text-on-surface-variant font-medium tracking-widest uppercase opacity-60 ml-1">{tr.todayTasks}</h2>
            <div className="flex flex-col gap-4">
              {visit ? (
                <GlassCard onClick={() => navigate('/patient/assessment')} className="p-5 flex items-center gap-5 min-h-[88px] relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-primary to-inverse-primary opacity-80" />
                  <div className="w-14 h-14 rounded-2xl bg-white shadow-sm border border-primary/5 flex items-center justify-center shrink-0 text-primary">
                    <Icon name="assignment" className="text-[26px]" />
                  </div>
                  <div className="flex-1">
                    <span className="text-lg font-medium block mb-1">{L(`完成 ${visit.def.label} 症状评估`, `Complete ${visit.def.label} symptom check`)}</span>
                    <span className="text-[13px] text-tertiary flex items-center gap-1.5">
                      <Icon name="schedule" className="text-[14px]" />
                      {visit.status === 'overdue' ? L('已过建议时间，请尽快填写', 'Past the suggested day — please fill it in now') : L('19 题，约 3 分钟', '19 questions, about 3 minutes')}
                    </span>
                  </div>
                  <div className="w-7 h-7 rounded-full border border-outline-variant shrink-0 mr-1 bg-white/50" />
                </GlassCard>
              ) : (
                <GlassCard className="p-5 flex items-center gap-5 min-h-[88px] opacity-80">
                  <div className="w-14 h-14 rounded-2xl bg-surface-container/50 flex items-center justify-center shrink-0 text-outline">
                    <Icon name="assignment" className="text-[26px]" />
                  </div>
                  <div className="flex-1">
                    <span className="text-lg font-medium">{L('今日无待填问卷', 'No questionnaire due today')}</span>
                    <span className="text-[13px] text-primary flex items-center gap-1.5 mt-1">
                      <Icon name="check_circle" className="text-[14px]" />
                      {next ? L(`下一次 ${next.def.label}：${next.scheduled}`, `Next ${next.def.label}: ${next.scheduled}`) : tr.taskWisdomDone}
                    </span>
                  </div>
                </GlassCard>
              )}

              <GlassCard
                onClick={() => navigate(wisdomRead ? '/patient/wisdom' : '/patient/wisdom/1')}
                className={`relative p-5 flex items-center gap-5 min-h-[88px] ${wisdomRead ? 'opacity-70' : ''}`}
              >
                {!wisdomRead && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-secondary to-secondary-container opacity-80 rounded-l-[28px]" />}
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${wisdomRead ? 'bg-surface-container/50 text-outline' : 'bg-white shadow-sm border border-secondary/5 text-secondary'}`}>
                  <Icon name="auto_stories" className="text-[26px]" />
                </div>
                <div className="flex-1 relative">
                  <span className={`text-lg font-medium block ${wisdomRead ? 'line-through decoration-1 text-on-surface-variant' : ''}`}>{tr.taskWisdom}</span>
                  {wisdomRead ? (
                    <span className="text-[13px] text-primary flex items-center gap-1.5 mt-1">
                      <Icon name="check_circle" className="text-[14px]" />
                      {tr.taskWisdomDone}
                    </span>
                  ) : (
                    <span className="text-[13px] text-secondary flex items-center gap-1.5 mt-1">{tr.readMore}</span>
                  )}
                </div>
                {wisdomRead ? (
                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon name="check" className="text-[18px]" />
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-full border border-outline-variant shrink-0 bg-white/50" />
                )}
              </GlassCard>
            </div>
          </section>

          <section>
            <GlassCard className="botanical-bg p-8 flex flex-col gap-4 relative overflow-hidden border border-primary/10">
              <Icon name="local_florist" className="absolute -right-6 -bottom-8 text-[160px] text-primary/5 pointer-events-none -rotate-12" />
              <div className="flex items-center gap-2.5 text-primary relative z-10">
                <Icon name="favorite" filled className="text-[22px]" />
                <span className="text-[15px] font-medium">{tr.dailyMessage}</span>
              </div>
              <p className="text-[17px] text-on-surface-variant font-light leading-relaxed relative z-10">
                {tr.dailyMessageBody}
                <span className="mt-2 block font-medium text-on-surface">{tr.dailyMessageHighlight}</span>
              </p>
            </GlassCard>
          </section>
        </main>
      </PatientLayout>
    </>
  )
}
