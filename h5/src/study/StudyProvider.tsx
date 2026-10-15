import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, ApiError, isNetworkError } from '../api/client'
import { StudyContext, type OpName, type OpResult } from './useStudy'
import type { StudyData } from './types'

const OUTBOX_KEY = 'careconnect_outbox'
const OUTBOX_FAILED_KEY = 'careconnect_outbox_failed'
const POLL_MS = 20_000

interface QueuedSubmit {
  payload: Record<string, unknown>
  queuedAt: string
}

function readList<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]') as T[]
  } catch {
    return []
  }
}

function writeList<T>(key: string, list: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch { /* storage unavailable */ }
}

export function StudyProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [data, setData] = useState<StudyData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [pendingCount, setPendingCount] = useState(() => readList<QueuedSubmit>(OUTBOX_KEY).length)
  const flushing = useRef(false)

  const refresh = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    try {
      setData(await api<StudyData>('/api/study'))
      setError(null)
      setOnline(true)
    } catch (err) {
      if (isNetworkError(err)) setOnline(false)
      setError(err instanceof ApiError ? err.code : 'network')
    } finally {
      setLoading(false)
    }
  }, [enabled])

  const flushOutbox = useCallback(async () => {
    if (flushing.current) return
    flushing.current = true
    try {
      let queue = readList<QueuedSubmit>(OUTBOX_KEY)
      while (queue.length) {
        const item = queue[0]
        try {
          const res = await api<{ study: StudyData }>('/api/ops', { method: 'POST', body: { op: 'submit', payload: item.payload } })
          setData(res.study)
        } catch (err) {
          if (isNetworkError(err)) break
          // Rejected by the server (e.g. already submitted). Keep it aside rather than losing it.
          if (!(err instanceof ApiError && err.code === 'already_submitted')) {
            writeList(OUTBOX_FAILED_KEY, [...readList(OUTBOX_FAILED_KEY), { ...item, error: err instanceof ApiError ? err.code : 'unknown' }])
          }
        }
        queue = queue.slice(1)
        writeList(OUTBOX_KEY, queue)
        setPendingCount(queue.length)
      }
    } finally {
      flushing.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    const tick = () => {
      if (document.visibilityState === 'visible') {
        void flushOutbox()
        void refresh()
      }
    }
    tick()
    const id = window.setInterval(tick, POLL_MS)
    const goOnline = () => { setOnline(true); tick() }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [enabled, refresh, flushOutbox])

  const mutate = useCallback(async <R,>(op: OpName, payload: unknown, password?: string): Promise<OpResult<R>> => {
    try {
      const res = await api<{ result: R; study: StudyData }>('/api/ops', { method: 'POST', body: { op, payload, password } })
      setData(res.study)
      setOnline(true)
      return { ok: true, result: res.result }
    } catch (err) {
      if (isNetworkError(err)) {
        setOnline(false)
        return { ok: false, error: 'network', extra: {} }
      }
      if (err instanceof ApiError) return { ok: false, error: err.code, extra: err.extra }
      return { ok: false, error: 'unknown', extra: {} }
    }
  }, [])

  const submitSurvey = useCallback(async (payload: Record<string, unknown>) => {
    const res = await mutate<{ submissionId?: string }>('submit', payload)
    if (res.ok || res.error !== 'network') return res
    const queue = [...readList<QueuedSubmit>(OUTBOX_KEY), { payload, queuedAt: new Date().toISOString() }]
    writeList(OUTBOX_KEY, queue)
    setPendingCount(queue.length)
    return { ok: true as const, result: {}, queued: true }
  }, [mutate])

  return (
    <StudyContext.Provider value={{ data: enabled ? data : null, loading, error, online, pendingCount, refresh, mutate, submitSurvey }}>
      {children}
    </StudyContext.Provider>
  )
}
