import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp, homePathForUser } from '../context/AppContext'
import { getAuthProvider } from '../auth'
import { Icon, GlassCard } from '../components/ui'
import { LangButton, PrimaryButton } from '../components/layout/navigation'

export default function Login() {
  const { tr, login, locale } = useApp()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await login(username.trim(), password)
    setLoading(false)
    if (!result.ok) {
      setError(tr.loginError)
      return
    }
    const session = getAuthProvider().getSession()
    if (session) navigate(homePathForUser(session.user), { replace: true })
  }

  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -right-32 w-80 h-80 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute bottom-0 -left-24 w-96 h-96 rounded-full bg-secondary/6 blur-3xl" />
      </div>

      <div className="relative flex justify-end px-6 pt-[max(16px,env(safe-area-inset-top))]">
        <LangButton />
      </div>

      <div className="relative flex-1 flex flex-col justify-center px-6 pb-12 max-w-md mx-auto w-full">
        <div className="text-center mb-10">
          <div className="w-[72px] h-[72px] rounded-[22px] bg-gradient-to-br from-primary-container to-primary mx-auto flex items-center justify-center mb-5 shadow-[0_12px_40px_-8px_rgba(76,175,80,0.5)]">
            <Icon name="favorite" filled className="text-white text-[36px]" />
          </div>
          <h1 className="text-[28px] font-bold text-on-surface tracking-tight">{tr.appName}</h1>
          <p className="text-on-surface-variant mt-2 text-[15px] leading-relaxed">{tr.appTagline}</p>
          <span className="inline-block mt-4 px-3 py-1 rounded-full bg-secondary/10 text-secondary text-xs font-semibold tracking-wide">{tr.studyId}</span>
        </div>

        <GlassCard className="p-6 rounded-[24px]">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="username" className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2 block">{tr.username}</label>
              <input
                id="username"
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full h-[52px] px-4 rounded-xl border border-outline-variant/50 bg-white/90 text-on-surface text-base focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-shadow"
                placeholder={tr.usernamePlaceholder}
              />
            </div>
            <div>
              <label htmlFor="password" className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2 block">{tr.password}</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full h-[52px] px-4 pr-12 rounded-xl border border-outline-variant/50 bg-white/90 text-on-surface text-base focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
                  placeholder={tr.passwordPlaceholder}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-outline"
                  aria-label="Toggle password"
                >
                  <Icon name={showPassword ? 'visibility_off' : 'visibility'} className="text-xl" />
                </button>
              </div>
            </div>

            {error && (
              <p className="text-error text-sm flex items-center gap-1.5 bg-error-container/30 px-3 py-2 rounded-lg">
                <Icon name="error" className="text-lg" />
                {error}
              </p>
            )}

            <PrimaryButton type="submit" disabled={loading || !username || !password} className="mt-2">
              {loading ? tr.loggingIn : tr.login}
            </PrimaryButton>
          </form>
          <Link to="/patient/register" className="flex items-center justify-center min-h-[48px] mt-4 text-secondary font-medium">{tr.rolePatient} · {locale === 'zh' ? '首次登记' : 'First-time registration'}</Link>
        </GlassCard>
      </div>
    </div>
  )
}
