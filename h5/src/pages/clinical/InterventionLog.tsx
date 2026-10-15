import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { ClinicalLayout } from '../../components/layout'
import { Icon } from '../../components/ui'
import { useStudy } from '../../study/useStudy'
import { useL } from '../../study/useL'
import { opErrorText } from '../../study/uiText'
import { fmtTime } from '../../study/logic'
import type { AlertActionType } from '../../study/types'

/** Records how a nurse responded to a symptom alert; response time = handledAt − completedAt. */
export default function InterventionLog() {
  const { tr, locale } = useApp()
  const { data, mutate } = useStudy()
  const L = useL()
  const { id, sid } = useParams()
  const navigate = useNavigate()
  const sub = data?.submissions.find(s => s.id === sid)

  const [type, setType] = useState<AlertActionType>('teleConsult')
  const [notes, setNotes] = useState('')
  const [followUp, setFollowUp] = useState(true)
  const [error, setError] = useState('')

  const types: { id: AlertActionType; label: string; icon: string }[] = [
    { id: 'teleConsult', label: L('电话/视频随访', 'Phone/video follow-up'), icon: 'call' },
    { id: 'adviceOnly', label: L('健康指导', 'Self-care advice'), icon: 'menu_book' },
    { id: 'medicationAdjust', label: L('通知医生调整用药', 'Doctor adjusted medication'), icon: 'medication' },
    { id: 'pathwayUpdate', label: L('建议返院/就医', 'Advised to return / seek care'), icon: 'local_hospital' },
  ]

  const handleSubmit = async () => {
    const res = await mutate('alertAction', { submissionId: sid, type, notes, followUp })
    if (res.ok) navigate('/clinical/intervention/success', { state: { patientId: id } })
    else setError(opErrorText(res.error, L))
  }

  return (
    <ClinicalLayout>
      <h1 className="text-xl font-bold text-on-surface mb-1">{L('预警处置记录', 'Alert response')}</h1>
      <p className="text-sm text-on-surface-variant mb-6">
        {id} · {sub ? `${sub.visitLabel} · ${L('预警触发', 'alert at')} ${fmtTime(sub.completedAt, locale)}` : ''}
      </p>

      <div className="bg-white rounded-xl p-5 border border-surface-variant flex flex-col gap-5 mb-6">
        <div>
          <label className="text-xs text-on-surface-variant block mb-3 font-semibold uppercase tracking-wider">{tr.interventionType}</label>
          <div className="flex flex-col gap-2">
            {types.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-colors min-h-[var(--spacing-touch-target-min)] ${
                  type === t.id ? 'border-secondary bg-secondary/5 text-secondary' : 'border-surface-variant bg-surface-container-low text-on-surface-variant'
                }`}
              >
                <Icon name={t.icon} className="text-xl" />
                <span className="font-medium">{t.label}</span>
                {type === t.id && <Icon name="check_circle" filled className="ml-auto text-secondary" />}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-on-surface-variant block mb-2 font-semibold uppercase tracking-wider">{tr.notes}</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full rounded-xl border border-surface-variant p-4 text-sm min-h-[120px] bg-surface-container-low resize-none"
            placeholder={locale === 'zh' ? '记录会诊要点、医嘱调整、患者反馈…' : 'Consult notes, orders, patient feedback…'}
          />
        </div>

        <button
          type="button"
          onClick={() => setFollowUp(f => !f)}
          className={`flex items-center gap-3 p-4 rounded-xl border text-left ${followUp ? 'border-primary bg-primary/5' : 'border-surface-variant'}`}
        >
          <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center ${followUp ? 'bg-primary border-primary' : 'border-outline-variant'}`}>
            {followUp && <Icon name="check" className="text-white text-sm" />}
          </div>
          <span className="text-sm font-medium text-on-surface">{tr.scheduleFollowUp}</span>
        </button>
      </div>

      {error && <p className="text-error text-sm mb-3">{error}</p>}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!notes.trim()}
        className="w-full min-h-[56px] rounded-xl bg-primary-container text-white font-semibold disabled:opacity-40 active:scale-[0.98]"
      >
        {tr.submitIntervention}
      </button>
    </ClinicalLayout>
  )
}
