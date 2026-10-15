import { useCallback, useEffect, useRef, useState } from 'react'
import { Autosave, SaveConflict } from './autosave'
import type { Draft } from './autosave'

type Instrument = { name?: string; version?: string; language?: string; recall_period?: string; items: { id: string; label: string; domain?: string; anchor_min?: string; anchor_max?: string }[]; [key: string]: unknown }
type Session = { role: string; actor: string; participant_id?: string; csrf_token: string; instrument: Instrument; real_enrollment_enabled: boolean }
type Assessment = { id: string; scheduled_date: string; status: string; kind: string; [key: string]: unknown }
type Submission = { id: string; answers: Record<string, number>; [key: string]: unknown }
type Participant = { id: string; withdrawn_at: string | null; consent_status: string; [key: string]: unknown }
type Detail = { assessment: Assessment; participant: Participant; draft: Draft; submission: Submission | null; instrument: Instrument }
type ParticipantDetail = { participant: Participant; assessments: Assessment[]; submissions: Submission[]; reviews: unknown[]; amendments?: unknown[]; consents?: unknown[]; grants: { id: string; revoked_at?: string }[] }
let csrf = ''
async function api<T>(path: string, data?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', headers: { ...(data !== undefined ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } : {}) }, ...(data !== undefined ? { method, body: JSON.stringify(data) } : {}) })
  const body = await response.json()
  if (!response.ok) {
    if (response.status === 409 && body.detail?.code === 'revision_conflict') throw new SaveConflict(body.detail.draft)
    throw new Error(typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail ?? body))
  }
  return body
}
function date(value: unknown) { return value ? new Date(String(value)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—' }
function Json({ value }: { value: unknown }) { return <pre className="record">{JSON.stringify(value, null, 2)}</pre> }

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      try {
        const fragment = new URLSearchParams(location.hash.slice(1))
        const token = fragment.get('token') ?? (location.hash && !location.hash.includes('=') ? location.hash.slice(1) : null)
        if (token) { await api('/access/exchange', { token }); history.replaceState(null, '', location.pathname + location.search) }
        const me = await api<Session>('/me'); csrf = me.csrf_token; setSession(me)
      } catch (e) { setError(e instanceof Error ? e.message : 'Access unavailable') }
      finally { setLoading(false) }
    })()
  }, [])
  return <main className="care-app"><header><span className="brand">CareConnect</span><p>关怀连接 · 患者报告评估</p>{session && <small>{session.actor} · {session.role}</small>}</header>
    {loading ? <section>Opening your private link…</section> : !session ? <section><h1>Private link required</h1><p>Open the individual link supplied by your care team. No account or login is needed.</p><p role="alert">{error}</p><button onClick={() => location.reload()}>Retry opening link</button><p>Expired or revoked links must be replaced by staff.</p></section> : <><aside> {session.real_enrollment_enabled ? 'Authorized study materials configured.' : 'Synthetic testing only. Real enrollment disabled until authorized instrument and approved consent materials are configured.'} </aside>{session.role === 'patient' ? <Patient /> : <Staff session={session} />}</>}
  </main>
}
function Patient() {
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState('')
  async function refresh() { try { setAssessments((await api<{ assessments: Assessment[] }>('/assessments')).assessments) } catch (e) { setError(String(e)) } }
  useEffect(() => { void api<{ assessments: Assessment[] }>('/assessments').then(result => setAssessments(result.assessments)).catch(e => setError(String(e))) }, [])
  return <><h1>Your assessments / 您的评估</h1><p>Scheduled dates use Asia/Shanghai. Missed assessments may still be completed late.</p>{error && <p role="alert">{error}</p>}{selected ? <AssessmentForm key={selected} id={selected} back={() => { setSelected(null); void refresh() }} /> : <section>{!assessments.length && <p>No assessments scheduled. / 暂无评估安排</p>}{assessments.map(a => <button className="assessment-card" key={a.id} onClick={() => setSelected(a.id)}>{a.scheduled_date} · {a.kind} <strong>{a.status}</strong></button>)}</section>}</>
}
function AssessmentForm({ id, back }: { id: string; back: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState<Submission | null>(null)
  const [conflict, setConflict] = useState(false)
  const saver = useRef<Autosave | null>(null)
  useEffect(() => {
    let cancelled = false
    void api<Detail>(`/assessments/${id}`).then(data => {
      if (cancelled) return
      setDetail(data); setReceipt(data.submission)
      const instance = new Autosave(`careconnect:v1:${data.participant.id}:${id}`, data.draft, localStorage,
        value => api<Draft>(`/assessments/${id}/draft`, { revision: value.revision, answers: value.answers, text: value.text, position: value.position }, 'PUT'),
        label => { setStatus(label); setDraft({ ...instance.value }); setConflict(!!instance.conflict) })
      saver.current = instance; setDraft({ ...instance.value }); setConflict(!!instance.conflict)
      setStatus(instance.conflict ? 'Save failed — conflicting edits preserved' : instance.value.dirty ? 'Saving' : 'Saved on server')
      if (instance.value.dirty && !instance.conflict) void instance.flush().catch(e => setError(String(e)))
    }).catch(e => setError(String(e)))
    const online = () => { void saver.current?.flush().catch(e => setError(String(e))) }
    const offline = () => { if (saver.current?.value.dirty) setStatus('Offline—saved on this device') }
    window.addEventListener('online', online); window.addEventListener('offline', offline)
    return () => { cancelled = true; saver.current?.dispose(); window.removeEventListener('online', online); window.removeEventListener('offline', offline) }
  }, [id])
  function change(patch: Partial<Draft>) { saver.current?.change(patch); setDraft(saver.current ? { ...saver.current.value } : null) }
  async function submit() {
    setBusy(true); setError('')
    try {
      await saver.current!.flush()
      const result = await api<Submission>(`/assessments/${id}/submit`, { revision: saver.current!.value.revision, idempotency_key: saver.current!.submissionKey() })
      setReceipt(result)
    } catch (e) { setError(String(e)); setDraft(saver.current ? { ...saver.current.value } : null) }
    finally { setBusy(false) }
  }
  if (!detail || !draft) return <section><p>{error || 'Loading assessment…'}</p><button onClick={back}>Back</button></section>
  if (receipt) return <section><h2>Submission received / 已提交</h2><p>Your original answers are preserved. Staff will review this assessment.</p><p>Receipt: {receipt.id}</p><p>Completed: {date(receipt.completed_at)}</p><Scores submission={receipt} /><button onClick={back}>Return to schedule</button></section>
  const items = detail.instrument.items
  const position = Math.min(Math.max(draft.position, 0), items.length - 1)
  const item = items[position]
  const answered = items.filter(i => draft.answers[i.id] !== undefined).length
  return <section><button className="secondary" onClick={back}>← Schedule</button><h2>{detail.assessment.scheduled_date} · {detail.assessment.kind}</h2><p>{String(detail.instrument.name ?? 'Assessment')} · {String(detail.instrument.instrument_version)} · {String(detail.instrument.language_version)}</p><p>{detail.instrument.authorized === false && "Synthetic questionnaire placeholder — not the authorized MDASI language. For testing only."}</p><p>Recall: {String(detail.instrument.recall_period ?? 'Past 24 hours / 过去24小时')}</p><p className="save-status" aria-live="polite">{status}</p>
    {conflict && <aside role="alert"><p>Another device saved newer answers. Your local edits are preserved. Choose how to continue.</p><button onClick={() => { saver.current!.resolve(false); setDraft({ ...saver.current!.value }); setError('') }}>Reload server answers</button><button onClick={() => { saver.current!.resolve(true); setDraft({ ...saver.current!.value }); setError('') }}>Reapply my local edits</button></aside>}
    <p>{answered} / {items.length} answered · Item {position + 1} / {items.length}</p><progress value={answered} max={items.length} />
    <fieldset disabled={busy}><legend>{item?.label} ({item?.id})</legend><p>{position < 13 ? 'Symptom severity' : 'Interference'} · Select an explicit response. 0 is a response; untouched is missing.</p><div className="scores">{Array.from({ length: 11 }, (_, score) => <button type="button" aria-pressed={draft.answers[item.id] === score} key={score} className={draft.answers[item.id] === score ? 'selected' : 'secondary'} onClick={() => change({ answers: { ...draft.answers, [item.id]: score } })}>{score}</button>)}</div><p>0: {String(item.anchor_min ?? '0')} · 10: {String(item.anchor_max ?? '10')}</p>
    <label>Notes / 备注<textarea maxLength={2000} value={draft.text} onChange={e => change({ text: e.target.value })} /></label><div className="actions"><button disabled={position === 0} onClick={() => change({ position: position - 1 })}>Previous</button><button disabled={position === items.length - 1} onClick={() => change({ position: position + 1 })}>Next</button></div><label>Go to item<select value={position} onChange={e => change({ position: Number(e.target.value) })}>{items.map((i, n) => <option key={i.id} value={n}>{n + 1}. {i.label} {draft.answers[i.id] !== undefined ? '✓' : '—'}</option>)}</select></label></fieldset>
    {error && <p role="alert">{error}</p>}<div className="actions"><button className="secondary" onClick={() => { void saver.current!.flush().catch(e => setError(String(e))) }}>Retry save</button><button disabled={busy || answered !== items.length || conflict} onClick={() => { void submit() }}>{busy ? 'Submitting…' : 'Submit final assessment / 确认提交'}</button></div><p>Submission waits for every pending change to be saved on the server. All 19 explicit responses are required.</p></section>
}
function Staff({ session }: { session: Session }) {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [staffGrants, setStaffGrants] = useState<{ id: string; actor: string; role: string; expires_at: string; revoked_at?: string }[]>([])
  const [queue, setQueue] = useState<Submission[]>([])
  const [completion, setCompletion] = useState<{ scheduled: number; submitted: number; rate: number | null } | null>(null)
  const [detail, setDetail] = useState<ParticipantDetail | null>(null)
  const [inspection, setInspection] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [link, setLink] = useState<{ id: string; url: string; qr_svg?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [enrollmentSynthetic, setEnrollmentSynthetic] = useState(true)
  const clinical = session.role === 'administrator' || session.role === 'admin' || session.role === 'clinical'
  const admin = session.role === 'administrator' || session.role === 'admin'
  const refresh = useCallback(async (id?: string) => {
    const result = await api<{ participants: Participant[]; completion: typeof completion }>('/participants')
    setParticipants(result.participants); setCompletion(result.completion)
    setQueue((await api<{ submissions: Submission[] }>('/reviews')).submissions)
    if (admin) setStaffGrants((await api<{ grants: typeof staffGrants }>('/staff-grants')).grants)
    if (id) setDetail(await api<ParticipantDetail>(`/participants/${encodeURIComponent(id)}`))
  }, [admin])
  useEffect(() => { void Promise.resolve().then(() => refresh()).catch(e => setError(String(e))) }, [refresh])
  async function action(path: string, data: unknown) {
    setBusy(true); setError('')
    try { const result = await api<{ id: string; url: string; qr_svg?: string }>(path, data); if (result?.url) setLink(result); await refresh(detail?.participant.id) }
    catch (e) { setError(String(e)) }
    finally { setBusy(false) }
  }
  function fields(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); return Object.fromEntries(new FormData(event.currentTarget)) }
  const participantId = detail?.participant.id
  return <><h1>Staff workspace / 工作台</h1><p>Attributable actor: {session.actor} · Shanghai scheduling · Drafts remain unfinished records.</p>{error && <p role="alert">{error}</p>}
    <section><h2>Completion</h2><p>{completion ? `${completion.submitted} submitted / ${completion.scheduled} scheduled · ${completion.rate === null ? 'No completion rate yet' : `${Math.round(completion.rate * (completion.rate <= 1 ? 100 : 1))}%`}` : 'No data'}</p><button className="secondary" onClick={() => { void refresh(participantId).catch(e => setError(String(e))) }}>Refresh</button></section>
    {clinical && <section><h2>Enroll participant</h2><form onSubmit={e => { const f = fields(e); void action('/participants', { ...f, synthetic: enrollmentSynthetic, consent_status: f.consent_status, consent_version: enrollmentSynthetic ? f.consent_version : session.instrument.consent_version }) }}><label>Pseudonymous participant ID<input name="participant_id" required maxLength={64} pattern="[A-Za-z0-9_-]+" /></label><label>Consent version<input key={enrollmentSynthetic ? "synthetic-consent" : "official-consent"} name="consent_version" required maxLength={100} readOnly={!enrollmentSynthetic} value={!enrollmentSynthetic ? String(session.instrument.consent_version ?? "") : undefined} /></label>{session.real_enrollment_enabled && <label><input type="checkbox" checked={enrollmentSynthetic} onChange={e => setEnrollmentSynthetic(e.target.checked)} /> Synthetic test participant (default)</label>}{!enrollmentSynthetic && <aside><h3>Approved consent material</h3><p>{String(session.instrument.consent_text ?? "")}</p><p>Version: {String(session.instrument.consent_version)} · Approval: {String(session.instrument.approval_reference)}</p></aside>}<label>Consent state<select name="consent_status"><option value="pending">Pending</option><option value="consented">Consented</option></select></label><p>No names or direct identifiers. {enrollmentSynthetic ? "Synthetic test enrollment." : "Record consent only after the approved consent process is complete."}</p><button disabled={busy}>Create participant</button></form></section>}
    {admin && <section><h2>Individual staff access</h2><form onSubmit={e => { void action('/staff-grants', fields(e)) }}><label>Attributable actor<input name="actor" required maxLength={100} /></label><label>Permission<select name="role"><option value="clinical">Clinical</option><option value="research">Research</option><option value="administrator">Administrator</option></select></label><button disabled={busy}>Issue private staff link</button></form><h3>Staff access grants</h3>{!staffGrants.length && <p>No staff grants.</p>}{staffGrants.map(g => <p key={g.id}>{g.actor} · {g.role} · expires {date(g.expires_at)} · {g.revoked_at ? "Revoked" : <button disabled={busy} className="secondary" onClick={() => { void action(`/grants/${g.id}/revoke`, {}) }}>Revoke link</button>}</p>)}</section>}
    {link && <section><h2>New private link</h2><p>This link is a credential. Share only with its intended recipient.</p><textarea aria-label="Private link" readOnly value={link.url} /><button onClick={() => { void navigator.clipboard.writeText(link.url).catch(() => setError('Copy unavailable; select the link manually.')) }}>Copy link</button>{link.qr_svg && <><img className="qr" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(link.qr_svg)}`} alt="Individual private access QR code" /><a className="download" download={`careconnect-${link.id}.svg`} href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(link.qr_svg)}`}>Download QR code</a></>}<button className="secondary" onClick={() => setLink(null)}>Hide credential</button></section>}
    <section><h2>Submission review queue</h2>{!queue.length && <p>No submissions to review.</p>}{queue.map(sub => <button className="assessment-card" key={sub.id} onClick={() => { void api<Detail>(`/assessments/${sub.assessment_id}`).then(setInspection).catch(e => setError(String(e))) }}>{String(sub.participant_id)} · {String(sub.scheduled_date)} · {String(sub.review_status)} · Inspect</button>)}</section><section><h2>Participants</h2>{!participants.length && <p>No participants enrolled.</p>}<div className="participant-list">{participants.map(p => <button className="secondary" key={p.id} onClick={() => { setInspection(null); setLink(null); void refresh(p.id).catch(e => setError(String(e))) }}>{p.id} · {p.withdrawn_at ? 'withdrawn' : p.consent_status}</button>)}</div></section>
    {detail && <section><h2>{participantId}</h2><Json value={detail.participant} />
      {clinical && <><form key={participantId} onSubmit={e => { void action(`/participants/${participantId}/consent`, fields(e)) }}><h3>Consent record</h3><label>Consent version<input name="consent_version" required maxLength={100} defaultValue={String(detail.participant.consent_version ?? "")} /></label><label>Status<select name="consent_status" defaultValue={detail.participant.consent_status}><option value="pending">Pending</option><option value="consented">Consented</option><option value="declined">Declined</option></select></label><button disabled={busy}>Record consent status</button></form><form onSubmit={e => { void action(`/participants/${participantId}/schedules`, fields(e)) }}><h3>Assign assessment</h3><label>Scheduled date (Asia/Shanghai)<input name="scheduled_date" type="date" required /></label><label>Type<select name="kind"><option value="baseline">Baseline</option><option value="followup">Follow-up</option></select></label><button disabled={busy}>Schedule</button></form><button disabled={busy} onClick={() => { void action(`/participants/${participantId}/grants`, {}) }}>Issue patient link and QR</button>
      <h3>Access grants</h3>{detail.grants.map(g => <p key={g.id}>{g.id} · {g.revoked_at ? 'Revoked' : 'Active'} {!g.revoked_at && <button disabled={busy} className="secondary" onClick={() => { void action(`/grants/${g.id}/revoke`, {}) }}>Revoke</button>}</p>)}
      <form onSubmit={e => { void action(`/participants/${participantId}/withdraw`, fields(e)) }}><label>Withdrawal reason<input name="reason" required maxLength={2000} /></label><button disabled={busy}>Withdraw and revoke patient access</button></form></>}
      <h3>Scheduled assessments</h3>{!detail.assessments.length && <p>No assessments scheduled.</p>}{detail.assessments.map(a => <button className="assessment-card" key={a.id} onClick={() => { void api<Detail>(`/assessments/${a.id}`).then(setInspection).catch(e => setError(String(e))) }}>{a.scheduled_date} · {a.kind} · {a.status} · Inspect</button>)}
      <h3>Consent and amendment history</h3><Json value={{ consents: detail.consents ?? [], amendments: detail.amendments ?? [] }} /><h3>Review and intervention history</h3>{!detail.reviews.length ? <p>No reviews recorded.</p> : detail.reviews.map((r, index) => <Json key={index} value={r} />)}
    </section>}
    {inspection && <section><h2>Assessment record</h2><p>Scheduled: {inspection.assessment.scheduled_date} · Status: {inspection.assessment.status}</p><Json value={inspection.assessment} />{!inspection.submission ? <><h3>Unfinished draft — excluded from default research exports</h3><p>Revision: {inspection.draft.revision} · Questionnaire position: {inspection.draft.position + 1}</p><AnswerTable answers={inspection.draft.answers} /><p>Notes: {inspection.draft.text || "—"}</p></> : <><h3>Immutable submission</h3><p>Completed: {date(inspection.submission.completed_at)}</p><Scores submission={inspection.submission} /><AnswerTable answers={inspection.submission.answers} /><p>Notes: {String(inspection.submission.text || "—")}</p>{clinical && <><form onSubmit={e => { const f = fields(e); void action(`/submissions/${inspection.submission!.id}/review`, { ...f, follow_up_date: f.follow_up_date || null }) }}><h3>Review / Intervention</h3><label>Status<select name="status"><option value="reviewed">Reviewed</option><option value="closed">Closed</option></select></label><label>Review and intervention notes<textarea name="notes" required maxLength={4000} /></label><label>Follow-up date<input name="follow_up_date" type="date" /></label><label>Closure outcome<input name="closure_outcome" maxLength={1000} /></label><button disabled={busy}>Record review</button></form><Amend key={inspection.submission.id} submission={inspection.submission} busy={busy} save={answers => { void action(`/submissions/${inspection.submission!.id}/amend`, answers) }} /></>}</> }</section>}
    {(admin || session.role === "research") && <section><h2>Research exports</h2><p>CSV files contain persisted records. Access credentials and unfinished drafts are excluded from default exports.</p><div className="actions">{['participants', 'responses', 'schedules', 'submissions', 'reviews', 'consents', 'amendments', 'interventions', 'dictionary'].map(name => <a className="download" key={name} href={`/api/exports/${name}.csv`} download>{name}.csv</a>)}</div><p><a href="/api/exports/drafts.csv" download>Export unfinished drafts (explicit draft export)</a></p></section>}
  </>
}
function Scores({ submission }: { submission: Submission }) {
  return <dl className="domain-scores"><dt>Symptom severity (13 items)</dt><dd>{submission.symptom_mean === null || submission.symptom_mean === undefined ? 'Missing' : Number(submission.symptom_mean).toFixed(2)} / 10 · {String(submission.symptom_answered ?? 0)} answered</dd><dt>Interference (6 items)</dt><dd>{submission.interference_mean === null || submission.interference_mean === undefined ? 'Missing' : Number(submission.interference_mean).toFixed(2)} / 10 · {String(submission.interference_answered ?? 0)} answered</dd></dl>
}
function AnswerTable({ answers }: { answers: Record<string, number> }) {
  return <table><caption>Persisted item responses</caption><thead><tr><th>Item</th><th>Domain</th><th>Response (0–10)</th></tr></thead><tbody>{[...Array.from({ length: 13 }, (_, i) => `s${i + 1}`), ...Array.from({ length: 6 }, (_, i) => `i${i + 1}`)].map(id => <tr key={id}><th>{id}</th><td>{id.startsWith('s') ? 'Symptom severity' : 'Interference'}</td><td>{answers[id] ?? 'Missing'}</td></tr>)}</tbody></table>
}
function Amend({ submission, busy, save }: { submission: Submission; busy: boolean; save: (data: { answers: Record<string, number>; reason: string }) => void }) {
  const [answers, setAnswers] = useState(submission.answers)
  const [reason, setReason] = useState('')
  return <form onSubmit={e => { e.preventDefault(); save({ answers, reason }) }}><h3>Linked amendment</h3><p>Original answers remain unchanged. Each amendment records the actor, reason and timestamp.</p><div className="amend-grid">{Object.entries(answers).map(([id, score]) => <label key={id}>{id}<input type="number" min={0} max={10} step={1} required value={score} onChange={e => setAnswers({ ...answers, [id]: Number(e.target.value) })} /></label>)}</div><label>Correction reason<textarea required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label><button disabled={busy}>Create amendment</button></form>
}
