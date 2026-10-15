import { useNavigate } from 'react-router-dom'
import { useApp, isAdmin } from '../../context/AppContext'
import { PatientHeader, PatientLayout } from '../../components/layout'
import { GlassCard, Icon } from '../../components/ui'
import { useStudy } from '../../study/useStudy'
import { useL } from '../../study/useL'
import { usePatientRecord } from '../../study/usePatientRecord'
import { currentResponses, displayMean, countMissing } from '../../study/logic'

export default function Profile() {
  const { tr, locale, user, toggleLocale, logout, privacyMode, togglePrivacyMode } = useApp()
  const { data } = useStudy()
  const L = useL()
  const participant = usePatientRecord()
  const history = data && participant
    ? data.submissions.filter(s => s.participantId === participant.id).sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1))
    : []
  const navigate = useNavigate()

  const displayName = user ? (locale === 'zh' ? user.displayNameZh : user.displayNameEn) : '—'

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <PatientHeader />
      <PatientLayout>
        <main className="flex-1 px-[var(--spacing-container-padding)] flex flex-col gap-6 max-w-2xl mx-auto w-full">
          <h1 className="text-2xl font-bold text-on-surface">{tr.profileTitle}</h1>

          <GlassCard className="p-6 flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Icon name="person" className="text-primary text-3xl" />
              </div>
              <div>
                <p className="font-semibold text-lg">{displayName}</p>
                <p className="text-sm text-outline">{participant?.id ?? user?.username} · {tr.studyId}</p>
              </div>
            </div>
            <button type="button" onClick={togglePrivacyMode} className="flex items-center justify-between w-full text-left">
              <div className="flex items-center gap-2 text-primary text-sm">
                <Icon name="shield" className="text-lg" />
                {privacyMode ? tr.privacyProtected : tr.privacyMode}
              </div>
              <div className={`w-11 h-6 rounded-full transition-colors ${privacyMode ? 'bg-primary' : 'bg-surface-variant'} relative`}>
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${privacyMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </button>
          </GlassCard>

          {history.length > 0 && data && (
            <section>
              <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3">{tr.assessmentHistory}</h2>
              <div className="flex flex-col gap-2">
                {history.map(h => {
                  const r = currentResponses(data, h)
                  const missing = countMissing(r)
                  return (
                    <GlassCard key={h.id} className="p-3 flex justify-between items-center">
                      <span className="text-sm text-on-surface">
                        {L(`第 ${h.cycleNo} 周期`, `Cycle ${h.cycleNo}`)} · {h.visitLabel} · {new Date(h.completedAt).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US')}
                      </span>
                      <span className="text-sm font-medium text-primary">
                        {tr.avgScore} {displayMean(r) ?? '—'}{missing ? L(` · ${missing} 题未答`, ` · ${missing} skipped`) : ''}
                      </span>
                    </GlassCard>
                  )
                })}
              </div>
            </section>
          )}

          <div className="flex flex-col gap-2">
            <GlassCard className="p-4 flex justify-between items-center">
              <span className="text-on-surface">{tr.studyEnrollment}</span>
              <span className="text-on-surface-variant text-sm">{tr.studyId}</span>
            </GlassCard>
            <GlassCard className="p-4 flex justify-between items-center" onClick={toggleLocale}>
              <span className="text-on-surface">{tr.language}</span>
              <span className="text-secondary text-sm font-medium">{locale === 'zh' ? '中文' : 'English'}</span>
            </GlassCard>
            {user && isAdmin(user.role) && (
              <GlassCard className="p-4 flex justify-between items-center" onClick={() => navigate('/admin')}>
                <span className="text-on-surface">{tr.adminConsole}</span>
                <Icon name="chevron_right" className="text-outline" />
              </GlassCard>
            )}
          </div>

          <button type="button" onClick={handleLogout} className="w-full min-h-[48px] rounded-xl border-2 border-outline-variant text-on-surface-variant font-medium">
            {tr.logout}
          </button>
        </main>
      </PatientLayout>
    </>
  )
}
