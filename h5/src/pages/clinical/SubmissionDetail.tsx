import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useStudy } from '../../study/useStudy'
import { useL } from '../../study/useL'
import { ClinicalLayout } from '../../components/layout'
import { Icon, RiskBadge } from '../../components/ui'
import { Card, PasswordDialog, ResponsesEditor, SyncBanner } from '../../components/study'
import { isComplete, opErrorText } from '../../study/uiText'
import { ITEMS, itemLabel, type Responses } from '../../study/instrument'
import { EDIT_REASONS } from '../../study/options'
import {
  currentResponses, alertLevel, symptomMean, interferenceMean, countMissing, windowStatus, fmtTime,
} from '../../study/logic'

type Mode = 'view' | 'edit' | 'verify'
const riskOf = { high: 'critical', medium: 'elevated', none: 'stable' } as const

export default function SubmissionDetail() {
  const { id, sid } = useParams()
  const { locale, user } = useApp()
  const { data, mutate } = useStudy()
  const L = useL()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('view')
  const [askPassword, setAskPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [draft, setDraft] = useState<Partial<Responses>>({})
  const [reason, setReason] = useState('')
  const [reasonText, setReasonText] = useState('')
  const [flagged, setFlagged] = useState<string[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const sub = data?.submissions.find(s => s.id === sid)
  const p = data?.participants.find(x => x.id === id)
  const cycle = p?.cycles.find(c => c.cycleNo === sub?.cycleNo)
  if (!data || !sub || !p || !cycle) return <ClinicalLayout><SyncBanner /></ClinicalLayout>

  const current = currentResponses(data, sub)
  const revisions = data.revisions.filter(r => r.submissionId === sub.id).sort((a, b) => (a.editedAt < b.editedAt ? 1 : -1))
  const win = windowStatus(cycle, sub.visitLabel, sub.completedAt)
  const level = alertLevel(current)
  const actions = data.alertActions.filter(a => a.submissionId === sub.id)
  const lastEditor = revisions[0]?.editedBy ?? sub.enteredBy
  const canVerify = sub.mode !== 'electronic' && !sub.verification && user?.username !== sub.enteredBy && user?.username !== lastEditor

  const startEdit = (pw: string) => {
    setPassword(pw)
    setAskPassword(false)
    setDraft({ ...current })
    setMode('edit')
    setMsg(null)
  }

  const saveEdit = async () => {
    if (!isComplete(draft)) return
    const why = reason === 'other' ? reasonText.trim() : EDIT_REASONS.find(r => r.code === reason)?.zh ?? ''
    setSaving(true)
    const res = await mutate<{ changes: unknown[] }>('revise', { submissionId: sub.id, responses: draft, reason: why }, password)
    setSaving(false)
    if (res.ok) {
      setMode('view')
      setPassword('')
      setReason('')
      setReasonText('')
      setMsg({ ok: true, text: L('已保存修改，原始记录保留在历史中。', 'Saved. The original stays in the history.') })
    } else {
      setMsg({ ok: false, text: opErrorText(res.error, L) })
    }
  }

  const saveVerify = async () => {
    if (!isComplete(draft)) return
    setSaving(true)
    const res = await mutate<{ verified: boolean; mismatches: string[] }>('verify', { submissionId: sub.id, responses: draft })
    setSaving(false)
    if (!res.ok) {
      setMsg({ ok: false, text: opErrorText(res.error, L) })
    } else if (res.result.verified) {
      setMode('view')
      setFlagged([])
      setMsg({ ok: true, text: L('核对一致，已标记为“已核对”。', 'Match — marked as verified.') })
    } else {
      setFlagged(res.result.mismatches)
      setMsg({ ok: false, text: L(`有 ${res.result.mismatches.length} 题与第一次录入不一致（已标红）。请对照纸质表：若是您录错，改正后再提交；若是第一次录错，请用“修改”更正。`, `${res.result.mismatches.length} item(s) differ from the first entry (in red). Check the paper form: fix your entry, or correct the record via Edit.`) })
    }
  }

  const label = (itemId: string) => {
    const it = ITEMS.find(i => i.id === itemId)
    return it ? `${it.order}. ${itemLabel(it, locale)}` : itemId
  }

  return (
    <ClinicalLayout>
      <SyncBanner />
      <div className="bg-white rounded-2xl p-4 border border-surface-variant shadow-sm mb-4">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-bold">{p.id} · {L(`第 ${sub.cycleNo} 周期`, `Cycle ${sub.cycleNo}`)} · {sub.visitLabel}</h1>
          <RiskBadge level={riskOf[level]} />
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-on-surface-variant">
          <dt>{L('填写时间', 'Completed')}</dt><dd className="text-on-surface">{fmtTime(sub.completedAt, locale)}</dd>
          <dt>{L('时间窗', 'Window')}</dt><dd className={win.status === 'in_window' ? 'text-risk-stable' : 'text-risk-elevated'}>{L(`第 ${win.dayOffset} 天`, `Day ${win.dayOffset}`)} · {win.status === 'in_window' ? L('窗内', 'in') : L('超窗', 'out')}</dd>
          <dt>{L('方式', 'Mode')}</dt><dd className="text-on-surface">{{ electronic: L('电子', 'Electronic'), paper: L('纸质', 'Paper'), phone: L('电话', 'Phone') }[sub.mode]} · {sub.filler === 'self' ? L('本人', 'self') : L('代填', 'proxy')}</dd>
          <dt>{L('录入人', 'Entered by')}</dt><dd className="text-on-surface">{sub.enteredBy} · {fmtTime(sub.enteredAt, locale)}</dd>
          <dt>{L('症状均分 / 干扰均分', 'Symptom / interference mean')}</dt><dd className="text-on-surface">{symptomMean(current) ?? '—'} / {interferenceMean(current) ?? '—'}</dd>
          <dt>{L('未答题数', 'Blank items')}</dt><dd className="text-on-surface">{countMissing(current)}</dd>
          {sub.mode !== 'electronic' && (<><dt>{L('双人核对', 'Double-check')}</dt><dd className={sub.verification ? 'text-risk-stable' : 'text-risk-elevated'}>{sub.verification ? `${sub.verification.by} · ${fmtTime(sub.verification.at, locale)}` : L('未核对', 'Not yet')}</dd></>)}
        </dl>
      </div>

      {msg && <p className={`text-sm mb-4 rounded-xl px-3 py-2 ${msg.ok ? 'bg-green-50 text-risk-stable' : 'bg-orange-50 text-risk-elevated'}`}>{msg.text}</p>}

      {mode === 'view' && (
        <>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button type="button" onClick={() => setAskPassword(true)} className="min-h-[48px] rounded-xl bg-secondary text-white font-semibold flex items-center justify-center gap-1">
              <Icon name="lock" className="text-lg" />{L('修改答案', 'Edit answers')}
            </button>
            {canVerify ? (
              <button type="button" onClick={() => { setDraft({}); setFlagged([]); setMode('verify'); setMsg(null) }} className="min-h-[48px] rounded-xl border-2 border-secondary text-secondary font-semibold">
                {L('双人核对录入', 'Double-entry check')}
              </button>
            ) : level !== 'none' ? (
              <button type="button" onClick={() => navigate(`/clinical/patient/${p.id}/submission/${sub.id}/action`)} className="min-h-[48px] rounded-xl border-2 border-risk-critical text-risk-critical font-semibold">
                {L('记录预警处置', 'Log alert response')}
              </button>
            ) : <span />}
          </div>

          <Card title={L('当前答案', 'Current answers')}>
            <div className="grid grid-cols-1 gap-1 text-sm">
              {ITEMS.map(it => (
                <div key={it.id} className="flex justify-between border-b border-surface-container py-1">
                  <span className="text-on-surface-variant">{label(it.id)}</span>
                  <span className={`font-semibold ${current[it.id] === null ? 'text-outline' : (current[it.id] as number) >= 7 && it.domain === 'symptom' ? 'text-risk-critical' : ''}`}>
                    {current[it.id] ?? L('空', 'blank')}
                    {revisions.length > 0 && sub.responses[it.id] !== current[it.id] && <span className="text-xs text-tertiary ml-1">({L('原', 'was')} {sub.responses[it.id] ?? L('空', 'blank')})</span>}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {actions.length > 0 && (
            <Card title={L('预警处置记录', 'Alert responses')}>
              {actions.map(a => (
                <p key={a.id} className="text-sm mb-1">{fmtTime(a.handledAt, locale)} · {a.handledBy} · {a.notes}</p>
              ))}
            </Card>
          )}

          <Card title={L('修改历史', 'Change history')}>
            {revisions.length === 0 && <p className="text-sm text-outline">{L('无修改', 'No changes')}</p>}
            {revisions.map((r, idx) => {
              const before = revisions[idx + 1]?.responses ?? sub.responses
              const changed = ITEMS.filter(i => before[i.id] !== r.responses[i.id])
              return (
                <div key={r.id} className="text-sm border-b border-surface-container py-2">
                  <p className="font-medium">{fmtTime(r.editedAt, locale)} · {r.editedBy}</p>
                  <p className="text-on-surface-variant">{L('原因', 'Reason')}: {r.reason}</p>
                  <p className="text-xs text-outline">{changed.map(i => `${label(i.id)}: ${before[i.id] ?? '空'}→${r.responses[i.id] ?? '空'}`).join('；')}</p>
                </div>
              )
            })}
            <p className="text-xs text-outline mt-2">{L('原始提交永久保留，不可删除或覆盖。', 'The original submission is kept permanently and cannot be overwritten.')}</p>
          </Card>
        </>
      )}

      {mode === 'edit' && (
        <>
          <ResponsesEditor value={draft} onChange={setDraft} previous={current} />
          <Card title={L('修改原因（必填）', 'Reason for change (required)')}>
            <div className="flex flex-col gap-2 text-sm">
              {EDIT_REASONS.map(r => (
                <label key={r.code} className="flex items-center gap-2"><input type="radio" checked={reason === r.code} onChange={() => setReason(r.code)} />{r[locale]}</label>
              ))}
              {reason === 'other' && <input value={reasonText} onChange={e => setReasonText(e.target.value)} className="h-10 px-3 rounded-lg border border-outline-variant" placeholder={L('请说明', 'Explain')} />}
            </div>
          </Card>
          <div className="flex gap-2 mb-6">
            <button type="button" onClick={() => { setMode('view'); setPassword('') }} className="flex-1 min-h-[52px] rounded-xl border border-outline-variant">{L('取消', 'Cancel')}</button>
            <button type="button" onClick={saveEdit} disabled={saving || !reason || (reason === 'other' && !reasonText.trim())} className="flex-[2] min-h-[52px] rounded-xl bg-secondary text-white font-semibold disabled:opacity-40">{saving ? '…' : L('保存修改', 'Save changes')}</button>
          </div>
        </>
      )}

      {mode === 'verify' && (
        <>
          <p className="text-sm text-on-surface-variant mb-3">{L('请不看系统里的数值，直接对照纸质表重新录入全部 19 题，系统会自动比对。', 'Without looking at the stored values, re-enter all 19 items from the paper form; the system compares them.')}</p>
          <ResponsesEditor value={draft} onChange={setDraft} flagged={flagged} />
          <div className="flex gap-2 my-6">
            <button type="button" onClick={() => setMode('view')} className="flex-1 min-h-[52px] rounded-xl border border-outline-variant">{L('取消', 'Cancel')}</button>
            <button type="button" onClick={saveVerify} disabled={saving || !isComplete(draft)} className="flex-[2] min-h-[52px] rounded-xl bg-secondary text-white font-semibold disabled:opacity-40">{saving ? '…' : L('提交比对', 'Compare')}</button>
          </div>
        </>
      )}

      {askPassword && (
        <PasswordDialog
          title={L('修改患者答案需验证密码', 'Password required to edit answers')}
          description={L('修改会被记录（谁、何时、原因），原始答案永久保留。', 'Every change is logged (who, when, why); the original is kept.')}
          onConfirm={startEdit}
          onCancel={() => setAskPassword(false)}
        />
      )}
    </ClinicalLayout>
  )
}
