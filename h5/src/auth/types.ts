/** Portal access for external users; admins may enter any portal from the admin hub. */
export type Portal = 'patient' | 'clinical' | 'research'

/** Coarse roles — designed to map 1:1 to future Logto organization roles. */
export type AdminRole = 'system_admin' | 'org_admin' | 'external_user'

export interface AuthUser {
  username: string
  role: AdminRole
  displayNameZh: string
  displayNameEn: string
  /** External users are bound to one portal; admins use the hub. */
  portal: Portal | null
  organizationId: string
  /** Patient logins are linked to one study participant. */
  participantId?: string | null
}

export interface AuthSession {
  user: AuthUser
  provider: 'api' | 'logto'
  issuedAt: number
}

export type LoginResult =
  | { ok: true; session: AuthSession }
  | { ok: false; error: 'invalid_credentials' | 'account_locked' | 'withdrawn' | 'network' }

export interface AuthProvider {
  readonly name: 'api' | 'logto'
  login(username: string, password: string): Promise<LoginResult>
  logout(): Promise<void>
  getSession(): AuthSession | null
  /** Only system_admin and org_admin may reset passwords. */
  resetPassword(actor: AuthUser, targetUsername: string, newPassword: string): Promise<{ ok: boolean; error?: string }>
  listManagedUsers(actor: AuthUser): Promise<AuthUser[]>
  /** Re-check the signed-in user's password before a sensitive action (e.g. editing patient answers). */
  verifyPassword(password: string): Promise<boolean>
}

export function isAdmin(role: AdminRole): boolean {
  return role === 'system_admin' || role === 'org_admin'
}

export function canAccessPortal(user: AuthUser, portal: Portal): boolean {
  if (isAdmin(user.role)) return true
  return user.portal === portal
}

export function homePathForUser(user: AuthUser): string {
  if (isAdmin(user.role)) return '/admin'
  switch (user.portal) {
    case 'patient': return '/patient/home'
    case 'clinical': return '/clinical/cohort'
    case 'research': return '/research/analytics'
    default: return '/login'
  }
}
