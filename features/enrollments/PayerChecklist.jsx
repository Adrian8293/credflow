import { useEffect, useMemo, useState } from 'react'
import { buildChecklist } from '../../lib/payerChecklist.js'
import { fetchChecklist, setChecklistItem } from '../../lib/db'

const ICON = { ok: '✓', na: '–', warn: '!', bad: '✕', manual: '' }
const COLOR = { ok: 'var(--green)', na: 'var(--text-4)', warn: 'var(--amber)', bad: 'var(--red)', manual: 'var(--text-4)' }

export function PayerChecklist({ title, guidelines, provider, documents, enrollmentId, onDismiss }) {
  const [manual, setManual] = useState({})
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    setManual({})
    if (!enrollmentId) return
    fetchChecklist(enrollmentId).then(m => live && setManual(m)).catch(() => live && setError('Manual tick-offs unavailable. Run supabase-migration-010-enrollment-checklist.sql.'))
    return () => { live = false }
  }, [enrollmentId])

  const items = useMemo(() => buildChecklist(guidelines, provider, documents, manual), [guidelines, provider, documents, manual])
  const ready = items.filter(i => i.done).length

  async function toggle(it) {
    if (!enrollmentId) return
    const next = !it.ticked
    setManual(m => ({ ...m, [it.key]: next }))
    try { await setChecklistItem(enrollmentId, it.key, next); setError('') }
    catch { setManual(m => ({ ...m, [it.key]: !next })); setError('Could not save. Run supabase-migration-010-enrollment-checklist.sql if you have not yet.') }
  }

  return (
    <div style={{ background: 'var(--primary-ll)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--pr)' }}>
          {title} · {provider ? `${ready}/${items.length} ready` : 'Required items'}
        </span>
        <button type="button" onClick={onDismiss} className="x-hide" aria-label="Hide this checklist">Hide</button>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map(it => {
          const st = it.done && it.status !== 'ok' && it.status !== 'na' ? 'ok' : it.status
          return (
            <li key={it.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13.5, color: 'var(--text-2)', padding: '4px 0' }}>
              <button
                type="button" onClick={() => it.status !== 'ok' && it.status !== 'na' && toggle(it)}
                disabled={!enrollmentId || it.status === 'ok' || it.status === 'na'}
                aria-label={`Mark ${it.text} ${it.ticked ? 'not done' : 'done'}`}
                style={{ width: 26, height: 26, fontSize: 15, fontWeight: 700, flexShrink: 0, borderRadius: 4, border: `1.5px solid ${COLOR[st]}`, background: st === 'ok' ? COLOR.ok : 'var(--card)', color: st === 'ok' ? '#fff' : COLOR[st], fontSize: 11, fontWeight: 700, lineHeight: 1, cursor: it.status === 'manual' || it.status === 'warn' || it.status === 'bad' ? 'pointer' : 'default', padding: 0 }}
              >{st === 'ok' ? '✓' : ICON[st]}</button>
              <span style={{ flex: 1, textDecoration: it.ticked && it.status === 'manual' ? 'line-through' : 'none' }}>
                {it.text}
                {provider && it.note && <span style={{ color: COLOR[it.done ? 'ok' : it.status], marginLeft: 6, fontSize: 11.5 }}>{it.ticked && it.status !== 'manual' ? 'Marked done manually' : it.note}</span>}
              </span>
            </li>
          )
        })}
      </ul>
      {!enrollmentId && provider && <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 8 }}>Save the enrollment to tick off manual steps.</div>}
      {error && <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 8 }}>{error}</div>}
    </div>
  )
}
