import { useEffect, useState } from 'react'
import { useApp, isAdmin, type AuthUser } from '../../context/AppContext'
import { Icon, GlassCard } from '../../components/ui'
import { SubPageHeader, PrimaryButton, LangButton } from '../../components/layout/navigation'

export default function UserManagement() {
  const { tr, listManagedUsers, resetUserPassword, locale, user } = useApp()
  const [selected, setSelected] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [allUsers, setAllUsers] = useState<AuthUser[]>([])

  useEffect(() => {
    listManagedUsers().then(setAllUsers)
  }, [listManagedUsers])

  if (!user || !isAdmin(user.role)) return null

  const users = allUsers.filter(u => u.username !== user.username)

  const roleLabel = (role: string) => {
    if (role === 'system_admin') return tr.systemAdmin
    if (role === 'org_admin') return tr.orgAdmin
    return tr.externalUser
  }

  const handleReset = async () => {
    if (!selected || newPassword.length < 6) return
    setSaving(true)
    setMessage(null)
    const result = await resetUserPassword(selected, newPassword)
    setSaving(false)
    if (result.ok) {
      setMessage({ type: 'ok', text: tr.passwordResetSuccess })
      setNewPassword('')
      setSelected(null)
    } else {
      setMessage({ type: 'err', text: tr.passwordResetFailed })
    }
  }

  return (
    <div className="min-h-[100dvh] px-[var(--spacing-container-padding)] py-6 max-w-lg mx-auto pb-10">
      <div className="flex justify-end mb-2"><LangButton /></div>
      <SubPageHeader title={tr.userManagement} backTo="/admin" backLabel={tr.adminHub} />

      <p className="text-sm text-on-surface-variant mb-6">{tr.userManagementDesc}</p>

      <div className="flex flex-col gap-2 mb-6">
        {users.map(u => (
          <button
            key={u.username}
            type="button"
            onClick={() => { setSelected(u.username); setMessage(null) }}
            className={`text-left p-4 rounded-2xl border transition-all ${selected === u.username ? 'border-primary bg-primary/5 shadow-sm' : 'border-surface-variant bg-white'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-on-surface">{u.username}</span>
                <p className="text-xs text-on-surface-variant mt-0.5">{locale === 'zh' ? u.displayNameZh : u.displayNameEn}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-surface-container text-on-surface-variant font-medium">{roleLabel(u.role)}</span>
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <GlassCard className="p-5 rounded-2xl mb-4">
          <p className="text-sm font-semibold text-on-surface mb-3">{tr.resetPasswordFor} <span className="text-primary">{selected}</span></p>
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder={tr.newPasswordPlaceholder}
            className="w-full h-[48px] px-4 rounded-xl border border-outline-variant/50 bg-white mb-4 text-base"
          />
          <PrimaryButton onClick={handleReset} disabled={saving || newPassword.length < 6}>
            {saving ? tr.saving : tr.resetPassword}
          </PrimaryButton>
        </GlassCard>
      )}

      {message && (
        <p className={`text-sm flex items-center gap-2 px-3 py-2 rounded-lg ${message.type === 'ok' ? 'text-primary bg-primary/10' : 'text-error bg-error-container/30'}`}>
          <Icon name={message.type === 'ok' ? 'check_circle' : 'error'} className="text-lg" />
          {message.text}
        </p>
      )}
    </div>
  )
}
