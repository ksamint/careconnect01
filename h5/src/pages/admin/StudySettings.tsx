import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useStudy } from '../../study/useStudy'
import { useL } from '../../study/useL'
import { api } from '../../api/client'
import { Icon } from '../../components/ui'
import { SubPageHeader, LangButton } from '../../components/layout/navigation'
import { Card, PasswordDialog, TextField, SyncBanner } from '../../components/study'
import { opErrorText } from '../../study/uiText'
import { CHECKLIST } from '../../study/options'
import { fmtTime } from '../../study/logic'
import type { StudyConfig } from '../../study/types'

type Pending = { op: 'updateConfig'; payload: Partial<StudyConfig> } | { op: 'setRealEnrollment'; payload: { enabled: boolean } } | null

export default function StudySettings() {
  const { locale } = useApp()
  const { data } = useStudy()
  const L = useL()
  if (!data) return <div className="p-6"><SyncBanner /></div>
  return <SettingsBody key={JSON.stringify(data.config)} config={data.config} locale={locale} L={L} />
}

function SettingsBody({ config, locale, L }: { config: StudyConfig; locale: 'zh' | 'en'; L: (zh: string, en: string) => string }) {
  const { mutate } = useStudy()
  const [form, setForm] = useState({
    ethicsApprovalNo: config.ethicsApprovalNo,
    ethicsApprovalDate: config.ethicsApprovalDate,
    consentVersion: config.consentVersion,
    instrumentVersion: config.instrumentVersion,
    instrumentLicensed: config.instrumentLicensed,
    instrumentLanguage: config.instrumentLanguage,
    alertRuleVersion: config.alertRuleVersion,
  })
  const [pending, setPending] = useState<Pending>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const set = (k: keyof typeof form) => (v: string | boolean) => setForm({ ...form, [k]: v })

  const run = async (password: string) => {
    if (!pending) return
    setPending(null)
    const res = await mutate(pending.op, pending.payload, password)
    if (res.ok) setMsg({ ok: true, text: L('已保存', 'Saved') })
    else {
      const missing = (res.extra.missing as string[] | undefined)?.join(', ')
      setMsg({ ok: false, text: opErrorText(res.error, L) + (missing ? `：${missing}` : '') })
    }
  }

  const tick = async (key: string, done: boolean) => {
    const res = await mutate('checklist', { key, done })
    if (!res.ok) setMsg({ ok: false, text: opErrorText(res.error, L) })
  }

  const backup = async () => {
    try {
      const r = await api<{ file: string }>('/api/admin/backup', { method: 'POST' })
      setMsg({ ok: true, text: L(`已备份：${r.file}`, `Backed up: ${r.file}`) })
    } catch {
      setMsg({ ok: false, text: L('备份失败', 'Backup failed') })
    }
  }

  const ticked = CHECKLIST.filter(c => config.checklist?.[c.key]).length

  return (
    <div className="min-h-[100dvh] px-[var(--spacing-container-padding)] py-6 max-w-lg mx-auto pb-10">
      <div className="flex justify-end mb-2"><LangButton /></div>
      <SubPageHeader title={L('研究设置与入组开关', 'Study settings & enrolment switch')} backTo="/admin" />
      <SyncBanner />
      {msg && <p className={`text-sm mb-4 rounded-xl px-3 py-2 ${msg.ok ? 'bg-green-50 text-risk-stable' : 'bg-orange-50 text-risk-elevated'}`}>{msg.text}</p>}

      <Card title={L('真实入组', 'Real enrolment')}>
        <div className="flex items-center gap-3 mb-3">
          <Icon name={config.realEnrollmentEnabled ? 'lock_open' : 'lock'} className={`text-3xl ${config.realEnrollmentEnabled ? 'text-risk-stable' : 'text-risk-elevated'}`} />
          <div className="text-sm">
            <p className="font-semibold">{config.realEnrollmentEnabled ? L('已开启', 'Enabled') : L('未开启（仅可登记演示患者）', 'Disabled (demo participants only)')}</p>
            {config.realEnrollmentEnabledAt && <p className="text-xs text-outline">{config.realEnrollmentEnabledBy} · {fmtTime(config.realEnrollmentEnabledAt, locale)}</p>}
          </div>
        </div>
        <p className="text-xs text-on-surface-variant mb-3">{L(`开启条件：量表已授权且版本号不含 placeholder、已填伦理批件号与同意书版本、下方 ${CHECKLIST.length} 项清单全部勾选（当前 ${ticked}/${CHECKLIST.length}）。`, `Requires: licensed instrument (version without "placeholder"), ethics no. and consent version, and all ${CHECKLIST.length} checklist items ticked (now ${ticked}/${CHECKLIST.length}).`)}</p>
        <button type="button" onClick={() => setPending({ op: 'setRealEnrollment', payload: { enabled: !config.realEnrollmentEnabled } })} className={`w-full min-h-[48px] rounded-xl font-semibold ${config.realEnrollmentEnabled ? 'border border-error text-error' : 'bg-secondary text-white'}`}>
          {config.realEnrollmentEnabled ? L('关闭真实入组', 'Disable real enrolment') : L('开启真实入组', 'Enable real enrolment')}
        </button>
      </Card>

      <Card title={L('研究参数', 'Study parameters')}>
        <div className="flex flex-col gap-3">
          <TextField label={L('伦理批件号', 'Ethics approval no.')} value={form.ethicsApprovalNo} onChange={set('ethicsApprovalNo')} />
          <TextField label={L('伦理批准日期', 'Ethics approval date')} type="date" value={form.ethicsApprovalDate} onChange={set('ethicsApprovalDate')} />
          <TextField label={L('知情同意书版本号', 'Consent form version')} value={form.consentVersion} onChange={set('consentVersion')} placeholder="V1.1 2026-10-20" />
          <TextField label={L('量表版本（含授权编号与日期）', 'Instrument version (licence no. & date)')} value={form.instrumentVersion} onChange={set('instrumentVersion')} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.instrumentLicensed} onChange={e => set('instrumentLicensed')(e.target.checked)} />{L('已取得 MDASI 中文版使用授权，正式条目文字已替换', 'MDASI-C licence obtained and licensed wording in place')}</label>
          <TextField label={L('量表语言', 'Instrument language')} value={form.instrumentLanguage} onChange={set('instrumentLanguage')} />
          <TextField label={L('预警规则版本', 'Alert rule version')} value={form.alertRuleVersion} onChange={set('alertRuleVersion')} hint={L('调整阈值时请同时改版本号，便于分析时划分暴露组', 'Change the version whenever thresholds change')} />
          <button type="button" onClick={() => setPending({ op: 'updateConfig', payload: form })} className="w-full min-h-[48px] rounded-xl bg-primary-container text-white font-semibold">{L('保存参数', 'Save parameters')}</button>
        </div>
      </Card>

      <Card title={L(`开放真实入组前的合规清单（${ticked}/${CHECKLIST.length}）`, `Pre-enrolment checklist (${ticked}/${CHECKLIST.length})`)}>
        <div className="flex flex-col gap-2">
          {CHECKLIST.map(c => {
            const done = config.checklist?.[c.key]
            return (
              <label key={c.key} className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={!!done} onChange={e => tick(c.key, e.target.checked)} />
                <span>
                  {c[locale]}
                  {done && <span className="block text-[11px] text-outline">{done.by} · {fmtTime(done.at, locale)}</span>}
                </span>
              </label>
            )
          })}
        </div>
      </Card>

      <Card title={L('数据库备份', 'Database backup')}>
        <p className="text-xs text-on-surface-variant mb-3">{L('服务器每天自动备份一次（保留 14 份，位于 data/backups）。重大操作前可手动备份。', 'The server backs up daily (keeps 14, in data/backups). Back up manually before major changes.')}</p>
        <button type="button" onClick={backup} className="w-full min-h-[44px] rounded-xl border border-secondary text-secondary font-semibold">{L('立即备份', 'Back up now')}</button>
      </Card>

      {pending && (
        <PasswordDialog
          title={L('请输入密码确认', 'Confirm with your password')}
          description={L('此操作将被记录在操作日志中。', 'This action is recorded in the audit log.')}
          onConfirm={run}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}
