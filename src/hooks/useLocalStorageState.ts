import { useState, useEffect } from 'react'

/**
 * Persisted state hook using localStorage.
 * @param key Storage key
 * @param initialValue Default value if nothing is stored
 */
export function useLocalStorageState<T>(key: string, initialValue: T) {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue
    try {
      const item = window.localStorage.getItem(key)
      return item ? (JSON.parse(item) as T) : initialValue
    } catch {
      return initialValue
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // ignore write errors
    }
  }, [key, state])

  return [state, setState] as const
}