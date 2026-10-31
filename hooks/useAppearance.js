import { useCallback, useEffect, useState } from 'react'
import { applyStyle, readStyle, storeStyle, applyDensity, readDensity, storeDensity, applyTheme, applyTextSize, clearStoredTheme, readStoredTheme, readTextSize, storeTextSize, storeTheme, systemPrefersDark, resolveTheme } from '../lib/theme.js'

// Settings-page controls: theme choice ('light' | 'dark' | 'system') and text size.
export function useAppearance() {
  const [choice, setChoice] = useState('system')
  const [text, setText] = useState('standard')
  const [density, setDensity] = useState('comfortable')
  const [look, setLook] = useState('studio')
  useEffect(() => {
    const s = readStoredTheme()
    setChoice(s === 'light' || s === 'dark' ? s : 'system')
    setText(readTextSize())
    setDensity(readDensity())
    setLook(readStyle())
  }, [])
  const chooseTheme = useCallback(c => {
    if (c === 'system') clearStoredTheme(); else storeTheme(c)
    applyTheme(resolveTheme(c === 'system' ? null : c, systemPrefersDark()))
    setChoice(c)
  }, [])
  const chooseText = useCallback(v => { storeTextSize(v); applyTextSize(v); setText(v) }, [])
  const chooseDensity = useCallback(v => { storeDensity(v); applyDensity(v); setDensity(v) }, [])
  const chooseLook = useCallback(v => { storeStyle(v); applyStyle(v); setLook(v) }, [])
  return { choice, text, density, look, chooseTheme, chooseText, chooseDensity, chooseLook }
}
