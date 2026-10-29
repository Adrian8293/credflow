import { useCallback, useEffect, useState } from 'react'
import { applyTheme, applyTextSize, clearStoredTheme, readStoredTheme, readTextSize, storeTextSize, storeTheme, systemPrefersDark, resolveTheme } from '../lib/theme.js'

// Settings-page controls: theme choice ('light' | 'dark' | 'system') and text size.
export function useAppearance() {
  const [choice, setChoice] = useState('system')
  const [text, setText] = useState('standard')
  useEffect(() => {
    const s = readStoredTheme()
    setChoice(s === 'light' || s === 'dark' ? s : 'system')
    setText(readTextSize())
  }, [])
  const chooseTheme = useCallback(c => {
    if (c === 'system') clearStoredTheme(); else storeTheme(c)
    applyTheme(resolveTheme(c === 'system' ? null : c, systemPrefersDark()))
    setChoice(c)
  }, [])
  const chooseText = useCallback(v => { storeTextSize(v); applyTextSize(v); setText(v) }, [])
  return { choice, text, chooseTheme, chooseText }
}
