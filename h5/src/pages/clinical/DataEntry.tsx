import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStudy } from '../../study/useStudy'
import { useL } from '../../study/useL'
import { ClinicalLayout } from '../../components/layout'
import { Card, ResponsesEditor, TextField, SyncBanner } from '../../components/study'
import { isComplete, opErrorText } from '../../study/uiText'
import { ITEMS, type Responses } from '../../study/instrument'
import { scheduledDate, windowStatus } from '../../study/logic'
import type { EntryMode, Filler, VisitLabel } from '../../study/types'

/** Nurse back-entry of a paper form or a phone interview. Every item must be set (a value or an explicit blank). */
export default function DataEntry() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { data, mutate } = useStudy()
  const L = useL()
  const cycleNo = Number(params.get('cycle'))
  const visitLabel = params.get('visit') as VisitLabel
  const p = data?.participants.find(x => x.id === id)
  const cycle = p?.cycles.find(c => c.cycleNo === cycleNo)

  const [mode, setMode] = useState<EntryMode>('paper')
  const [filler, setFiller] = useState<Filler>('self')
  const [date, setDate] = useState(() => (cycle ? scheduledDate(cycle, visitLabel) : ''))
  const [time, setTime] = useState('10:00')
  const [answers, setAnswers] = useState<Partial<Responses>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (!data || !p || !cycle) return <ClinicalLayout><SyncBanner /></ClinicalLayout>

  const completedAt = date && time ? new Date(`${date}T${time}:00+08:00`).toISOString() : ''
  const win = completedAt ? windowStatus(cycle, visitLabel, completedAt) : null
  const unset = ITEMS.filter(i => answers[i.id] === undefined).length

  const save = async () => {
    if (!isComplete(answers) || !completedAt) return
    setSaving(true)
    setError('')
    const res = await mutate('submit', { participantId: p.id, cycleNo, visitLabel, mode, filler, completedAt, responses: answers, durationSec: null })
    setSaving(false)
    if (res.ok) navigate(`/clinical/patient/${p.id}`, { replace: true })
    else setError(opErrorText(res.error, L))
  }

  return (
    <ClinicalLayout>
      <SyncBanner />
      <h1 className="text-xl font-bold mb-1">{L('录入问卷', 'Enter questionnaire')}</h1>
      <p className="text-sm text-on-surface-variant mb-4">{p.id} · {L(`第 ${cycleNo} 周期`, `Cycle ${cycleNo}`)} · {visitLabel}</p>

      <Card title={L('来源', 'Source')}>
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex gap-4">
            <label className="flex items-center gap-2"><input type="radio" checked={mode === 'paper'} onChange={() => setMode('paper')} />{L('纸质问卷', 'Paper form')}</label>
            <label className="flex items-center gap-2"><input type="radio" checked={mode === 'phone'} onChange={() => { setMode('phone'); setFiller('proxy') }} />{L('电话询问', 'Phone interview')}</label>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2"><input type="radio" checked={filler === 'self'} onChange={() => setFiller('self')} />{L('患者本人填写', 'Patient filled it')}</label>
            <label className="flex items-center gap-2"><input type="radio" checked={filler === 'proxy'} onChange={() => setFiller('proxy')} />{L('他人代填/代读', 'Proxy (read out / filled by someone else)')}</label>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <TextField label={mode === 'paper' ? L('纸质表上的填写日期', 'Date written on the form') : L('电话日期', 'Call date')} type="date" value={date} onChange={setDate} />
            <TextField label={L('时间（北京时间）', 'Time (Beijing)')} type="time" value={time} onChange={setTime} />
          </div>
          {win && (
            <p className={`text-xs ${win.status === 'in_window' ? 'text-risk-stable' : 'text-risk-elevated'}`}>
              {L(`化疗后第 ${win.dayOffset} 天 · `, `Day ${win.dayOffset} · `)}
              {win.status === 'in_window' ? L('在时间窗内', 'within window') : L('超出时间窗（数据保留，导出时标记）', 'outside window (kept, flagged in export)')}
            </p>
          )}
        </div>
      </Card>

      <p className="text-xs text-on-surface-variant mb-3">
        {L('照纸质表逐题录入。患者没有填的题请点“空”，不要填 0。', 'Copy each item from the form. If the patient left an item empty, tap “Blank” — do not enter 0.')}
      </p>
      <ResponsesEditor value={answers} onChange={setAnswers} />

      {error && <p className="text-error text-sm mt-4">{error}</p>}
      <button type="button" onClick={save} disabled={saving || unset > 0 || !completedAt} className="mt-6 mb-6 w-full min-h-[56px] rounded-xl bg-primary-container text-white font-semibold disabled:opacity-40">
        {unset > 0 ? L(`还有 ${unset} 题未录入`, `${unset} item(s) not entered`) : saving ? '…' : L('保存（之后需另一名护士核对）', 'Save (another nurse must double-check)')}
      </button>
    </ClinicalLayout>
  )
}
