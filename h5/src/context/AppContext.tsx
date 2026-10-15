import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { type Locale, t } from '../i18n'
import { type AppNotification, DEFAULT_NOTIFICATIONS } from '../data/mock'
import { setUnauthorizedHandler } from '../api/client'
import {
  type AuthSession,
  type AuthUser,
  type Portal,
  getAuthProvider,
  syncSessionFromProvider,
  homePathForUser,
  canAccessPortal,
  isAdmin,
} from '../auth'

const APP_STORAGE_KEY = 'careconnect_app_state'
const TASK_WISDOM_ARTICLE_ID = '1'

interface AppState {
  locale: Locale
  readArticles: string[]
  notifications: AppNotification[]
  privacyMode: boolean
}

interface AppContextValue extends AppState {
  tr: ReturnType<typeof t>
  session: AuthSession | null
  user: AuthUser | null
  wisdomRead: boolean
  unreadCount: number
  isAuthenticated: boolean
  setLocale: (l: Locale) => void
  toggleLocale: () => void
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
  resetUserPassword: (username: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>
  listManagedUsers: () => Promise<AuthUser[]>
  verifyPassword: (password: string) => Promise<boolean>
  canAccess: (portal: Portal) => boolean
  markArticleRead: (id: string) => void
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  togglePrivacyMode: () => void
}

const defaultState: AppState = {
  locale: 'zh',
  readArticles: [],
  notifications: DEFAULT_NOTIFICATIONS,
  privacyMode: true,
}

function loadAppState(): AppState {
  try {
    const raw = localStorage.getItem(APP_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        locale: parsed.locale ?? defaultState.locale,
        privacyMode: parsed.privacyMode ?? defaultState.privacyMode,
        notifications: parsed.notifications ?? DEFAULT_NOTIFICATIONS,
        readArticles: parsed.readArticles ?? [],
      }
    }
  } catch { /* ignore */ }
  return defaultState
}

function saveAppState(state: AppState) {
  localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(state))
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadAppState)
  const [session, setSession] = useState<AuthSession | null>(() => syncSessionFromProvider())

  useEffect(() => { saveAppState(state) }, [state])
  useEffect(() => {
    // Server rejected our token (expired or password reset): drop the session and go to login.
    setUnauthorizedHandler(() => {
      getAuthProvider().clear()
      setSession(null)
    })
    return () => setUnauthorizedHandler(null)
  }, [])
  useEffect(() => {
    document.documentElement.lang = state.locale === 'zh' ? 'zh-CN' : 'en'
  }, [state.locale])

  const user = session?.user ?? null

  const setLocale = useCallback((locale: Locale) => {
    setState(s => ({ ...s, locale }))
  }, [])

  const toggleLocale = useCallback(() => {
    setState(s => ({ ...s, locale: s.locale === 'zh' ? 'en' : 'zh' }))
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const result = await getAuthProvider().login(username, password)
    if (!result.ok) return { ok: false, error: result.error }
    setSession(result.session)
    return { ok: true }
  }, [])

  const logout = useCallback(async () => {
    await getAuthProvider().logout()
    setSession(null)
  }, [])

  const resetUserPassword = useCallback(async (username: string, newPassword: string) => {
    if (!user) return { ok: false, error: 'forbidden' }
    return getAuthProvider().resetPassword(user, username, newPassword)
  }, [user])

  const listManagedUsers = useCallback(async () => {
    if (!user) return []
    return getAuthProvider().listManagedUsers()
  }, [user])

  const verifyPassword = useCallback((password: string) => getAuthProvider().verifyPassword(password), [])

  const canAccess = useCallback((portal: Portal) => {
    if (!user) return false
    return canAccessPortal(user, portal)
  }, [user])

  const markArticleRead = useCallback((id: string) => {
    setState(s => ({
      ...s,
      readArticles: s.readArticles.includes(id) ? s.readArticles : [...s.readArticles, id],
    }))
  }, [])

  const markNotificationRead = useCallback((id: string) => {
    setState(s => ({
      ...s,
      notifications: s.notifications.map(n => n.id === id ? { ...n, read: true } : n),
    }))
  }, [])

  const markAllNotificationsRead = useCallback(() => {
    setState(s => ({
      ...s,
      notifications: s.notifications.map(n => ({ ...n, read: true })),
    }))
  }, [])

  const togglePrivacyMode = useCallback(() => {
    setState(s => ({ ...s, privacyMode: !s.privacyMode }))
  }, [])

  const wisdomRead = state.readArticles.includes(TASK_WISDOM_ARTICLE_ID)
  const unreadCount = state.notifications.filter(n => !n.read).length
  const tr = t(state.locale)

  return (
    <AppContext.Provider
      value={{
        ...state,
        tr,
        session,
        user,
        wisdomRead,
        unreadCount,
        isAuthenticated: !!session,
        setLocale,
        toggleLocale,
        login,
        logout,
        resetUserPassword,
        listManagedUsers,
        verifyPassword,
        canAccess,
        markArticleRead,
        markNotificationRead,
        markAllNotificationsRead,
        togglePrivacyMode,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

export { homePathForUser, isAdmin }
export type { AuthUser }
