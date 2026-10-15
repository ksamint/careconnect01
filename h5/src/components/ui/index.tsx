import { type InputHTMLAttributes, type ReactNode } from 'react'
import { useApp } from '../../context/AppContext'

export function DateTimeInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { type: 'date' | 'time' }) {
  // Keep padding on the wrapper: iOS miscalculates padded date inputs at width 100%.
  return <div className={`flex items-center ${className}`}><input {...props} className="date-time-input" /></div>
}

interface GlassCardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
}

export function GlassCard({ children, className = '', onClick }: GlassCardProps) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`glass-card rounded-[28px] ${onClick ? 'text-left w-full transition-all active:scale-[0.98]' : ''} ${className}`}
    >
      {children}
    </Tag>
  )
}

export function LangToggle() {
  const { tr, toggleLocale } = useApp()
  return (
    <button
      type="button"
      onClick={toggleLocale}
      className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/60 border border-outline-variant/50 text-on-surface-variant hover:bg-white transition-colors min-h-[36px]"
      aria-label="Toggle language"
    >
      {tr.langToggle}
    </button>
  )
}

export function Icon({ name, filled, rounded, className = '', style }: { name: string; filled?: boolean; rounded?: boolean; className?: string; style?: React.CSSProperties }) {
  const cls = rounded ? 'material-symbols-rounded' : `material-symbols-outlined${filled ? ' filled' : ''}`
  return <span className={`${cls} ${className}`} style={style}>{name}</span>
}

export function RiskBadge({ level }: { level: 'critical' | 'elevated' | 'stable' }) {
  const { tr } = useApp()
  const styles = {
    critical: 'bg-red-50 text-risk-critical border-red-200',
    elevated: 'bg-orange-50 text-risk-elevated border-orange-200',
    stable: 'bg-green-50 text-risk-stable border-green-200',
  }
  const labels = { critical: tr.critical, elevated: tr.elevated, stable: tr.stable }
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${styles[level]}`}>
      {labels[level]}
    </span>
  )
}
