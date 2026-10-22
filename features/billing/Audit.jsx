/**
 * Audit.jsx — Lacentra
 * Full audit trail with search, type filtering, and compliance export.
 */

import { useMemo, useState } from 'react'
import { fmtTS } from '../../lib/helpers.js'
import { DateInput } from '../../components/ui/DateInput.jsx'
import { csvFromRows, downloadCsv } from '../../lib/csv.js'
import { Badge } from '../../components/ui/Badge.jsx'

const TYPE_COLOR = {
  Provider:   'b-purple',
  Enrollment: 'b-blue',
  Document:   'b-teal',
  Task:       'b-green',
  Payer:      'b-gold',
  Settings:   'b-gray',
}

const TYPE_ICON = {
  Provider:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Enrollment: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg>,
  Document:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>,
  Task:       <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  Payer:      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  Settings:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M20.49 12H22M2 12h1.51M19.07 19.07l-1.41-1.41M5.34 5.34L3.93 3.93M12 20.49V22M12 2v1.51"/></svg>,
}


const PAGE = 200
const LOAD_LIMIT = 500   // fetchAuditLog() loads the newest 500 entries

const localDay = (ts) => {
  const d = new Date(ts)
  if (isNaN(d)) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// "jane.doe@x.com" -> "Jane D."; empty -> "System"
function who(a) {
  const raw = a.userEmail || ''
  if (!raw) return { name: 'System', letter: 'S' }
  const local = raw.split('@')[0]
  const parts = local.split(/[._-]/).filter(Boolean)
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1)
  const name = parts.length >= 2 ? `${cap(parts[0])} ${parts[1].charAt(0).toUpperCase()}.` : cap(local)
  return { name, letter: name.charAt(0) }
}

function exportAuditCSV(list) {
  const rows = [['Timestamp', 'Type', 'Action', 'Detail', 'User', 'Entity']]
  list.forEach(a => rows.push([a.ts || '', a.type, a.action, a.detail, a.userEmail || 'System', a.entity]))
  downloadCsv('audit_log_' + localDay(Date.now()) + '.csv', csvFromRows(rows))
}

export function Audit({ db, search, setSearch, fType, setFType }) {
  const [fUser, setFUser] = useState('')
  const [from, setFrom]   = useState('')
  const [to, setTo]       = useState('')
  const [shown, setShown] = useState(PAGE)

  const all = db.auditLog
  const users = useMemo(() => [...new Set(all.map(a => a.userEmail).filter(Boolean))].sort(), [all])
  const types = useMemo(() => [...new Set(all.map(a => a.type).filter(Boolean))].sort(), [all])
  const typeCounts = useMemo(() => {
    const c = {}; all.forEach(a => { c[a.type] = (c[a.type] || 0) + 1 }); return c
  }, [all])

  const q = (search || '').toLowerCase()
  const list = useMemo(() => all.filter(a =>
    (!q || `${a.type} ${a.action} ${a.detail} ${a.userEmail}`.toLowerCase().includes(q)) &&
    (!fType || a.type === fType) &&
    (!fUser || a.userEmail === fUser) &&
    (!from || localDay(a.ts) >= from) &&
    (!to || localDay(a.ts) <= to)
  ), [all, q, fType, fUser, from, to])

  const filtered = !!(search || fType || fUser || from || to)
  const clearAll = () => { setSearch(''); setFType(''); setFUser(''); setFrom(''); setTo(''); setShown(PAGE) }
  const visible = list.slice(0, shown)

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.03em', marginBottom: 3 }}>Audit Trail</h2>
          <p style={{ fontSize: 13, color: 'var(--text-4)' }}>Who changed what, and when. Entries can’t be edited or deleted from the app.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ padding: '6px 12px', background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.2)', borderRadius: 'var(--r)', fontSize: 11.5, color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Append-only
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => exportAuditCSV(list)} disabled={!list.length} title="Download the entries currently shown as CSV">↓ Export CSV</button>
        </div>
      </div>

      {all.length >= LOAD_LIMIT && (
        <div style={{ marginBottom: 14, padding: '8px 12px', background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--text-2)' }}>
          Showing the most recent {LOAD_LIMIT} entries. Older entries are kept in the database but not loaded here. Export regularly if you need a longer history.
        </div>
      )}

      {Object.keys(typeCounts).length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {Object.entries(typeCounts).map(([type, count]) => {
            const on = fType === type
            return (
              <button key={type} onClick={() => { setFType(on ? '' : type); setShown(PAGE) }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: on ? 'var(--pr-bg, rgba(21,101,192,.08))' : 'var(--elevated)', border: `1.5px solid ${on ? 'var(--pr)' : 'var(--border)'}`, borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit' }}>
                <span style={{ color: on ? 'var(--pr)' : 'var(--text-3)', display: 'flex' }}>{TYPE_ICON[type]}</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: on ? 'var(--pr)' : 'var(--text-2)' }}>{type || 'Other'}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: on ? 'var(--pr)' : 'var(--text-4)' }}>{count}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="search-box">
          <span className="si">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setShown(PAGE) }} placeholder="Search audit log…" />
        </div>
        <select className="filter-select" value={fType} onChange={e => { setFType(e.target.value); setShown(PAGE) }}>
          <option value="">All types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="filter-select" value={fUser} onChange={e => { setFUser(e.target.value); setShown(PAGE) }}>
          <option value="">All users</option>
          {users.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-4)' }}>
          From <DateInput value={from} onChange={e => { setFrom(e.target.value); setShown(PAGE) }} style={{ width: 150, minWidth: 140 }} />
          To <DateInput value={to} onChange={e => { setTo(e.target.value); setShown(PAGE) }} style={{ width: 150, minWidth: 140 }} />
        </div>
        {filtered && <button onClick={clearAll} style={{ fontSize: 12, color: 'var(--pr)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Clear ×</button>}
        <div className="toolbar-right">
          <span style={{ fontSize: 12, color: 'var(--text-4)' }}>{list.length} entries</span>
        </div>
      </div>

      <div className="tbl-wrap">
        {!list.length ? (
          <div className="empty-state">
            <div className="empty-state-title">{filtered ? 'No matching entries' : 'No audit events yet'}</div>
            <div className="empty-state-desc">{filtered ? 'Try adjusting your search or filters.' : 'Audit events are recorded automatically as you use Lacentra.'}</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Type</th>
                <th>Action</th>
                <th>Detail</th>
                <th>User</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a, i) => {
                const u = who(a)
                return (
                  <tr key={a.id || i}>
                    <td style={{ fontSize: 11.5, color: 'var(--text-4)', fontFamily: 'var(--fn-mono)', whiteSpace: 'nowrap' }}>{a.ts ? fmtTS(a.ts) : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ color: 'var(--text-3)' }}>{TYPE_ICON[a.type]}</span>
                        <Badge cls={TYPE_COLOR[a.type] || 'b-gray'}>{a.type || '—'}</Badge>
                      </div>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: 12.5 }}>{a.action || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-3)', maxWidth: 320 }}>
                      <span title={a.detail} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.detail || '—'}</span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-4)' }} title={a.userEmail || 'Recorded by the system'}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--pr)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{u.letter}</div>
                        <span>{u.name}</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {list.length > shown && (
          <div style={{ padding: '10px 16px', textAlign: 'center', borderTop: '1px solid var(--border-l)' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShown(n => n + PAGE)}>Show {Math.min(PAGE, list.length - shown)} more ({list.length - shown} left)</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default Audit
