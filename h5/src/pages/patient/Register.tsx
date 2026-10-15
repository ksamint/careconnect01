import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useApp, homePathForUser } from '../../context/AppContext'
import { api, ApiError } from '../../api/client'
import { useL } from '../../study/useL'
import { GlassCard, Icon } from '../../components/ui'
import { LangButton, PrimaryButton } from '../../components/layout/navigation'
import { studyDate } from '../../study/logic'

type RegistrationSettings = { realEnrollmentEnabled: boolean; consentVersion: string }

export default function PatientRegister() {
  const { login, user } = useApp()
  const navigate = useNavigate()
  const L = useL()
  const [settings, setSettings] = useState<RegistrationSettings | null>(null)
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [birthday, setBirthday] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(false)

  useEffect(() => {
    api<RegistrationSettings>('/api/patient-registration').then(setSettings).catch(() => setError('network'))
  }, [])

  if (user) return <Navigate to={homePathForUser(user)} replace />

  const messages: Record<string, string> = {
    invalid_phone: L('请输入有效的中国大陆手机号。', 'Enter a valid mainland China mobile number.'),
    invalid_name: L('请输入姓名，最多80个字。', 'Enter a name, up to 80 characters.'),
    invalid_birthday: L('请输入有效的出生日期。', 'Enter a valid birthday.'),
    registration_unavailable: L('无法重复登记，请用手机号和密码登录，或联系护士核对。', 'Registration is unavailable. Sign in with your phone and password, or contact your nurse.'),
    real_enrollment_disabled: L('正式入组尚未开放，目前只可使用虚构信息演示。', 'Real enrollment is closed. Use fictional details for demo registration only.'),
    registration_rate_limited: L('登记请求较多，请一分钟后重试。', 'Too many registrations. Please try again in one minute.'),
    consent_required: L('请先完成当前版本的知情同意。', 'Complete the current consent process first.'),
    network: L('暂时无法连接，请刷新重试。', 'Unable to connect. Refresh and try again.'),
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!settings || !confirmed || busy || created) return
    setBusy(true)
    setError('')
    try {
      const account = await api<{ username: string; password: string }>('/api/patient-registration', {
        method: 'POST', body: { phone, name, birthday, synthetic: !settings.realEnrollmentEnabled, consentConfirmed: confirmed, consentVersion: settings.consentVersion },
      })
      setCreated(true)
      const result = await login(account.username, account.password)
      if (result.ok) navigate('/patient/assessment', { replace: true })
      else setError('network')
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'network')
    } finally {
      setBusy(false)
    }
  }

  const inputClass = 'w-full min-h-[52px] min-w-0 px-4 rounded-xl border border-outline-variant bg-white text-base text-on-surface'
  return (
    <main className="min-h-[100dvh] px-5 py-6 max-w-md mx-auto">
      <div className="flex justify-end mb-6"><LangButton /></div>
      <div className="text-center mb-6">
        <Icon name="person_add" className="text-primary text-4xl" />
        <h1 className="text-2xl font-bold text-on-surface mt-3">{L('患者登记', 'Patient registration')}</h1>
        <p className="text-sm text-on-surface-variant mt-2">{L('填写以下信息，自动创建您的个人账号。', 'Enter your details to create your personal account.')}</p>
      </div>
      {settings && !settings.realEnrollmentEnabled && <p role="note" className="mb-4 p-4 rounded-xl bg-secondary/10 text-secondary text-sm">{L('演示模式：正式入组尚未开放，请仅填写虚构手机号、姓名和出生日期。', 'Demo mode: real enrollment is closed. Enter fictional phone, name and birthday only.')}</p>}
      <GlassCard className="p-5">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="text-sm font-medium flex flex-col gap-2" htmlFor="phone">{L('手机号', 'Mobile phone')}
            <input id="phone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={20} value={phone} onChange={e => setPhone(e.target.value)} placeholder={L('中国大陆手机号（可加 +86）', 'Mainland China mobile (+86 optional)')} className={inputClass} />
          </label>
          <label className="text-sm font-medium flex flex-col gap-2" htmlFor="patient-name">{L('姓名', 'Name')}
            <input id="patient-name" autoComplete="name" required maxLength={80} value={name} onChange={e => setName(e.target.value)} className={inputClass} />
          </label>
          <label className="text-sm font-medium flex flex-col gap-2" htmlFor="birthday">{L('出生日期', 'Birthday')}
            <input id="birthday" type="date" autoComplete="bday" required min="1900-01-01" max={studyDate()} value={birthday} onChange={e => setBirthday(e.target.value)} className={inputClass} />
          </label>
          <p className="text-sm text-on-surface-variant">{L('手机号可用于登录，初始密码：', 'Sign in with your phone. Initial password: ')}<strong>kangfu999</strong></p>
          <p className="text-sm text-on-surface-variant">{L('护士安排评估日期后，问卷会显示在您的账号中。', 'Your questionnaire appears after your nurse assigns assessment dates.')}</p>
          {settings && <label className="flex gap-3 items-start text-sm leading-relaxed">
            <input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1 w-5 h-5 shrink-0" />
            {settings.realEnrollmentEnabled
              ? L(`我已完成知情同意（版本 ${settings.consentVersion}），同意登记上述信息。`, `I have completed consent (${settings.consentVersion}) and agree to register these details.`)
              : L('我确认以上均为虚构信息，仅用于演示。', 'I confirm all details are fictional and for demonstration only.')}
          </label>}
          {error && <p role="alert" className="text-error text-sm">{messages[error] ?? messages.network}</p>}
          {created && <p role="status" className="text-primary text-sm">{L('账号已创建，请用手机号和初始密码登录，无需重复登记。', 'Account created. Sign in with your phone and initial password; do not register again.')}</p>}
          <PrimaryButton type="submit" disabled={!settings || !confirmed || busy || created}>{busy ? L('正在创建…', 'Creating…') : L('创建账号并进入问卷', 'Create account and continue')}</PrimaryButton>
          <Link to="/login" className="text-secondary text-center min-h-[44px] flex items-center justify-center">{L('已有账号？登录 / 工作人员登录', 'Already registered? Sign in / Staff sign-in')}</Link>
        </form>
      </GlassCard>
    </main>
  )
}
