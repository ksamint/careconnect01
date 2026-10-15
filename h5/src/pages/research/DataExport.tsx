import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useStudy } from '../../study/useStudy'
import { useL } from '../../study/useL'
import { ResearchLayout } from '../../components/layout'
import { Icon } from '../../components/ui'
import { SyncBanner } from '../../components/study'
import {
  submissionsCsv, visitStatusCsv, baselineCsv, outcomesCsv, alertsCsv, contactsCsv, revisionsCsv, auditCsv, dictionaryCsv,
} from '../../study/export'
import { downloadCsv } from '../../utils/export'
import type { StudyData } from '../../study/types'

export default function DataExport() {
  const { tr } = useApp()
  const { data } = useStudy()
  const L = useL()
  const [includeDemo, setIncludeDemo] = useState(false)
  const [last, setLast] = useState('')

  if (!data) return <ResearchLayout><SyncBanner /></ResearchLayout>

  const date = new Date().toISOString().slice(0, 10)
  const files: { key: string; icon: string; title: string; desc: string; build: (d: StudyData) => string }[] = [
    { key: 'submissions', icon: 'table', title: L('问卷数据（长格式）', 'Questionnaire data (long)'), desc: L('每次随访一行；19 题、均分、时间窗、填写方式、是否核对', 'One row per visit: 19 items, means, window, mode, verified'), build: d => submissionsCsv(d, includeDemo) },
    { key: 'visit_status', icon: 'event_note', title: L('随访完成情况', 'Visit status'), desc: L('所有应随访时点及状态、提醒次数、缺失原因', 'All expected visits with status, reminders, missed reason'), build: d => visitStatusCsv(d, includeDemo) },
    { key: 'baseline', icon: 'badge', title: L('基线资料（表 1）', 'Baseline (Table 1)'), desc: L('人口学 + 临床资料 + SUS', 'Demographics + clinical + SUS'), build: d => baselineCsv(d, includeDemo) },
    { key: 'outcomes', icon: 'monitoring', title: L('结局指标', 'Outcomes'), desc: L('非计划就诊、RDI、延迟天数（每周期一行）', 'Unplanned visits, RDI, delay (per cycle)'), build: d => outcomesCsv(d, includeDemo) },
    { key: 'alerts', icon: 'notification_important', title: L('预警与响应时长', 'Alerts & response time'), desc: L('预警等级、规则版本、处置时长', 'Level, rule version, minutes to response'), build: d => alertsCsv(d, includeDemo) },
    { key: 'contacts', icon: 'call', title: L('提醒记录', 'Reminder log'), desc: L('推送/电话次数与是否联系上', 'Messages/calls and whether reached'), build: contactsCsv },
    { key: 'revisions', icon: 'history', title: L('修改记录', 'Revisions'), desc: L('每次更正的人、时间、原因与新值', 'Who/when/why and new values for every correction'), build: revisionsCsv },
    { key: 'audit', icon: 'policy', title: L('操作日志', 'Audit log'), desc: L('全部写操作的留痕', 'Trail of every write'), build: auditCsv },
    { key: 'dictionary', icon: 'menu_book', title: L('数据字典', 'Data dictionary'), desc: L('变量含义与取值', 'Variables and values'), build: () => dictionaryCsv() },
  ]

  return (
    <ResearchLayout>
      <SyncBanner />
      <h1 className="text-xl font-bold text-on-surface mb-2">{tr.exportTitle}</h1>
      <p className="text-on-surface-variant text-sm mb-4">{L('CSV（UTF-8，可直接用 Excel / R / SPSS 打开）。缺失值为空格，不以 0 代替。', 'CSV (UTF-8; opens in Excel / R / SPSS). Missing values are empty, never 0.')}</p>

      <label className="flex items-center gap-2 text-sm mb-4 bg-white rounded-xl p-3 border border-surface-variant">
        <input type="checkbox" checked={includeDemo} onChange={e => setIncludeDemo(e.target.checked)} />
        {L('包含演示/培训数据（DEMO-）', 'Include demo/training data (DEMO-)')}
      </label>

      <div className="flex flex-col gap-2 mb-6">
        {files.map(f => (
          <button key={f.key} type="button" onClick={() => { downloadCsv(f.build(data), `careconnect_${data.config.studyCode}_${f.key}_${date}.csv`); setLast(f.key) }} className="bg-white rounded-xl p-4 border border-surface-variant flex items-center gap-3 text-left active:scale-[0.99]">
            <Icon name={f.icon} className="text-secondary text-2xl" />
            <div className="flex-1">
              <span className="font-semibold text-on-surface block">{f.title}</span>
              <span className="text-xs text-on-surface-variant">{f.desc}</span>
            </div>
            <Icon name={last === f.key ? 'check_circle' : 'download'} className={last === f.key ? 'text-primary' : 'text-outline'} />
          </button>
        ))}
      </div>
      <p className="text-xs text-outline mb-6">{L('导出文件含研究数据，请按数据管理制度加密存放，不要通过微信等渠道传送。', 'Exports contain study data: store them encrypted per the data management plan; do not send via chat apps.')}</p>
    </ResearchLayout>
  )
}
