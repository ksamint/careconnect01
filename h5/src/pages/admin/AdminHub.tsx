import { useNavigate } from 'react-router-dom'
import { useApp, isAdmin } from '../../context/AppContext'
import { Icon, GlassCard } from '../../components/ui'
import { LangButton } from '../../components/layout/navigation'

export default function AdminHub() {
  const { tr, user, locale, logout } = useApp()
  const navigate = useNavigate()

  if (!user || !isAdmin(user.role)) return null

  const displayName = locale === 'zh' ? user.displayNameZh : user.displayNameEn
  const roleLabel = user.role === 'system_admin' ? tr.systemAdmin : tr.orgAdmin

  const portals = [
    { id: 'patient' as const, icon: 'spa', title: tr.rolePatient, path: '/patient/home' },
    { id: 'clinical' as const, icon: 'clinical_notes', title: tr.roleClinical, path: '/clinical/cohort' },
    { id: 'research' as const, icon: 'analytics', title: tr.roleResearch, path: '/research/analytics' },
  ]

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-[100dvh] px-[var(--spacing-container-padding)] py-8 max-w-lg mx-auto">
      <div className="flex justify-between items-start mb-8">
        <div>
          <p className="text-xs font-semibold text-secondary uppercase tracking-widest mb-1">{tr.adminHub}</p>
          <h1 className="text-2xl font-bold text-on-surface">{displayName}</h1>
          <span className="inline-block mt-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">{roleLabel}</span>
        </div>
        <LangButton />
      </div>

      <p className="text-sm text-on-surface-variant mb-6">{tr.adminHubDesc}</p>

      <div className="flex flex-col gap-3 mb-8">
        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{tr.enterAs}</p>
        {portals.map(p => (
          <GlassCard key={p.id} onClick={() => navigate(p.path)} className="p-4 flex items-center gap-4 rounded-2xl">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon name={p.icon} className="text-primary text-2xl" />
            </div>
            <span className="flex-1 font-semibold text-on-surface">{p.title}</span>
            <Icon name="chevron_right" className="text-outline" />
          </GlassCard>
        ))}
      </div>

      <GlassCard onClick={() => navigate('/admin/study')} className="p-4 flex items-center gap-4 rounded-2xl mb-3 border border-secondary/15">
        <div className="w-11 h-11 rounded-xl bg-secondary/10 flex items-center justify-center">
          <Icon name="tune" className="text-secondary text-2xl" />
        </div>
        <div className="flex-1">
          <span className="font-semibold text-on-surface block">{locale === 'zh' ? '研究设置与入组开关' : 'Study settings & enrolment'}</span>
          <span className="text-xs text-on-surface-variant">{locale === 'zh' ? '伦理/同意书/量表版本、合规清单、备份' : 'Ethics, consent, instrument version, checklist, backup'}</span>
        </div>
        <Icon name="chevron_right" className="text-outline" />
      </GlassCard>

      <GlassCard onClick={() => navigate('/admin/users')} className="p-4 flex items-center gap-4 rounded-2xl mb-8 border border-secondary/15">
        <div className="w-11 h-11 rounded-xl bg-secondary/10 flex items-center justify-center">
          <Icon name="manage_accounts" className="text-secondary text-2xl" />
        </div>
        <div className="flex-1">
          <span className="font-semibold text-on-surface block">{tr.userManagement}</span>
          <span className="text-xs text-on-surface-variant">{tr.userManagementDesc}</span>
        </div>
        <Icon name="chevron_right" className="text-outline" />
      </GlassCard>

      <button type="button" onClick={handleLogout} className="w-full min-h-[48px] rounded-xl border border-outline-variant text-on-surface-variant font-medium">
        {tr.logout}
      </button>
    </div>
  )
}
