/**
 * DateInput — always shows and accepts MM/DD/YYYY, regardless of browser/OS locale.
 * `value` and `onChange` use ISO "YYYY-MM-DD" (what the database stores), so it is a drop-in
 * replacement for <input type="date">: onChange receives { target: { value } } just like a DOM event.
 * Typing auto-inserts the slashes. The calendar button opens the native picker where the browser supports it.
 */
import { useEffect, useRef, useState } from 'react'

const toDisplay = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[2]}/${m[3]}/${m[1]}` : ''
}
const toIso = (disp) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(disp)
  if (!m) return null
  const mo = +m[1], d = +m[2], y = +m[3]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (y < 1900 || y > 2100 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return `${m[3]}-${m[1]}-${m[2]}`
}
const mask = (raw) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

export function DateInput({ value, onChange, onBlur, style, disabled, className, placeholder, type, ...rest }) {
  const [draft, setDraft] = useState(toDisplay(value))
  const picker = useRef(null)

  // Follow outside changes (loading a record, form reset) without fighting the user's typing.
  useEffect(() => {
    setDraft(prev => (toIso(prev) === (value || null) || (!value && !toIso(prev) && prev === '')) ? prev : toDisplay(value))
  }, [value])

  const emit = (v) => onChange?.({ target: { value: v } })

  function handle(e) {
    const next = mask(e.target.value)
    setDraft(next)
    if (next === '') { emit(''); return }
    const iso = toIso(next)
    emit(iso || '')              // incomplete/invalid → empty, so forms never hold a stale date
  }

  const incomplete = draft.length > 0 && !toIso(draft)

  function openPicker() {
    const el = picker.current
    if (!el) return
    try { el.showPicker ? el.showPicker() : el.click() } catch { /* unsupported — typing still works */ }
  }

  return (
    <span style={{ position: 'relative', display: 'block' }}>
      <input
        {...rest}
        type="text" inputMode="numeric" autoComplete="off" maxLength={10}
        className={className} disabled={disabled}
        value={draft} placeholder={placeholder || 'MM/DD/YYYY'}
        onChange={handle} onBlur={onBlur}
        aria-invalid={incomplete || undefined}
        style={{ paddingRight: 34, ...(style || {}), ...(incomplete && draft.length === 10 ? { borderColor: 'var(--danger, #b42318)' } : {}) }}
      />
      {!disabled && (
        <>
          <button type="button" tabIndex={-1} onClick={openPicker} aria-label="Open calendar"
            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-4)', lineHeight: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </button>
          <input ref={picker} type="date" tabIndex={-1} aria-hidden="true" value={value || ''}
            onChange={e => { setDraft(toDisplay(e.target.value)); emit(e.target.value) }}
            style={{ position: 'absolute', right: 0, bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none', border: 0, padding: 0 }} />
        </>
      )}
    </span>
  )
}

export default DateInput
