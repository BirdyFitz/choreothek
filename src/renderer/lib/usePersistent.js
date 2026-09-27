import { useState } from 'react'
import { readSetting, writeSetting } from './storage.js'

// Zustand, der über Neustarts gemerkt wird (Bereiche ein/aus, Breiten …)
export function usePersistent(key, fallback) {
  const [value, setValue] = useState(() => readSetting(key, fallback))
  const update = (next) => {
    setValue((current) => {
      const resolved = typeof next === 'function' ? next(current) : next
      writeSetting(key, resolved)
      return resolved
    })
  }
  return [value, update]
}
