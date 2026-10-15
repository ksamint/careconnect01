import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useApp, isAdmin } from '../../context/AppContext'
import { Icon } from '../ui'
import { BackBar, LangButton } from './navigation'

const patientTabs = [
  { to: '/patient/home', icon: 'home', labelKey: 'navHome' as const },
  { to: '/patient/assessment', icon: 'assignment', labelKey: 'navAssessment' as const },
  { to: '/patient/wisdom', icon: 'auto_stories', labelKey: 'navWisdom' as const },
  { to: '/patient/profile', icon: 'person', labelKey: 'navProfile' as const },
]

const researchTabs = [
  { to: '/research/analytics', icon: 'analytics', labelKey: 'navAnalytics' as const },
  { to: '/research/export', icon: 'download', labelKey: 'navExport' as const },
]

function AdminHomeButton() {
  const { user } = useApp()
  const navigate = useNavigate()
  if (!user || !isAdmin(user.role)) return null
  return (
    <button type="button" onClick={() => navigate('/admin')} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-high text-secondary" aria-label="Admin">
      <Icon name="admin_panel_settings" className="text-[22px]" />
    </button>
  )
}

export function PatientBottomNav() {
  const { tr } = useApp()
  return (
    <div className="fixed bottom-6 left-0 right-0 px-6 z-50 pointer-events-none">
      <nav className="max-w-md mx-auto glass-nav rounded-full px-2 py-2 pointer-events-auto flex justify-between items-center shadow-[0_8px_32px_-8px_rgba(0,0,0,0.12)]">
        {patientTabs.map(tab => (
          <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `flex flex-col items-center justify-center gap-1 w-full py-2 rounded-full transition-all duration-200 ${isActive ? 'text-primary bg-primary/10 scale-[1.02]' : 'text-on-surface-variant'}`}>
            {({ isActive }) => (
              <>
                <Icon name={tab.icon} filled={isActive} className="text-[24px]" />
                <span className="text-[10px] font-semibold">{tr[tab.labelKey]}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export function PatientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col pt-[72px] pb-[100px]">
      {children}
      <PatientBottomNav />
    </div>
  )
}

export function PatientHeader() {
  const { tr, unreadCount, user, locale } = useApp()
  const navigate = useNavigate()
  const displayName = user ? (locale === 'zh' ? user.displayNameZh : user.displayNameEn) : tr.appName

  return (
    <header className="fixed top-0 w-full z-50 px-[var(--spacing-container-padding)] py-3 pt-[max(12px,env(safe-area-inset-top))] bg-background/70 backdrop-blur-xl border-b border-white/50">
      <div className="flex items-center justify-between w-full max-w-2xl mx-auto">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-white/80 shadow-sm flex items-center justify-center border border-white shrink-0">
            <Icon name="spa" className="text-primary text-[24px]" />
          </div>
          <div className="min-w-0">
            <span className="text-sm font-semibold text-on-surface block truncate">{tr.appName}</span>
            <span className="text-[11px] text-outline truncate block">{displayName}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <LangButton className="!px-2.5 !py-1" />
          <AdminHomeButton />
          <button type="button" onClick={() => navigate('/patient/notifications')} className="relative w-10 h-10 rounded-full bg-white/80 shadow-sm flex items-center justify-center border border-white">
            <Icon name="notifications" className="text-[22px] text-on-surface-variant" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-error text-white text-[10px] font-bold flex items-center justify-center">{unreadCount}</span>
            )}
          </button>
        </div>
      </div>
    </header>
  )
}

interface ShellHeaderProps {
  title: string
  homeTo: string
  icon?: string
  resolveBack?: (pathname: string) => string
}

function ShellHeader({ title, homeTo, icon = 'clinical_notes', resolveBack }: ShellHeaderProps) {
  const location = useLocation()
  const isHome = location.pathname === homeTo
  const backTo = resolveBack ? resolveBack(location.pathname) : homeTo

  return (
    <header className="fixed top-0 left-0 right-0 z-50 clinical-header w-full h-14 pt-[env(safe-area-inset-top)]">
      <div className="flex justify-between items-center px-[var(--spacing-container-padding)] h-14 max-w-screen-xl mx-auto">
        {isHome ? (
          <NavLink to={homeTo} className="w-10 h-10 flex items-center justify-center"><Icon name={icon} className="text-primary text-[28px]" /></NavLink>
        ) : (
          <BackBar to={backTo} className="!min-h-[40px]" />
        )}
        <h1 className="text-base font-bold text-primary truncate px-2">{title}</h1>
        <div className="flex items-center gap-1">
          <LangButton className="!px-2 !py-1 !text-[11px]" />
          <AdminHomeButton />
        </div>
      </div>
    </header>
  )
}

function clinicalBack(pathname: string): string {
  const action = pathname.match(/^(\/clinical\/patient\/[^/]+\/submission\/[^/]+)\/action/)
  if (action) return action[1]
  const sub = pathname.match(/^(\/clinical\/patient\/[^/]+)\/.+/)
  if (sub) return sub[1]
  return '/clinical/cohort'
}

function researchBack(pathname: string): string {
  if (pathname.startsWith('/research/export')) return '/research/analytics'
  return '/research/analytics'
}

export function ClinicalLayout({ children }: { children: React.ReactNode }) {
  const { tr } = useApp()
  return (
    <div className="min-h-screen flex flex-col pt-[calc(56px+env(safe-area-inset-top))] pb-6">
      <ShellHeader title={tr.clinicalDashboard} homeTo="/clinical/cohort" icon="clinical_notes" resolveBack={clinicalBack} />
      <main className="flex-1 px-[var(--spacing-container-padding)] py-6 max-w-screen-md mx-auto w-full">{children}</main>
    </div>
  )
}

export function ResearchBottomNav() {
  const { tr } = useApp()
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-surface-variant px-4 py-2 pb-[max(8px,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.08)]">
      <nav className="max-w-md mx-auto flex justify-around">
        {researchTabs.map(tab => (
          <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `flex flex-col items-center gap-1 py-2 px-6 rounded-xl transition-colors ${isActive ? 'text-primary bg-primary/8' : 'text-on-surface-variant'}`}>
            {({ isActive }) => (
              <>
                <Icon name={tab.icon} filled={isActive} />
                <span className="text-[10px] font-semibold">{tr[tab.labelKey]}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export function ResearchLayout({ children }: { children: React.ReactNode }) {
  const { tr } = useApp()
  return (
    <div className="min-h-screen flex flex-col pt-[calc(56px+env(safe-area-inset-top))] pb-20">
      <ShellHeader title={tr.analyticsTitle} homeTo="/research/analytics" icon="analytics" resolveBack={researchBack} />
      <main className="flex-1 px-[var(--spacing-container-padding)] py-6 max-w-screen-md mx-auto w-full">{children}</main>
      <ResearchBottomNav />
    </div>
  )
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh]">{children}</div>
}

export { BackBar, SubPageHeader, FlowShell, LangButton, PrimaryButton, SecondaryButton } from './navigation'
