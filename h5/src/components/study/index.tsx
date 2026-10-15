import { useState, type ReactNode } from 'react'
import { useApp } from '../../context/AppContext'
import { useStudy } from '../../study/useStudy'
import { useL } from '../../study/useL'
import { ITEMS, itemLabel, type Domain, type Responses } from '../../study/instrument'
import { OPTIONS, type OptionKey } from '../../study/options'
import type { VisitStatus } from '../../study/logic'
import { Icon } from '../ui'

// ---------- 0–10 score picker ----------

interface ScoreGridProps {
  value: number | null | undefined
  onChange: (v: number | null) => void
  /** Show a "blank" button that records the item as not answered. */
  allowBlank?: boolean
  compact?: boolean
  highlight?: boolean
}

export function ScoreGrid({ value, onChange, allowBlank, compact, highlight }: ScoreGridProps) {
  const L = useL()
  const size = compact ? 'w-8 h-8 text-sm' : 'h-12 text-lg'
  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? '' : 'grid grid-cols-6 gap-2'} ${highlight ? 'ring-2 ring-error/60 rounded-lg p-1' : ''}`}>
      {Array.from({ length: 11 }, (_, n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-pressed={value === n}
          className={`${size} ${compact ? '' : 'w-full'} rounded-lg border font-semibold transition-colors ${
            value === n ? 'bg-primary text-white border-primary' : 'bg-white border-outline-variant/60 text-on-surface'
          }`}
        >
          {n}
        </button>
      ))}
      {allowBlank && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-pressed={value === null}
          className={`${size} ${compact ? 'px-2' : 'w-full col-span-1'} rounded-lg border text-xs font-medium ${
            value === null ? 'bg-on-surface-variant text-white border-on-surface-variant' : 'bg-white border-dashed border-outline-variant text-outline'
          }`}
        >
          {L('空', 'Blank')}
        </button>
      )}
    </div>
  )
}

// ---------- all 19 items on one screen (nurse entry / edit / verify) ----------

interface ResponsesEditorProps {
  value: Partial<Responses>
  onChange: (next: Partial<Responses>) => void
  /** Item ids to highlight (e.g. mismatches). */
  flagged?: string[]
  /** Previous values to show next to each item (edit mode). */
  previous?: Responses
}

export function ResponsesEditor({ value, onChange, flagged = [], previous }: ResponsesEditorProps) {
  const { locale } = useApp()
  const L = useL()
  const section = (domain: Domain, title: string) => (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{title}</h3>
      {ITEMS.filter(i => i.domain === domain).map(item => {
        const v = value[item.id]
        const changed = previous && previous[item.id] !== (v ?? null) && v !== undefined
        return (
          <div key={item.id} className={`bg-white rounded-xl p-3 border ${changed ? 'border-tertiary' : 'border-surface-variant'}`}>
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <span className="text-sm font-medium text-on-surface">
                <span className="text-outline mr-1.5">{item.order}.</span>{itemLabel(item, locale)}
              </span>
              <span className="text-xs text-outline shrink-0">
                {previous && <>{L('原', 'was')} {previous[item.id] ?? L('空', 'blank')} → </>}
                {v === undefined ? L('未填', 'not set') : v === null ? L('空', 'blank') : v}
              </span>
            </div>
            <ScoreGrid compact allowBlank value={v} highlight={flagged.includes(item.id)} onChange={n => onChange({ ...value, [item.id]: n })} />
          </div>
        )
      })}
    </div>
  )
  return (
    <div className="flex flex-col gap-6">
      {section('symptom', L('第一部分 · 症状严重程度（1–13）', 'Part 1 · Symptom severity (1–13)'))}
      {section('interference', L('第二部分 · 对日常生活的影响（14–19）', 'Part 2 · Interference with daily life (14–19)'))}
    </div>
  )
}

// ---------- password re-entry ----------

interface PasswordDialogProps {
  title: string
  description?: string
  onConfirm: (password: string) => void
  onCancel: () => void
}

export function PasswordDialog({ title, description, onConfirm, onCancel }: PasswordDialogProps) {
  const { verifyPassword, user } = useApp()
  const L = useL()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const ok = await verifyPassword(password)
    setBusy(false)
    if (ok) onConfirm(password)
    else setError(L('密码不正确', 'Incorrect password'))
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-xl flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Icon name="lock" className="text-secondary text-2xl" />
          <h2 className="text-lg font-bold text-on-surface">{title}</h2>
        </div>
        {description && <p className="text-sm text-on-surface-variant">{description}</p>}
        <p className="text-xs text-outline">{L('当前账号', 'Signed in as')}: <b>{user?.username}</b></p>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder={L('请输入您的登录密码', 'Enter your password')}
          className="w-full h-12 px-4 rounded-xl border border-outline-variant/60 text-base"
        />
        {error && <p className="text-error text-sm">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 min-h-[48px] rounded-xl border border-outline-variant font-medium">{L('取消', 'Cancel')}</button>
          <button type="submit" disabled={!password || busy} className="flex-1 min-h-[48px] rounded-xl bg-secondary text-white font-semibold disabled:opacity-40">
            {busy ? '…' : L('确认', 'Confirm')}
          </button>
        </div>
      </form>
    </div>
  )
}

// ---------- form fields ----------

const inputCls = 'w-full h-11 px-3 rounded-lg border border-outline-variant/60 bg-white text-sm'

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-on-surface-variant">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-outline">{hint}</span>}
    </label>
  )
}

export function SelectField({ label, optionKey, value, onChange }: { label: string; optionKey: OptionKey; value: string; onChange: (v: string) => void }) {
  const { locale } = useApp()
  const L = useL()
  return (
    <Field label={label}>
      <select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>
        <option value="">{L('— 请选择 —', '— select —')}</option>
        {OPTIONS[optionKey].map(o => <option key={o.code} value={o.code}>{o[locale]}</option>)}
      </select>
    </Field>
  )
}

export function TextField({ label, value, onChange, type = 'text', hint, placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; hint?: string; placeholder?: string }) {
  return (
    <Field label={label} hint={hint}>
      <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} className={inputCls} inputMode={type === 'number' ? 'decimal' : undefined} />
    </Field>
  )
}

export function Card({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="bg-white rounded-2xl p-4 border border-surface-variant shadow-sm mb-4">
      {(title || action) && (
        <div className="flex items-center justify-between mb-3 gap-2">
          {title && <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

// ---------- status ----------

export function VisitStatusPill({ status }: { status: VisitStatus }) {
  const L = useL()
  const map: Record<VisitStatus, [string, string]> = {
    done: ['bg-green-50 text-risk-stable border-green-200', L('已完成', 'Done')],
    due: ['bg-blue-50 text-secondary border-blue-200', L('今日应填', 'Due')],
    overdue: ['bg-orange-50 text-risk-elevated border-orange-200', L('已超窗', 'Overdue')],
    upcoming: ['bg-surface-container text-outline border-surface-variant', L('未到期', 'Upcoming')],
    missed: ['bg-surface-container text-on-surface-variant border-outline-variant', L('记为缺失', 'Missed')],
  }
  const [cls, label] = map[status]
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${cls}`}>{label}</span>
}

/** Shows when the device is offline or has queued submissions waiting to sync. */
export function SyncBanner() {
  const { online, pendingCount, error } = useStudy()
  const L = useL()
  if (online && !pendingCount && !error) return null
  return (
    <div className="mb-4 rounded-xl px-3 py-2 text-sm flex items-center gap-2 bg-orange-50 text-risk-elevated border border-orange-200">
      <Icon name={online ? 'sync' : 'cloud_off'} className="text-lg" />
      {!online
        ? L('网络已断开：填写内容已保存在本机，联网后自动上传。', 'Offline: answers are saved on this device and will upload automatically.')
        : pendingCount
          ? L(`有 ${pendingCount} 份问卷等待上传…`, `${pendingCount} submission(s) waiting to upload…`)
          : L('数据加载失败，正在重试…', 'Could not load data, retrying…')}
    </div>
  )
}
