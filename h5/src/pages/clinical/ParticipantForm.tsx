import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStudy } from '../../study/useStudy'
import { useL } from '../../study/useL'
import { ClinicalLayout } from '../../components/layout'
import { Icon } from '../../components/ui'
import { Card, SelectField, TextField, SyncBanner } from '../../components/study'
import { opErrorText } from '../../study/uiText'
import { rdi, studyDate } from '../../study/logic'
import type { ClinicalInfo, Cycle, CycleOutcome, Demographics, Participant } from '../../study/types'

const emptyDemo: Demographics = { sex: '', age: '', ethnicity: '', marital: '', education: '', occupation: '', income: '', payment: '' }
const emptyClin: ClinicalInfo = { tumorType: '', pathology: '', stage: '', comorbidity: '', comorbidityDetail: '', regimen: '', priorChemoCount: '', ecog: '', antiemeticProphylaxis: '', gcsfProphylaxis: '' }
const emptyOutcome: CycleOutcome = { unplannedVisit: '', unplannedVisitDate: '', unplannedVisitType: '', unplannedVisitReason: '', plannedDose: '', actualDose: '', nextCycleDelayDays: '' }

/** Enrolment (no :id) and baseline CRF / cycles / outcomes editing (with :id). */
export default function ParticipantForm() {
  const { id } = useParams()
  const { data } = useStudy()
  if (!data) return <ClinicalLayout><SyncBanner /></ClinicalLayout>
  return <FormBody key={id ?? 'new'} />
}

function FormBody() {
  const { id } = useParams()
  const { data: loaded, mutate } = useStudy()
  const data = loaded!
  const L = useL()
  const navigate = useNavigate()
  const existing: Participant | undefined = data.participants.find(p => p.id === id)
  const isNew = !id
  const realAllowed = data.config.realEnrollmentEnabled

  const [alias, setAlias] = useState(existing?.alias ?? '')
  const [synthetic, setSynthetic] = useState(!realAllowed)
  const [consentDate, setConsentDate] = useState(studyDate())
  const [createLogin, setCreateLogin] = useState(true)
  const [demo, setDemo] = useState<Demographics>(existing?.demographics ?? emptyDemo)
  const [clin, setClin] = useState<ClinicalInfo>(existing?.clinical ?? emptyClin)
  const [cycles, setCycles] = useState<Cycle[]>(existing?.cycles ?? [{ cycleNo: 1, infusionDate: '', outcome: emptyOutcome }])
  const [sus, setSus] = useState(existing?.susScore ?? '')
  const [withdrawReason, setWithdrawReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [login, setLogin] = useState<{ username: string; password: string } | null>(null)

  if (!isNew && !existing) return <ClinicalLayout><p className="py-8 text-center">{L('未找到该患者', 'Participant not found')}</p></ClinicalLayout>

  const d = (k: keyof Demographics) => (v: string) => setDemo({ ...demo, [k]: v })
  const c = (k: keyof ClinicalInfo) => (v: string) => setClin({ ...clin, [k]: v })
  const setCycle = (i: number, patch: Partial<Cycle>) => setCycles(cycles.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const setOutcome = (i: number, k: keyof CycleOutcome) => (v: string) => setCycle(i, { outcome: { ...cycles[i].outcome, [k]: v } })
  const addCycle = () => {
    const last = cycles.reduce((a, b) => (b.cycleNo > a.cycleNo ? b : a), cycles[0])
    setCycles([...cycles, { cycleNo: (last?.cycleNo ?? 0) + 1, infusionDate: '', outcome: emptyOutcome }])
  }

  const save = async () => {
    setSaving(true)
    setError('')
    const res = isNew
      ? await mutate<{ participantId: string; login: { username: string; password: string } | null }>('enroll', { alias, synthetic, consentDate, createLogin, demographics: demo, clinical: clin, cycles })
      : await mutate('updateParticipant', { id, alias, demographics: demo, clinical: clin, cycles, susScore: sus })
    setSaving(false)
    if (!res.ok) {
      setError(opErrorText(res.error, L))
      return
    }
    if (isNew) {
      const r = res.result as { participantId: string; login: { username: string; password: string } | null }
      if (r.login) setLogin(r.login)
      else navigate(`/clinical/patient/${r.participantId}`, { replace: true })
    } else {
      navigate(`/clinical/patient/${id}`)
    }
  }

  const withdraw = async () => {
    if (!withdrawReason.trim()) return
    const res = await mutate('updateParticipant', { id, withdraw: true, withdrawReason })
    if (res.ok) navigate(`/clinical/patient/${id}`)
    else setError(opErrorText(res.error, L))
  }

  if (login) {
    return (
      <ClinicalLayout>
        <Card title={L('入组成功', 'Enrolled')}>
          <p className="text-sm mb-3">{L('请把以下登录信息交给患者（只显示这一次，可在患者页面重置）：', 'Give this login to the patient (shown once; can be reset on the patient page):')}</p>
          <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 text-lg font-mono">
            <p>{L('账号', 'Username')}: <b>{login.username}</b></p>
            <p>{L('密码', 'Password')}: <b>{login.password}</b></p>
          </div>
          <button type="button" onClick={() => navigate(`/clinical/patient/${login.username.toUpperCase()}`, { replace: true })} className="mt-4 w-full min-h-[48px] rounded-xl bg-primary-container text-white font-semibold">
            {L('进入患者页面', 'Open patient page')}
          </button>
        </Card>
      </ClinicalLayout>
    )
  }

  return (
    <ClinicalLayout>
      <SyncBanner />
      <h1 className="text-xl font-bold text-on-surface mb-4">{isNew ? L('新患者入组', 'Enrol new patient') : L(`${id} · 基线与周期资料`, `${id} · baseline & cycles`)}</h1>

      <Card title={L('入组信息', 'Enrolment')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField label={L('代称（不填真实姓名）', 'Alias (no real name)')} value={alias} onChange={setAlias} placeholder={L('如：床 12', 'e.g. Bed 12')} />
          {isNew && <TextField label={L('签署知情同意日期', 'Consent signed on')} type="date" value={consentDate} onChange={setConsentDate} />}
        </div>
        {isNew && (
          <div className="flex flex-col gap-2 mt-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={synthetic} disabled={!realAllowed} onChange={e => setSynthetic(e.target.checked)} />
              {L('演示/培训患者（不计入研究数据）', 'Demo/training participant (not study data)')}
              {!realAllowed && <span className="text-xs text-outline">· {L('真实入组未开启', 'real enrolment off')}</span>}
            </label>
            {!synthetic && <p className="text-xs text-on-surface-variant">{L('同意书版本', 'Consent version')}: <b>{data.config.consentVersion}</b></p>}
            <label className="flex items-center gap-2"><input type="checkbox" checked={createLogin} onChange={e => setCreateLogin(e.target.checked)} />{L('为患者开通手机填写账号', 'Create a phone login for the patient')}</label>
          </div>
        )}
      </Card>

      <Card title={L('人口学资料（T0）', 'Demographics (T0)')}>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label={L('性别', 'Sex')} optionKey="sex" value={demo.sex} onChange={d('sex')} />
          <TextField label={L('年龄（岁）', 'Age (years)')} type="number" value={demo.age} onChange={d('age')} />
          <SelectField label={L('民族', 'Ethnicity')} optionKey="ethnicity" value={demo.ethnicity} onChange={d('ethnicity')} />
          <SelectField label={L('婚姻状况', 'Marital status')} optionKey="marital" value={demo.marital} onChange={d('marital')} />
          <SelectField label={L('文化程度', 'Education')} optionKey="education" value={demo.education} onChange={d('education')} />
          <SelectField label={L('职业状态', 'Occupation')} optionKey="occupation" value={demo.occupation} onChange={d('occupation')} />
          <SelectField label={L('家庭人均月收入', 'Monthly income per head')} optionKey="income" value={demo.income} onChange={d('income')} />
          <SelectField label={L('医疗支付方式', 'Payment method')} optionKey="payment" value={demo.payment} onChange={d('payment')} />
        </div>
      </Card>

      <Card title={L('临床资料（T0，自 HIS 提取）', 'Clinical (T0, from HIS)')}>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label={L('瘤种', 'Tumour type')} optionKey="tumorType" value={clin.tumorType} onChange={c('tumorType')} />
          <SelectField label={L('临床分期', 'Stage')} optionKey="stage" value={clin.stage} onChange={c('stage')} />
          <div className="col-span-2"><TextField label={L('病理诊断', 'Pathology')} value={clin.pathology} onChange={c('pathology')} /></div>
          <TextField label={L('化疗方案', 'Regimen')} value={clin.regimen} onChange={c('regimen')} placeholder="FOLFOX / AC-T …" />
          <TextField label={L('既往化疗次数', 'Prior chemo cycles')} type="number" value={clin.priorChemoCount} onChange={c('priorChemoCount')} />
          <SelectField label="ECOG PS" optionKey="ecog" value={clin.ecog} onChange={c('ecog')} />
          <SelectField label={L('合并慢病', 'Chronic comorbidity')} optionKey="yesNo" value={clin.comorbidity} onChange={c('comorbidity')} />
          {clin.comorbidity === 'yes' && <div className="col-span-2"><TextField label={L('慢病名称', 'Which')} value={clin.comorbidityDetail} onChange={c('comorbidityDetail')} /></div>}
          <SelectField label={L('预防性止吐', 'Antiemetic prophylaxis')} optionKey="yesNo" value={clin.antiemeticProphylaxis} onChange={c('antiemeticProphylaxis')} />
          <SelectField label={L('预防性升白', 'G-CSF prophylaxis')} optionKey="yesNo" value={clin.gcsfProphylaxis} onChange={c('gcsfProphylaxis')} />
        </div>
      </Card>

      <div id="cycles" />
      {cycles.map((cy, i) => (
        <Card key={i} title={L(`第 ${cy.cycleNo} 周期`, `Cycle ${cy.cycleNo}`)}>
          <div className="grid grid-cols-2 gap-3">
            <TextField label={L('周期号', 'Cycle no.')} type="number" value={String(cy.cycleNo)} onChange={v => setCycle(i, { cycleNo: Number(v) })} />
            <TextField label={L('输注开始日（第 0 天）', 'Infusion start (day 0)')} type="date" value={cy.infusionDate} onChange={v => setCycle(i, { infusionDate: v })} />
          </div>
          {!isNew && (
            <>
              <p className="text-xs font-semibold text-on-surface-variant mt-4 mb-2">{L('结局（下周期化疗时回顾填写）', 'Outcomes (fill in at the next cycle)')}</p>
              <div className="grid grid-cols-2 gap-3">
                <SelectField label={L('本周期内非计划就诊', 'Unplanned visit this cycle')} optionKey="yesNo" value={cy.outcome.unplannedVisit} onChange={setOutcome(i, 'unplannedVisit')} />
                {cy.outcome.unplannedVisit === 'yes' && (
                  <>
                    <TextField label={L('就诊日期', 'Date')} type="date" value={cy.outcome.unplannedVisitDate} onChange={setOutcome(i, 'unplannedVisitDate')} />
                    <SelectField label={L('就诊类型', 'Type')} optionKey="visitType" value={cy.outcome.unplannedVisitType} onChange={setOutcome(i, 'unplannedVisitType')} />
                    <TextField label={L('主要原因', 'Main reason')} value={cy.outcome.unplannedVisitReason} onChange={setOutcome(i, 'unplannedVisitReason')} />
                  </>
                )}
                <TextField label={L('计划剂量', 'Planned dose')} type="number" value={cy.outcome.plannedDose} onChange={setOutcome(i, 'plannedDose')} hint={L('主药，单位一致即可（如 mg/m²）', 'Main drug, same unit (e.g. mg/m²)')} />
                <TextField label={L('实际剂量', 'Actual dose')} type="number" value={cy.outcome.actualDose} onChange={setOutcome(i, 'actualDose')} hint={`RDI = ${rdi(cy) ?? '—'}`} />
                <TextField label={L('下周期延迟天数', 'Next cycle delay (days)')} type="number" value={cy.outcome.nextCycleDelayDays} onChange={setOutcome(i, 'nextCycleDelayDays')} />
              </div>
            </>
          )}
        </Card>
      ))}
      <button type="button" onClick={addCycle} className="w-full min-h-[44px] rounded-xl border border-dashed border-secondary text-secondary font-semibold mb-4 flex items-center justify-center gap-1">
        <Icon name="add" /> {L('新增化疗周期', 'Add chemo cycle')}
      </button>

      {!isNew && (
        <Card title={L('研究结束时', 'At study end')}>
          <TextField label={L('SUS 可用性得分（0–100）', 'SUS usability score (0–100)')} type="number" value={sus} onChange={setSus} />
        </Card>
      )}

      {error && <p className="text-error text-sm mb-3">{error}</p>}
      <button type="button" onClick={save} disabled={saving} className="w-full min-h-[56px] rounded-xl bg-primary-container text-white font-semibold disabled:opacity-50 mb-6">
        {saving ? '…' : isNew ? L('确认入组', 'Enrol') : L('保存', 'Save')}
      </button>

      {!isNew && existing?.status === 'active' && (
        <Card title={L('退出研究', 'Withdraw')}>
          <p className="text-xs text-on-surface-variant mb-2">{L('已提交的数据会保留，患者账号将停用。', 'Submitted data is kept; the patient login is disabled.')}</p>
          <TextField label={L('退出原因', 'Reason')} value={withdrawReason} onChange={setWithdrawReason} />
          <button type="button" onClick={withdraw} disabled={!withdrawReason.trim()} className="mt-3 w-full min-h-[44px] rounded-xl border border-error text-error font-semibold disabled:opacity-40">{L('确认退出', 'Confirm withdrawal')}</button>
        </Card>
      )}
    </ClinicalLayout>
  )
}
