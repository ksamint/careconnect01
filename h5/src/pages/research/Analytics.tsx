import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useStudy } from '../../study/useStudy'
import { useL } from '../../study/useL'
import { ResearchLayout } from '../../components/layout'
import { Icon } from '../../components/ui'
import { SyncBanner } from '../../components/study'
import { cohortMetrics } from '../../study/export'
import { currentResponses, VISITS } from '../../study/logic'
import { SYMPTOM_ITEMS, itemLabel } from '../../study/instrument'

const TARGET_MIN = 190
const TARGET = 300

export default function Analytics() {
  const { tr, locale, logout } = useApp()
  const { data } = useStudy()
  const L = useL()
  const navigate = useNavigate()
  const [includeDemo, setIncludeDemo] = useState(true)

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  if (!data) return <ResearchLayout><SyncBanner /></ResearchLayout>

  const m = cohortMetrics(data, includeDemo)
  const ids = new Set(data.participants.filter(p => includeDemo || !p.synthetic).map(p => p.id))
  const subs = data.submissions.filter(s => ids.has(s.participantId))
  const meanBy = (label: string, itemId: string) => {
    const vals = subs.filter(s => s.visitLabel === label).map(s => currentResponses(data, s)[itemId as 's1']).filter((v): v is number => typeof v === 'number')
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null
  }
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0)

  const tiles: [string, string, string][] = [
    [L('已入组', 'Enrolled'), String(m.participants), L(`下限 ${TARGET_MIN} · 目标 ${TARGET}`, `min ${TARGET_MIN} · target ${TARGET}`)],
    [L('随访完成率', 'Visit completion'), m.expected ? `${pct(m.done, m.expected)}%` : '—', L(`${m.done}/${m.expected} 个已到期时点`, `${m.done}/${m.expected} closed visits`)],
    [L('时间窗内比例', 'Within window'), m.inWindowPct === null ? '—' : `${m.inWindowPct}%`, L('已提交问卷中', 'of submissions')],
    [L('条目缺失率', 'Item missing rate'), m.itemMissingPct === null ? '—' : `${m.itemMissingPct}%`, L('未作答条目 / 全部条目', 'blank items / all items')],
    [L('今日待随访', 'Due today'), String(m.due), L(`已超窗未填 ${m.overdue} · 记缺失 ${m.missed}`, `${m.overdue} overdue · ${m.missed} missed`)],
    [L('预警响应中位时长', 'Median alert response'), m.medianResponseMin === null ? '—' : L(`${m.medianResponseMin} 分钟`, `${m.medianResponseMin} min`), L('仅电子填写', 'electronic only')],
  ]

  return (
    <ResearchLayout>
      <SyncBanner />
      <label className="flex items-center gap-2 text-sm mb-4">
        <input type="checkbox" checked={includeDemo} onChange={e => setIncludeDemo(e.target.checked)} />
        {L('包含演示/培训数据', 'Include demo/training data')}
      </label>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="bg-white rounded-xl p-4 border border-surface-variant shadow-sm">
            <span className="text-xs text-on-surface-variant">{label}</span>
            <p className="text-2xl font-bold text-primary mt-1">{value}</p>
            <span className="text-[11px] text-outline">{sub}</span>
          </div>
        ))}
      </div>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3">{L('入组进度', 'Enrolment progress')}</h2>
        <div className="bg-white rounded-xl p-4 border border-surface-variant">
          <div className="relative h-3 bg-surface-container rounded-full overflow-hidden">
            <div className="h-full bg-primary-container" style={{ width: `${Math.min(100, (m.participants / TARGET) * 100)}%` }} />
            <div className="absolute top-0 bottom-0 w-0.5 bg-on-surface" style={{ left: `${(TARGET_MIN / TARGET) * 100}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-outline mt-1">
            <span>0</span><span>{TARGET_MIN} {L('下限', 'min')}</span><span>{TARGET}</span>
          </div>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3">{L('各症状均分：T0 → T1 → T2', 'Symptom means: T0 → T1 → T2')}</h2>
        <div className="bg-white rounded-xl p-4 border border-surface-variant overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-on-surface-variant">
                <th className="text-left font-medium py-1">{L('症状', 'Symptom')}</th>
                {VISITS.map(v => <th key={v.label} className="font-medium w-14 text-right">{v.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {SYMPTOM_ITEMS.map(it => (
                <tr key={it.id} className="border-t border-surface-container">
                  <td className="py-1.5 text-on-surface">{itemLabel(it, locale)}</td>
                  {VISITS.map(v => {
                    const val = meanBy(v.label, it.id)
                    return <td key={v.label} className={`text-right tabular-nums ${val !== null && val >= 4 ? 'text-risk-elevated font-semibold' : ''}`}>{val ?? '—'}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-outline mt-2">{L('描述性统计，供监测数据质量用；正式分析请导出后在 R 中进行。', 'Descriptive monitoring only; run the formal analysis in R on the export.')}</p>
        </div>
      </section>

      <button type="button" onClick={() => navigate('/research/export')} className="w-full min-h-[56px] rounded-xl bg-primary-container text-white font-semibold flex items-center justify-center gap-2 shadow-md mb-4">
        <Icon name="download" className="text-xl" />
        {tr.exportTitle}
      </button>
      <button type="button" onClick={handleLogout} className="w-full min-h-[48px] rounded-xl border border-outline-variant text-sm font-medium text-on-surface-variant">
        {tr.logout}
      </button>
    </ResearchLayout>
  )
}
