import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useStudy } from '../../study/useStudy'
import { useL } from '../../study/useL'
import { useDraft, draftKey } from '../../study/useDraft'
import { ITEMS, itemLabel, itemPrompt, anchors, type Responses } from '../../study/instrument'
import { getCalmColor, getOrbColor } from '../../data/mock'
import type { EntryMode, Filler, VisitLabel } from '../../study/types'
import { Icon, GlassCard } from '../ui'
import { ScoreGrid } from '.'
import { opErrorText } from '../../study/uiText'

interface Draft {
  answers: Partial<Responses>
  step: number
  startedAt: string
  clientId: string
}

interface SurveyRunnerProps {
  participantId: string
  cycleNo: number
  visitLabel: VisitLabel
  mode: EntryMode
  filler: Filler
  onExit: () => void
  onDone: (info: { queued: boolean; responses: Responses }) => void
}

const REVIEW = ITEMS.length

function newDraft(): Draft {
  return { answers: {}, step: 0, startedAt: new Date().toISOString(), clientId: `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` }
}

/** One question per screen, large 0–10 buttons, skip allowed, autosaved after every tap. */
export default function SurveyRunner({ participantId, cycleNo, visitLabel, mode, filler, onExit, onDone }: SurveyRunnerProps) {
  const { locale } = useApp()
  const { submitSurvey } = useStudy()
  const L = useL()
  const draftStore = useDraft<Draft>(draftKey(participantId, cycleNo, visitLabel))
  const [fresh] = useState(newDraft)
  const [edited, setDraft] = useState<Draft | null>(null)
  const draft = edited ?? (draftStore.ready ? draftStore.restored ?? fresh : null)
  const [confirmMissing, setConfirmMissing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!draft) {
    return <div className="min-h-[100dvh] flex items-center justify-center text-on-surface-variant">{L('加载中…', 'Loading…')}</div>
  }

  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    draftStore.save(next)
  }

  const { step, answers } = draft
  const toFinal = (): Responses => Object.fromEntries(ITEMS.map(i => [i.id, answers[i.id] ?? null])) as Responses
  const missing = ITEMS.filter(i => answers[i.id] === null || answers[i.id] === undefined)

  const submit = async () => {
    if (missing.length && !confirmMissing) {
      setConfirmMissing(true)
      return
    }
    setSubmitting(true)
    setError('')
    const responses = toFinal()
    const res = await submitSurvey({
      participantId, cycleNo, visitLabel, mode, filler, responses,
      completedAt: new Date().toISOString(),
      durationSec: Math.round((Date.now() - Date.parse(draft.startedAt)) / 1000),
      clientId: draft.clientId,
    })
    setSubmitting(false)
    if (!res.ok) {
      setError(opErrorText(res.error, L))
      return
    }
    draftStore.clear()
    onDone({ queued: !!res.queued, responses })
  }

  if (step >= REVIEW) {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-calm-0">
        <header className="pt-6 px-6 pb-4">
          <button type="button" onClick={() => update({ step: REVIEW - 1 })} className="p-3 rounded-full bg-white/30 border border-white/50" aria-label={L('返回', 'Back')}>
            <Icon name="arrow_back" rounded className="text-xl" />
          </button>
          <h1 className="text-2xl font-bold text-on-surface mt-4">{L('请核对您的回答', 'Review your answers')}</h1>
          <p className="text-on-surface-variant text-sm mt-1">{L('点击任一题可以修改', 'Tap any question to change it')} · {visitLabel}</p>
        </header>
        <main className="flex-1 px-6 pb-6 overflow-y-auto flex flex-col gap-2">
          {missing.length > 0 && (
            <GlassCard className="p-4 border border-orange-200 text-sm text-risk-elevated">
              {L(`有 ${missing.length} 题未作答，可以返回补答，也可以直接提交。`, `${missing.length} question(s) unanswered. You can go back or submit as is.`)}
            </GlassCard>
          )}
          {ITEMS.map((item, i) => {
            const v = answers[item.id]
            return (
              <button key={item.id} type="button" onClick={() => update({ step: i })} className="glass-card rounded-2xl p-4 flex items-center gap-3 text-left">
                <span className="text-xs text-outline w-5">{item.order}</span>
                <Icon name={item.icon} className="text-primary text-xl" />
                <span className="flex-1 text-on-surface">{itemLabel(item, locale)}</span>
                <span className={`font-semibold text-lg ${v === null || v === undefined ? 'text-risk-elevated text-sm' : ''}`}>
                  {v === null || v === undefined ? L('未答', 'Skipped') : v}
                </span>
                <Icon name="edit" className="text-outline text-sm" />
              </button>
            )
          })}
        </main>
        <footer className="px-6 pb-10 flex flex-col gap-2">
          {error && <p className="text-error text-sm text-center">{error}</p>}
          <button type="button" disabled={submitting} onClick={submit} className="w-full min-h-[56px] rounded-2xl bg-primary-container text-white font-semibold text-lg shadow-lg disabled:opacity-50">
            {submitting ? L('提交中…', 'Submitting…') : confirmMissing ? L('确认提交（含未答题）', 'Submit with unanswered items') : L('确认并提交', 'Confirm & submit')}
          </button>
        </footer>
      </div>
    )
  }

  const item = ITEMS[step]
  const value = answers[item.id]
  const score = typeof value === 'number' ? value : 0
  const [lo, hi] = anchors(item.domain, locale)
  const firstOfPart2 = item.id === 'i1'
  const go = (nextAnswers: Partial<Responses>) => update({ answers: nextAnswers, step: step + 1 })

  return (
    <div className="min-h-[100dvh] flex flex-col transition-colors duration-700" style={{ backgroundColor: getCalmColor(score) }}>
      <header className="pt-6 px-6 pb-2">
        <div className="flex items-center justify-between mb-4">
          <button type="button" onClick={step === 0 ? onExit : () => update({ step: step - 1 })} className="p-3 rounded-full bg-white/30 border border-white/50" aria-label={L('返回', 'Back')}>
            <Icon name={step === 0 ? 'close' : 'arrow_back'} rounded className="text-xl" />
          </button>
          <span className="text-xs font-semibold tracking-widest text-on-surface-variant bg-white/40 px-4 py-2 rounded-full border border-white/50">
            {step + 1} / {ITEMS.length}
          </span>
          <div className="w-11" />
        </div>
        <div className="h-1.5 bg-white/40 rounded-full overflow-hidden">
          <div className="h-full bg-primary-container transition-all duration-500 rounded-full" style={{ width: `${((step + 1) / ITEMS.length) * 100}%` }} />
        </div>
        <p className="mt-3 text-xs font-semibold text-on-surface-variant">
          {item.domain === 'symptom' ? L('第一部分：症状有多严重', 'Part 1: How severe are your symptoms') : L('第二部分：症状对生活的影响', 'Part 2: How symptoms affect your life')}
        </p>
      </header>

      <main className="flex-1 px-6 flex flex-col items-center justify-center">
        <div className="w-full max-w-sm flex flex-col items-center">
          {firstOfPart2 && (
            <p className="mb-4 text-sm text-secondary bg-white/60 rounded-xl px-4 py-2 text-center">{L('下面 6 题问的是症状对您生活的影响', 'The next 6 questions are about how symptoms affected your life')}</p>
          )}
          <div className="relative w-28 h-28 mb-6 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full blur-[30px] opacity-40" style={{ backgroundColor: getOrbColor(score) }} />
            <div className="absolute inset-2 rounded-full bg-white/70 border border-white/60 flex items-center justify-center shadow">
              <Icon name={item.icon} rounded className="text-5xl" style={{ color: getOrbColor(score) }} />
            </div>
          </div>
          <h2 className="text-[22px] leading-snug font-semibold text-on-surface text-center mb-2">{itemPrompt(item, locale)}</h2>
          <div className="flex justify-between w-full text-xs text-on-surface-variant mb-3 mt-2">
            <span>{lo}</span><span>{hi}</span>
          </div>
          <div className="w-full">
            <ScoreGrid value={value} onChange={n => n !== null && update({ answers: { ...answers, [item.id]: n } })} />
          </div>
        </div>
      </main>

      <footer className="px-6 pb-10 pt-4 flex gap-3">
        <button type="button" onClick={() => go({ ...answers, [item.id]: null })} className="flex-1 min-h-[56px] rounded-2xl border-2 border-white/80 bg-white/40 text-on-surface-variant font-medium">
          {L('跳过此题', 'Skip')}
        </button>
        <button type="button" disabled={typeof value !== 'number'} onClick={() => go(answers)} className="flex-[2] min-h-[56px] rounded-2xl bg-primary-container text-white font-semibold text-lg shadow-lg disabled:opacity-40">
          {step === REVIEW - 1 ? L('查看全部', 'Review') : L('下一题', 'Next')}
        </button>
      </footer>
    </div>
  )
}
