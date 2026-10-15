import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useStudy } from '../../study/useStudy'
import { useL } from '../../study/useL'
import { ClinicalLayout } from '../../components/layout'
import { Icon, RiskBadge } from '../../components/ui'
import { Card, SyncBanner, VisitStatusPill } from '../../components/study'
import { opErrorText } from '../../study/uiText'
import {
  allVisitStates, currentResponses, alertLevel, displayMean, countMissing, crfCompleteness, rdi,
  MAX_CONTACTS_BEFORE_MISSING, fmtTime, type VisitState,
} from '../../study/logic'
import { MISSED_REASONS, optionLabel } from '../../study/options'
import type { ContactChannel } from '../../study/types'

const riskOf = { high: 'critical', medium: 'elevated', none: 'stable' } as const

type Dialog = { kind: 'contact' | 'missed'; visit: VisitState } | null

export default function PatientProfile() {
  const { locale } = useApp()
  const { data, mutate } = useStudy()
  const L = useL()
  const { id } = useParams()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [channel, setChannel] = useState<ContactChannel>('push_am')
  const [reached, setReached] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonText, setReasonText] = useState('')
  const [msg, setMsg] = useState('')
  const [login, setLogin] = useState<{ username: string; password: string } | null>(null)

  const p = data?.participants.find(x => x.id === id)
  if (!data || !p) return <ClinicalLayout><SyncBanner /><p className="text-center py-8 text-on-surface-variant">{data ? L('未找到该患者', 'Participant not found') : L('加载中…', 'Loading…')}</p></ClinicalLayout>

  const visits = allVisitStates(data, p)
  const crf = crfCompleteness(p)
  const base = `/clinical/patient/${p.id}`

  const closeDialog = () => { setDialog(null); setReason(''); setReasonText(''); setReached(false) }

  const saveDialog = async () => {
    if (!dialog) return
    const v = dialog.visit
    const common = { participantId: p.id, cycleNo: v.cycle.cycleNo, visitLabel: v.def.label }
    const res = dialog.kind === 'contact'
      ? await mutate('contact', { ...common, channel, reached })
      : await mutate('markMissed', { ...common, reason: reason === 'other' ? reasonText : MISSED_REASONS.find(r => r.code === reason)?.zh })
    setMsg(res.ok ? L('已保存', 'Saved') : opErrorText(res.error, L))
    if (res.ok) closeDialog()
  }

  const resetLogin = async () => {
    const res = await mutate<{ login: { username: string; password: string } }>('resetPatientLogin', { participantId: p.id })
    if (res.ok) setLogin(res.result.login)
    else setMsg(opErrorText(res.error, L))
  }

  return (
    <ClinicalLayout>
      <SyncBanner />
      <div className="bg-white rounded-2xl p-5 border border-surface-variant shadow-sm mb-4">
        <div className="flex items-start justify-between mb-3 gap-2">
          <div>
            <h1 className="text-xl font-bold text-on-surface">{p.id}</h1>
            <p className="text-sm text-outline mt-0.5">
              {p.alias || '—'} · {p.synthetic ? L('演示/培训', 'Demo/training') : L('正式', 'Real')} · {L('同意书', 'Consent')} {p.consentVersion || '—'}
            </p>
          </div>
          {p.status === 'withdrawn' ? <span className="text-xs font-semibold text-outline border rounded-full px-2 py-1">{L('已退出', 'Withdrawn')}</span> : null}
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <button type="button" onClick={() => navigate(`${base}/crf`)} className="rounded-xl border border-surface-variant p-3 text-left">
            <span className="text-xs text-on-surface-variant block">{L('基线资料（CRF）', 'Baseline CRF')}</span>
            <span className={`font-semibold ${crf.demographics < 100 || crf.clinical < 100 ? 'text-risk-elevated' : 'text-risk-stable'}`}>
              {L('人口学', 'Demo')} {crf.demographics}% · {L('临床', 'Clin')} {crf.clinical}%
            </span>
          </button>
          <button type="button" onClick={resetLogin} className="rounded-xl border border-surface-variant p-3 text-left">
            <span className="text-xs text-on-surface-variant block">{L('患者登录账号', 'Patient login')}</span>
            <span className="font-semibold">{p.username || L('未开通（点此开通）', 'None (tap to create)')}</span>
          </button>
        </div>
        {login && (
          <div className="mt-3 rounded-xl bg-primary/5 border border-primary/20 p-3 text-sm">
            <p className="font-semibold text-primary mb-1">{L('请把以下账号交给患者（只显示这一次）', 'Give this login to the patient (shown once)')}</p>
            <p>{L('账号', 'Username')}: <b className="font-mono">{login.username}</b> · {L('密码', 'Password')}: <b className="font-mono">{login.password}</b></p>
          </div>
        )}
        {msg && <p className="mt-2 text-sm text-on-surface-variant">{msg}</p>}
      </div>

      {[...p.cycles].sort((a, b) => b.cycleNo - a.cycleNo).map(cycle => {
        const r = rdi(cycle)
        return (
          <Card
            key={cycle.cycleNo}
            title={L(`第 ${cycle.cycleNo} 周期 · 输注 ${cycle.infusionDate}`, `Cycle ${cycle.cycleNo} · infusion ${cycle.infusionDate}`)}
            action={<button type="button" onClick={() => navigate(`${base}/crf#cycles`)} className="text-xs text-secondary font-semibold">{L('结局', 'Outcome')}</button>}
          >
            <div className="flex flex-col gap-3">
              {visits.filter(v => v.cycle.cycleNo === cycle.cycleNo).map(v => {
                const sub = v.submission
                const resp = sub ? currentResponses(data, sub) : null
                const level = resp ? alertLevel(resp) : 'none'
                const q = `cycle=${cycle.cycleNo}&visit=${v.def.label}`
                return (
                  <div key={v.def.label} className="rounded-xl border border-surface-variant p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-on-surface">{v.def.label}</span>
                        <VisitStatusPill status={v.status} />
                        {resp && level !== 'none' && <RiskBadge level={riskOf[level]} />}
                      </div>
                      <span className="text-xs text-outline">{L('计划', 'Plan')} {v.scheduled}</span>
                    </div>
                    {sub && resp ? (
                      <button type="button" onClick={() => navigate(`${base}/submission/${sub.id}`)} className="w-full text-left text-sm text-on-surface-variant flex items-center justify-between">
                        <span>
                          {fmtTime(sub.completedAt, locale)} · {L('均分', 'mean')} {displayMean(resp) ?? '—'}
                          {countMissing(resp) ? L(` · ${countMissing(resp)} 题空`, ` · ${countMissing(resp)} blank`) : ''}
                          {sub.mode !== 'electronic' && !sub.verification ? L(' · 待核对', ' · to verify') : ''}
                        </span>
                        <Icon name="chevron_right" className="text-outline" />
                      </button>
                    ) : v.status !== 'missed' && p.status === 'active' ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => navigate(`${base}/fill?${q}`)} className="flex-1 min-h-[40px] rounded-lg bg-primary-container text-white text-sm font-semibold">{L('现场填写', 'Fill on device')}</button>
                          <button type="button" onClick={() => navigate(`${base}/entry?${q}`)} className="flex-1 min-h-[40px] rounded-lg border border-secondary text-secondary text-sm font-semibold">{L('录入纸质/电话', 'Enter paper/phone')}</button>
                        </div>
                        <div className="flex gap-2 text-xs">
                          <button type="button" onClick={() => setDialog({ kind: 'contact', visit: v })} className="flex-1 min-h-[36px] rounded-lg border border-surface-variant">
                            {L(`记录提醒（已 ${v.contacts} 次）`, `Log reminder (${v.contacts} so far)`)}
                          </button>
                          {(v.status === 'overdue' || v.contacts >= MAX_CONTACTS_BEFORE_MISSING) && (
                            <button type="button" onClick={() => setDialog({ kind: 'missed', visit: v })} className="flex-1 min-h-[36px] rounded-lg border border-outline-variant text-on-surface-variant">{L('记为缺失', 'Mark missed')}</button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-outline">{data.missedVisits.find(m => m.participantId === p.id && m.cycleNo === cycle.cycleNo && m.visitLabel === v.def.label)?.reason}</p>
                    )}
                  </div>
                )
              })}
              <p className="text-xs text-on-surface-variant">
                {L('非计划就诊', 'Unplanned visit')}: {cycle.outcome.unplannedVisit ? optionLabel('yesNo', cycle.outcome.unplannedVisit, locale) : L('未填', 'not set')}
                {' · '}RDI: {r ?? L('未填', 'not set')}
              </p>
            </div>
          </Card>
        )
      })}

      {dialog && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-xl flex flex-col gap-3">
            <h2 className="text-lg font-bold">
              {dialog.kind === 'contact' ? L('记录一次提醒', 'Log a reminder') : L('记为缺失', 'Mark as missed')} · {dialog.visit.def.label}
            </h2>
            {dialog.kind === 'contact' ? (
              <>
                {([['push_am', L('上午 9 点推送', '9am message')], ['push_pm', L('晚间补推', 'Evening re-send')], ['phone', L('次日电话', 'Next-day phone call')]] as const).map(([c, label]) => (
                  <label key={c} className="flex items-center gap-2 text-sm"><input type="radio" checked={channel === c} onChange={() => setChannel(c)} /> {label}</label>
                ))}
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reached} onChange={e => setReached(e.target.checked)} /> {L('已联系上患者', 'Reached the patient')}</label>
              </>
            ) : (
              <>
                {MISSED_REASONS.map(r => (
                  <label key={r.code} className="flex items-center gap-2 text-sm"><input type="radio" checked={reason === r.code} onChange={() => setReason(r.code)} /> {r[locale]}</label>
                ))}
                {reason === 'other' && <input value={reasonText} onChange={e => setReasonText(e.target.value)} className="h-10 px-3 rounded-lg border border-outline-variant" placeholder={L('请说明', 'Explain')} />}
              </>
            )}
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={closeDialog} className="flex-1 min-h-[44px] rounded-xl border border-outline-variant">{L('取消', 'Cancel')}</button>
              <button type="button" onClick={saveDialog} disabled={dialog.kind === 'missed' && (!reason || (reason === 'other' && !reasonText.trim()))} className="flex-1 min-h-[44px] rounded-xl bg-secondary text-white font-semibold disabled:opacity-40">{L('保存', 'Save')}</button>
            </div>
          </div>
        </div>
      )}
    </ClinicalLayout>
  )
}
