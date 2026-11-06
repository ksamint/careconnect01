import { isAdmin } from '../../auth'
import { opErrorText } from '../../study/uiText'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useStudy } from '../../study/useStudy'
import { useL } from '../../study/useL'
import { ClinicalLayout } from '../../components/layout'
import { Icon, RiskBadge } from '../../components/ui'
import { SyncBanner, VisitStatusPill } from '../../components/study'
import { allVisitStates, latestSubmission, currentResponses, alertLevel, VISITS, visitState } from '../../study/logic'
import type { Participant, StudyData } from '../../study/types'

type Filter = 'all' | 'today' | 'alerts' | 'verify'

const riskOf = { high: 'critical', medium: 'elevated', none: 'stable' } as const

function summarize(data: StudyData, p: Participant) {
  const states = allVisitStates(data, p)
  const last = latestSubmission(data, p.id)
  const level = last ? alertLevel(currentResponses(data, last)) : 'none'
  const unhandled = !!last && level !== 'none' && last.mode === 'electronic' && !data.alertActions.some(a => a.submissionId === last.id)
  const toVerify = data.submissions.filter(s => s.participantId === p.id && s.mode !== 'electronic' && !s.verification).length
  return {
    level,
    unhandled,
    toVerify,
    due: states.filter(s => s.status === 'due').length,
    overdue: states.filter(s => s.status === 'overdue').length,
  }
}

export default function CohortDashboard() {
  const { tr, logout, user } = useApp()
  const { data, mutate } = useStudy()
  const [archiveMessage, setArchiveMessage] = useState('')
  const [restoring, setRestoring] = useState(false)
  const L = useL()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  if (!data) return <ClinicalLayout><SyncBanner /><p className="text-center text-on-surface-variant py-8">{L('加载中…', 'Loading…')}</p></ClinicalLayout>

  const active = data.participants.filter(p => p.status === 'active')
  const rows = active.map(p => ({ p, s: summarize(data, p) }))
  const counts = {
    all: rows.length,
    today: rows.filter(r => r.s.due || r.s.overdue).length,
    alerts: rows.filter(r => r.s.unhandled).length,
    verify: rows.filter(r => r.s.toVerify).length,
  }
  const filtered = rows
    .filter(r => filter === 'all'
      || (filter === 'today' && (r.s.due || r.s.overdue))
      || (filter === 'alerts' && r.s.unhandled)
      || (filter === 'verify' && r.s.toVerify))
    .filter(r => !query || [r.p.id, r.p.alias, r.p.identity?.name, r.p.identity?.phone].some(value => value?.toLowerCase().includes(query.trim().toLowerCase())))
    .sort((a, b) => Number(b.s.unhandled) - Number(a.s.unhandled) || b.s.overdue - a.s.overdue || a.p.id.localeCompare(b.p.id))

  const filters: { id: Filter; label: string }[] = [
    { id: 'today', label: L('今日待随访', 'Due today') },
    { id: 'alerts', label: L('待处置预警', 'Open alerts') },
    { id: 'verify', label: L('待双人核对', 'To double-check') },
    { id: 'all', label: L('全部', 'All') },
  ]

  return (
    <ClinicalLayout>
      <SyncBanner />
      {user && isAdmin(user.role) && <details className="bg-white border rounded-2xl p-4 mb-4">
        <summary className="cursor-pointer min-h-[44px] font-semibold">{L('已隐藏患者（管理员可恢复）', 'Hidden patients (admin restore)')} · {data.hiddenParticipants?.length ?? 0}</summary>
        <p className="text-sm text-outline my-2">{L('原始数据均保留；恢复后重新显示，原有退出研究状态不变。', 'Original data is retained. Restore returns the record to view without changing withdrawal status.')}</p>
        {data.hiddenParticipants?.map(p => <div key={p.id} className="border-t py-3 flex justify-between items-center gap-3"><div><b>{p.id}</b><p className="text-sm">{p.hiddenReason}</p><p className="text-xs text-outline">{p.hiddenAt}</p></div><button disabled={restoring} className="min-h-[44px] px-4 rounded-xl border disabled:opacity-40" onClick={async () => {
          setRestoring(true)
          const res = await mutate('restoreParticipant', { participantId: p.id })
          setRestoring(false)
          setArchiveMessage(res.ok ? L('已恢复患者', 'Participant restored') : opErrorText(res.error, L))
        }}>{L('恢复', 'Restore')}</button></div>)}
        {archiveMessage && <p role="status">{archiveMessage}</p>}
      </details>}
      <section className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-surface-variant grid grid-cols-4 gap-2 mb-4 text-center">
        {[
          [L('在组', 'Active'), counts.all, 'text-primary'],
          [L('今日随访', 'Due'), counts.today, 'text-secondary'],
          [L('预警', 'Alerts'), counts.alerts, 'text-risk-critical'],
          [L('待核对', 'Verify'), counts.verify, 'text-risk-elevated'],
        ].map(([label, n, cls]) => (
          <div key={label as string} className="flex flex-col">
            <span className="text-xs text-on-surface-variant">{label}</span>
            <span className={`text-2xl font-bold ${cls}`}>{n}</span>
          </div>
        ))}
      </section>

      {!data.config.realEnrollmentEnabled && (
        <div className="mb-4 rounded-xl px-3 py-2 text-xs bg-surface-container text-on-surface-variant flex gap-2">
          <Icon name="lock" className="text-base" />
          {L('真实入组未开启：目前只能登记演示/培训患者（DEMO-编号）。', 'Real enrolment is off: only demo/training participants (DEMO-) can be added.')}
        </div>
      )}

      <button type="button" onClick={() => navigate('/clinical/enroll')} className="w-full min-h-[48px] rounded-xl bg-secondary text-white font-semibold flex items-center justify-center gap-2 mb-4">
        <Icon name="person_add" /> {L('新患者入组', 'Enrol new patient')}
      </button>

      <div className="relative mb-3">
        <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline text-xl" />
        <input type="search" value={query} onChange={e => { setQuery(e.target.value); if (e.target.value) setFilter('all') }} placeholder={L('搜索编号、姓名或手机号…', 'Search ID, name or phone…')} className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-variant bg-white text-sm" />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
        {filters.map(f => (
          <button key={f.id} type="button" onClick={() => setFilter(f.id)} className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold border ${filter === f.id ? 'bg-primary text-white border-primary' : 'bg-white text-on-surface-variant border-surface-variant'}`}>
            {f.label} ({counts[f.id]})
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 mb-6">
        {filtered.length === 0 && <p className="text-center text-on-surface-variant py-8 text-sm">{L('没有符合条件的患者', 'No matching patients')}</p>}
        {filtered.map(({ p, s }) => {
          const visits = allVisitStates(data, p)
          return (
            <button key={p.id} type="button" onClick={() => navigate(`/clinical/patient/${p.id}`)} className="bg-white rounded-2xl p-4 border border-surface-variant shadow-sm text-left flex items-center gap-3 active:scale-[0.99]">
              <div className={`w-1.5 self-stretch rounded-full shrink-0 ${s.level === 'high' ? 'bg-risk-critical' : s.level === 'medium' ? 'bg-risk-elevated' : 'bg-risk-stable'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-semibold text-on-surface">{p.id}</span>
                  {p.alias && <span className="text-sm text-on-surface-variant">{p.alias}</span>}
                  {p.identity && <span className="text-sm text-on-surface-variant">{p.identity.name} · {p.identity.phone}</span>}
                  <RiskBadge level={riskOf[s.level]} />
                  {s.unhandled && <span className="text-[11px] text-risk-critical font-semibold">{L('未处置', 'open')}</span>}
                </div>
                <p className="text-sm font-semibold text-secondary mb-2">
                  {visits.length ? L(`累计已提交 ${visits.filter(v => v.status === 'done').length}/${visits.length}`, `Total submitted ${visits.filter(v => v.status === 'done').length}/${visits.length}`) : L('待安排评估日期', 'Awaiting assessment dates')}
                </p>
                {[...p.cycles].sort((a, b) => a.cycleNo - b.cycleNo).map(cycle => (
                  <div key={cycle.cycleNo} className="flex items-center gap-1.5 flex-wrap text-xs text-on-surface-variant">
                    <span>{L(`第${cycle.cycleNo}周期 · 已提交 ${visits.filter(v => v.cycle.cycleNo === cycle.cycleNo && v.status === 'done').length}/3`, `C${cycle.cycleNo} · Submitted ${visits.filter(v => v.cycle.cycleNo === cycle.cycleNo && v.status === 'done').length}/3`)}</span>
                    {VISITS.map(v => {
                      const st = visitState(data, p, cycle, v.label)
                      return <span key={v.label} className="flex items-center gap-1">{v.label}<VisitStatusPill status={st.status} /></span>
                    })}
                  </div>
                ))}
                {s.toVerify > 0 && <p className="text-xs text-risk-elevated mt-1">{L(`${s.toVerify} 份纸质/电话录入待核对`, `${s.toVerify} paper/phone entr(ies) to verify`)}</p>}
              </div>
              <Icon name="chevron_right" className="text-outline shrink-0" />
            </button>
          )
        })}
      </div>

      <button type="button" onClick={handleLogout} className="w-full min-h-[48px] rounded-xl border border-outline-variant text-sm font-medium text-on-surface-variant">
        {tr.logout}
      </button>
    </ClinicalLayout>
  )
}
