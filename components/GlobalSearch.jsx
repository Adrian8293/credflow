/**
 * GlobalSearch.jsx — PrimeCredential
 * Inline topbar search: expands in place, results drop below. No modal/overlay.
 */

import { useRef, useState, useEffect } from 'react'
import { Badge } from './ui/Badge.jsx'
import { daysUntil } from '../lib/helpers.js'

function pName(provs, id) {
  const p = provs?.find(x => x.id === id)
  return p ? `${p.fname} ${p.lname}${p.cred ? `, ${p.cred}` : ''}` : ''
}
function payName(payers, id) {
  return payers?.find(x => x.id === id)?.name || ''
}

const SEARCH_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)
const CLOSE_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

function ResultRow({ icon, primary, secondary, badge, badgeCls, onClick, focused }) {
  return (
    <div onClick={onClick} className={`gs-row${focused ? ' gs-focused' : ''}`}>
      <div className="gs-row-icon">{icon}</div>
      <div className="gs-row-text">
        <div className="gs-row-primary">{primary}</div>
        {secondary && <div className="gs-row-secondary">{secondary}</div>}
      </div>
      {badge && <span className={`badge ${badgeCls || 'b-gray'}`}>{badge}</span>}
      <div className="gs-row-enter">↵</div>
    </div>
  )
}

const ICONS = {
  provider:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1E56F0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  enrollment: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  payer:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  document:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>,
  task:       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0891B2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
}

const STAGE_CLS = s => {
  const l = (s || '').toLowerCase()
  if (l.includes('active') || l.includes('approved')) return 'b-green'
  if (l.includes('return') || l.includes('denied'))  return 'b-red'
  if (l.includes('pending') || l.includes('waiting')) return 'b-amber'
  return 'b-blue'
}

export function GlobalSearch({ db, onClose, setPage, openProvDetail, openEnrollModal }) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(0)
  const inputRef = useRef(null)
  const wrapRef  = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Click outside closes
  useEffect(() => {
    function onClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onClose()
    }
    setTimeout(() => document.addEventListener('mousedown', onClick), 0)
    return () => document.removeEventListener('mousedown', onClick)
  }, [onClose])

  const q = query.trim().toLowerCase()

  const provs = q.length < 1 ? [] : (db.providers || []).filter(p =>
    `${p.fname} ${p.lname} ${p.cred} ${p.spec} ${p.npi} ${p.license} ${p.caqh} ${p.dea} ${p.email} ${p.phone}`.toLowerCase().includes(q)
  ).slice(0, 4)

  const enrs = q.length < 1 ? [] : (db.enrollments || []).filter(e =>
    `${pName(db.providers, e.provId)} ${payName(db.payers, e.payId)} ${e.stage}`.toLowerCase().includes(q)
  ).slice(0, 3)

  const pays = q.length < 1 ? [] : (db.payers || []).filter(p =>
    `${p.name} ${p.payerId} ${p.type}`.toLowerCase().includes(q)
  ).slice(0, 3)

  const docs = q.length < 1 ? [] : (db.documents || []).filter(d =>
    `${pName(db.providers, d.provId)} ${d.type} ${d.issuer} ${d.number}`.toLowerCase().includes(q)
  ).slice(0, 2)

  const tasks = q.length < 1 ? [] : (db.tasks || []).filter(t =>
    `${t.task} ${t.cat}`.toLowerCase().includes(q)
  ).slice(0, 2)

  const allItems = [
    ...provs.map(r  => ({ type: 'provider',   data: r })),
    ...enrs.map(r   => ({ type: 'enrollment', data: r })),
    ...pays.map(r   => ({ type: 'payer',      data: r })),
    ...docs.map(r   => ({ type: 'document',   data: r })),
    ...tasks.map(r  => ({ type: 'task',       data: r })),
  ]
  const total = allItems.length

  useEffect(() => setFocused(0), [query])

  function handleKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, total - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)) }
    if (e.key === 'Enter' && total > 0) select(allItems[focused])
  }

  function select(item) {
    if (item.type === 'provider')   { setPage('providers'); openProvDetail?.(item.data.id); onClose() }
    if (item.type === 'enrollment') { setPage('applications'); openEnrollModal?.(item.data.id); onClose() }
    if (item.type === 'payer')      { setPage('payers'); onClose() }
    if (item.type === 'document')   { setPage('documents'); onClose() }
    if (item.type === 'task')       { setPage('tasks'); onClose() }
  }

  const hasResults = total > 0

  return (
    <div ref={wrapRef} className="gs-wrap">
      {/* Input */}
      <div className="gs-input-row">
        <span className="gs-search-icon">{SEARCH_ICON}</span>
        <input
          ref={inputRef}
          className="gs-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Search providers, applications, payers…"
          autoComplete="off"
        />
        {query && (
          <button className="gs-clear" onClick={() => setQuery('')}>{CLOSE_ICON}</button>
        )}
        <kbd className="gs-kbd">Esc</kbd>
      </div>

      {/* Dropdown results */}
      {query && (
        <div className="gs-dropdown">
          {!hasResults && (
            <div className="gs-empty">No results for "<strong>{query}</strong>"</div>
          )}

          {provs.length > 0 && (
            <div className="gs-section">
              <div className="gs-section-label">Providers</div>
              {provs.map((p, i) => {
                const idx = allItems.findIndex(x => x.type === 'provider' && x.data.id === p.id)
                return (
                  <ResultRow key={p.id} icon={ICONS.provider}
                    primary={`${p.fname} ${p.lname}${p.cred ? `, ${p.cred}` : ''}`}
                    secondary={[p.spec, p.npi ? `NPI ${p.npi}` : null].filter(Boolean).join(' · ')}
                    badge={p.status} badgeCls={p.status === 'Active' ? 'b-green' : p.status === 'Inactive' ? 'b-gray' : 'b-amber'}
                    focused={focused === idx} onClick={() => select({ type: 'provider', data: p })} />
                )
              })}
            </div>
          )}

          {enrs.length > 0 && (
            <div className="gs-section">
              <div className="gs-section-label">Applications</div>
              {enrs.map((e, i) => {
                const idx = allItems.findIndex(x => x.type === 'enrollment' && x.data.id === e.id)
                return (
                  <ResultRow key={e.id} icon={ICONS.enrollment}
                    primary={`${pName(db.providers, e.provId)} → ${payName(db.payers, e.payId)}`}
                    secondary={e.stage}
                    badge={e.stage} badgeCls={STAGE_CLS(e.stage)}
                    focused={focused === idx} onClick={() => select({ type: 'enrollment', data: e })} />
                )
              })}
            </div>
          )}

          {pays.length > 0 && (
            <div className="gs-section">
              <div className="gs-section-label">Payers</div>
              {pays.map(p => {
                const idx = allItems.findIndex(x => x.type === 'payer' && x.data.id === p.id)
                return (
                  <ResultRow key={p.id} icon={ICONS.payer}
                    primary={p.name} secondary={[p.payerId, p.type].filter(Boolean).join(' · ')}
                    focused={focused === idx} onClick={() => select({ type: 'payer', data: p })} />
                )
              })}
            </div>
          )}

          {docs.length > 0 && (
            <div className="gs-section">
              <div className="gs-section-label">Documents</div>
              {docs.map(d => {
                const idx = allItems.findIndex(x => x.type === 'document' && x.data.id === d.id)
                const days = daysUntil(d.exp)
                return (
                  <ResultRow key={d.id} icon={ICONS.document}
                    primary={`${d.type || 'Document'} — ${pName(db.providers, d.provId)}`}
                    secondary={days !== null ? (days < 0 ? `Expired ${Math.abs(days)}d ago` : `Expires in ${days}d`) : null}
                    badge={days !== null && days < 0 ? 'Expired' : days !== null && days < 30 ? 'Expiring' : null}
                    badgeCls={days !== null && days < 0 ? 'b-red' : 'b-amber'}
                    focused={focused === idx} onClick={() => select({ type: 'document', data: d })} />
                )
              })}
            </div>
          )}

          {tasks.length > 0 && (
            <div className="gs-section">
              <div className="gs-section-label">Tasks</div>
              {tasks.map(t => {
                const idx = allItems.findIndex(x => x.type === 'task' && x.data.id === t.id)
                return (
                  <ResultRow key={t.id} icon={ICONS.task}
                    primary={t.task || 'Task'} secondary={t.cat}
                    badge={t.status} badgeCls={t.status === 'Done' ? 'b-green' : 'b-blue'}
                    focused={focused === idx} onClick={() => select({ type: 'task', data: t })} />
                )
              })}
            </div>
          )}

          {/* Keyboard hint */}
          <div className="gs-footer">
            <span><kbd>↑↓</kbd> navigate</span>
            <span><kbd>↵</kbd> select</span>
            <span><kbd>Esc</kbd> close</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default GlobalSearch
