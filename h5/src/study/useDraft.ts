import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'

interface Stored<T> {
  data: T
  updatedAt: string
}

const PREFIX = 'careconnect_draft:'
const SERVER_DEBOUNCE_MS = 800

/**
 * Autosaves in-progress answers on every change: instantly to this device,
 * and (debounced) to the server so the patient can resume on another phone.
 * Returns the restored draft once loaded (newest of device / server copy).
 */
export function useDraft<T>(key: string | null) {
  const [loaded, setLoaded] = useState<{ key: string; data: T | null } | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!key) return
    let cancelled = false
    let local: Stored<T> | null = null
    try {
      local = JSON.parse(localStorage.getItem(PREFIX + key) ?? 'null')
    } catch { /* ignore */ }
    api<{ draft: Stored<T> | null }>(`/api/drafts/${encodeURIComponent(key)}`)
      .then(({ draft }) => {
        if (cancelled) return
        const best = [local, draft].filter((x): x is Stored<T> => !!x).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0]
        setLoaded({ key, data: best?.data ?? null })
      })
      .catch(() => { if (!cancelled) setLoaded({ key, data: local?.data ?? null }) })
    return () => { cancelled = true }
  }, [key])

  const ready = !key || loaded?.key === key
  const restored = loaded?.key === key ? loaded.data : null

  const save = useCallback((data: T) => {
    if (!key) return
    const stored: Stored<T> = { data, updatedAt: new Date().toISOString() }
    try { localStorage.setItem(PREFIX + key, JSON.stringify(stored)) } catch { /* ignore */ }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      api(`/api/drafts/${encodeURIComponent(key)}`, { method: 'PUT', body: { data } }).catch(() => { /* device copy is kept */ })
    }, SERVER_DEBOUNCE_MS)
  }, [key])

  const clear = useCallback(() => {
    if (!key) return
    window.clearTimeout(timer.current)
    try { localStorage.removeItem(PREFIX + key) } catch { /* ignore */ }
    api(`/api/drafts/${encodeURIComponent(key)}`, { method: 'DELETE' }).catch(() => { /* server clears on submit */ })
  }, [key])

  return { ready, restored, save, clear }
}

export function draftKey(participantId: string, cycleNo: number, visitLabel: string) {
  return `${participantId}:${cycleNo}:${visitLabel}`
}
