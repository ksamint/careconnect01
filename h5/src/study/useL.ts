import { useCallback } from 'react'
import { useApp } from '../context/AppContext'

/** Inline bilingual text for study screens: L('中文', 'English'). */
export function useL() {
  const { locale } = useApp()
  return useCallback((zh: string, en: string) => (locale === 'zh' ? zh : en), [locale])
}
