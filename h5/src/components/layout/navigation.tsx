import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { Icon } from '../ui'

interface BackBarProps {
  label?: string
  to?: string
  fallback?: string
  className?: string
}

export function BackBar({ label, to, fallback = '/', className = '' }: BackBarProps) {
  const navigate = useNavigate()

  const handleBack = () => {
    if (to) {
      navigate(to)
      return
    }
    if (window.history.length > 1) navigate(-1)
    else navigate(fallback)
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className={`inline-flex items-center gap-1.5 text-secondary text-sm font-medium min-h-[44px] -ml-1 px-1 rounded-lg active:bg-secondary/5 transition-colors ${className}`}
      aria-label={label ?? 'Back'}
    >
      <Icon name="arrow_back" className="text-xl" />
      {label && <span>{label}</span>}
    </button>
  )
}

interface SubPageHeaderProps {
  title: string
  backTo: string
  backLabel?: string
}

export function SubPageHeader({ title, backTo, backLabel }: SubPageHeaderProps) {
  return (
    <div className="mb-5">
      <BackBar to={backTo} label={backLabel} />
      <h1 className="text-xl font-bold text-on-surface mt-2 tracking-tight">{title}</h1>
    </div>
  )
}

interface FlowShellProps {
  children: React.ReactNode
  backTo: string
  backLabel?: string
  title?: string
  footer?: React.ReactNode
  className?: string
}

/** Full-screen flow without bottom nav (assessment, success, login). */
export function FlowShell({ children, backTo, backLabel, title, footer, className = '' }: FlowShellProps) {
  return (
    <div className={`min-h-[100dvh] flex flex-col ${className}`}>
      <header className="sticky top-0 z-50 px-[var(--spacing-container-padding)] pt-[max(12px,env(safe-area-inset-top))] pb-3 bg-background/80 backdrop-blur-xl border-b border-white/60">
        <div className="max-w-2xl mx-auto w-full flex items-center justify-between gap-3">
          <BackBar to={backTo} label={backLabel} />
          {title && <span className="text-sm font-semibold text-on-surface-variant truncate">{title}</span>}
          <div className="w-10" />
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">{children}</main>
      {footer && (
        <footer className="sticky bottom-0 px-[var(--spacing-container-padding)] py-4 pb-[max(16px,env(safe-area-inset-bottom))] bg-background/90 backdrop-blur-xl border-t border-white/60">
          <div className="max-w-2xl mx-auto w-full">{footer}</div>
        </footer>
      )}
    </div>
  )
}

export function LangButton({ className = '' }: { className?: string }) {
  const { tr, toggleLocale } = useApp()
  return (
    <button
      type="button"
      onClick={toggleLocale}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold bg-white/70 border border-outline-variant/40 text-on-surface-variant shadow-sm active:scale-95 transition-transform ${className}`}
    >
      {tr.langToggle}
    </button>
  )
}

export function PrimaryButton({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`w-full min-h-[56px] rounded-2xl bg-primary-container text-white font-semibold text-base shadow-[0_8px_24px_-4px_rgba(76,175,80,0.45)] active:scale-[0.98] disabled:opacity-45 disabled:shadow-none transition-all ${className}`}
    >{children}</button>
  )
}

export function SecondaryButton({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`w-full min-h-[48px] rounded-2xl border-2 border-outline-variant/60 text-on-surface font-medium active:scale-[0.98] transition-all ${className}`}
    >{children}</button>
  )
}
