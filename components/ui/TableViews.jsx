/**
 * TableViews — "Columns" and "Views" buttons for a table toolbar.
 *   Columns: tick the columns you want. Views: one-click presets (column sets and filters) plus your own saved views.
 * Everything is remembered in this browser only.
 */
import { useEffect, useId, useRef, useState } from 'react'

const pop = { position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 60, minWidth: 250, maxWidth: 320, background: 'var(--card)', border: '1px solid var(--border-mid)', borderRadius: 'var(--r-lg)', boxShadow: '0 12px 32px rgba(15,23,42,.16)', padding: 10 }
const row = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px', fontSize: 13, borderRadius: 6 }

// One button + one dialog. Owns its own open state and ref; clicking anywhere else (including the other
// popover's button) or pressing Escape closes it.
function Pop({ button, label, children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const away = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const esc = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="btn btn-secondary btn-sm" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(o => !o)}>{button}</button>
      {open && <div role="dialog" aria-label={label} style={pop}>{children(() => setOpen(false))}</div>}
    </div>
  )
}

export function TableViews({ tv, builtIns = [], getFilters, setFilters }) {
  const [name, setName] = useState('')
  const nameId = useId()
  const sub = { fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-3)' }

  function apply(v, close) {
    if (v.columns) tv.showOnly(v.columns)
    if (v.filters !== undefined && setFilters) setFilters(v.filters)
    close()
  }
  function save(close) {
    if (!name.trim()) return
    tv.saveView(name, getFilters ? getFilters() : undefined)
    setName(''); close()
  }

  return (
    <div style={{ display: 'inline-flex', gap: 6 }}>
      <Pop label="Choose columns" button={<>Columns <span style={{ fontWeight: 700 }}>{tv.visibleCount}/{tv.columns.length}</span></>}>
        {() => (
          <>
            {tv.columns.map(c => (
              <label key={c.id} style={{ ...row, cursor: c.locked ? 'default' : 'pointer', color: c.locked ? 'var(--text-4)' : 'var(--text-1)' }}>
                <input type="checkbox" checked={tv.isOn(c.id)} disabled={c.locked} onChange={() => tv.toggle(c.id)} />
                {c.label}{c.locked && <span style={{ fontSize: 11, marginLeft: 'auto' }}>always shown</span>}
              </label>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={tv.reset}>Reset to default</button>
          </>
        )}
      </Pop>

      <Pop label="Views" button={<>Views{tv.saved.length ? <span style={{ fontWeight: 700 }}> {tv.saved.length}</span> : null}</>}>
        {close => (
          <>
            {builtIns.length > 0 && <div style={{ ...sub, padding: '2px 6px' }}>Ready-made</div>}
            {builtIns.map(v => <button key={v.name} type="button" className="btn btn-ghost btn-sm" style={{ display: 'block', width: '100%', textAlign: 'left' }} onClick={() => apply(v, close)}>{v.name}</button>)}
            {tv.saved.length > 0 && <div style={{ ...sub, padding: '8px 6px 2px' }}>Your views</div>}
            {tv.saved.map(v => (
              <div key={v.name} style={{ display: 'flex', alignItems: 'center' }}>
                <button type="button" className="btn btn-ghost btn-sm" style={{ flex: 1, textAlign: 'left' }} onClick={() => apply(v, close)}>{v.name}</button>
                <button type="button" className="btn btn-ghost btn-sm" aria-label={`Delete the view ${v.name}`} onClick={() => tv.deleteView(v.name)}>×</button>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--border-l)', marginTop: 8, paddingTop: 8 }}>
              <label htmlFor={nameId} style={{ fontSize: 12, color: 'var(--text-3)' }}>Save the current columns and filters as…</label>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <input id={nameId} type="text" value={name} maxLength={40} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(close) }} placeholder="e.g. My follow-ups" style={{ flex: 1, minWidth: 0 }} />
                <button type="button" className="btn btn-primary btn-sm" disabled={!name.trim()} onClick={() => save(close)}>Save</button>
              </div>
            </div>
          </>
        )}
      </Pop>
    </div>
  )
}
