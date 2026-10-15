import type { AuthProvider, AuthSession, AuthUser, LoginResult } from './types'
import { api, ApiError, getToken, setToken } from '../api/client'

const SESSION_KEY = 'careconnect_session'

function persistSession(session: AuthSession | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  } catch { /* storage unavailable */ }
}

function readSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw || !getToken()) return null
    const session = JSON.parse(raw) as AuthSession
    if (session.provider !== 'api' || !session.user?.username) return null
    return session
  } catch {
    return null
  }
}

/** Server-backed auth: passwords are checked and stored (hashed) by the CareConnect server only. */
class ApiAuthProvider implements AuthProvider {
  readonly name = 'api' as const
  private session: AuthSession | null = readSession()

  async login(username: string, password: string): Promise<LoginResult> {
    try {
      const { token, user } = await api<{ token: string; user: AuthUser }>('/api/login', { method: 'POST', body: { username, password } })
      setToken(token)
      this.session = { user, provider: 'api', issuedAt: Date.now() }
      persistSession(this.session)
      return { ok: true, session: this.session }
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'account_locked' || err.code === 'withdrawn')) return { ok: false, error: err.code }
      if (err instanceof ApiError) return { ok: false, error: 'invalid_credentials' }
      return { ok: false, error: 'network' }
    }
  }

  async logout(): Promise<void> {
    try { await api('/api/logout', { method: 'POST' }) } catch { /* already gone */ }
    this.clear()
  }

  clear() {
    this.session = null
    setToken(null)
    persistSession(null)
  }

  getSession(): AuthSession | null {
    return this.session
  }

  async verifyPassword(password: string): Promise<boolean> {
    try {
      await api('/api/verify-password', { method: 'POST', body: { password } })
      return true
    } catch {
      return false
    }
  }

  async resetPassword(_actor: AuthUser, targetUsername: string, newPassword: string) {
    try {
      await api('/api/users/reset-password', { method: 'POST', body: { username: targetUsername, newPassword } })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof ApiError ? err.code : 'network' }
    }
  }

  async listManagedUsers(): Promise<AuthUser[]> {
    try {
      return (await api<{ users: AuthUser[] }>('/api/users')).users
    } catch {
      return []
    }
  }
}

const provider = new ApiAuthProvider()

export function getAuthProvider(): ApiAuthProvider {
  return provider
}

export function syncSessionFromProvider(): AuthSession | null {
  return provider.getSession()
}
