/**
 * Audit.jsx — PrimeCredential
 * Full audit trail with search, type filtering, and compliance export.
 */

import { fmtTS } from '../../lib/helpers.js'
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


function exportAuditCSV(list) {
  const headers = ['Timestamp', 'Type', 'Action', 'Detail', 'Entity ID']
  const rows = list.map(a => [
    a.ts ? new Date(a.ts).toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '',
    a.type || '',
    a.action || '',
    (a.detail || '').replace(/,/g, ';'),
    a.entityId || '',
  ])
  const csv = [headers, ...rows].map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = 'audit_log_' + new Date().toISOString().split('T')[0] + '.csv'
  a.click(); URL.revokeObjectURL(url)
}

export function Audit({ db, search, setSearch, fType, setFType, handleClearAudit }) {
  const list = db.auditLog.filter(a =>
    `${a.type} ${a.action} ${a.detail}`.toLowerCase().includes(search.toLowerCase()) &&
    (!fType || a.type === fType)
  )

  const typeCounts = {}
  db.auditLog.forEach(a => { typeCounts[a.type] = (typeCounts[a.type] || 0) + 1 })

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.03em', marginBottom: 3 }}>Audit Trail</h2>
          <p style={{ fontSize: 13, color: 'var(--text-4)' }}>Immutable, append-only activity log for compliance and governance in PrimeCredential.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ padding: '6px 12px', background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.2)', borderRadius: 'var(--r)', fontSize: 11.5, color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Tamper-proof
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => exportAuditCSV(list)} title="Download filtered audit entries as CSV">↓ Export CSV</button>
          <button className="btn btn-danger btn-sm" onClick={handleClearAudit} title="Permanently clear all audit entries — export first!">Clear Log</button>
        </div>
      </div>

      {/* Summary badges */}
      {Object.keys(typeCounts).length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {Object.entries(typeCounts).map(([type, count]) => (
            <div key={type} onClick={() => setFType(fType === type ? '' : type)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: fType === type ? 'var(--pr-l)' : 'var(--elevated)', border: `1.5px solid ${fType === type ? 'rgba(30,86,240,.3)' : 'var(--border)'}`, borderRadius: 'var(--r-pill)', cursor: 'pointer', transition: 'all .14s' }}>
              <span style={{ color: fType === type ? 'var(--pr)' : 'var(--text-3)' }}>{TYPE_ICON[type]}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: fType === type ? 'var(--pr)' : 'var(--text-2)' }}>{type}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: fType === type ? 'var(--pr)' : 'var(--text-4)', background: fType === type ? 'rgba(30,86,240,.12)' : 'var(--card)', padding: '1px 6px', borderRadius: 10 }}>{count}</span>
            </div>
          ))}
          {fType && <button onClick={() => setFType('')} style={{ fontSize: 11.5, color: 'var(--pr)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear filter ×</button>}
        </div>
      )}

      <div className="toolbar">
        <div className="search-box">
          <span className="si">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search audit log…" />
        </div>
        <select className="filter-select" value={fType} onChange={e => setFType(e.target.value)}>
          <option value="">All Action Types</option>
          {['Provider','Enrollment','Document','Task','Payer','Settings'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="toolbar-right">
          <span style={{ fontSize: 12, color: 'var(--text-4)' }}>{list.length} entries</span>
        </div>
      </div>

      <div className="tbl-wrap">
        {!list.length ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E56F0" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </div>
            <div className="empty-state-title">{search || fType ? 'No matching entries' : 'No audit events yet'}</div>
            <div className="empty-state-desc">{search || fType ? 'Try adjusting your search or filter.' : 'Audit events are recorded automatically as you use PrimeCredential.'}</div>
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
              {list.map((a, i) => (
                <tr key={i}>
                  <td style={{ fontSize: 11.5, color: 'var(--text-4)', fontFamily: 'var(--fn-mono)', whiteSpace: 'nowrap' }}>
                    {fmtTS ? fmtTS(a.ts) : a.ts ? new Date(a.ts).toLocaleString() : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ color: 'var(--text-3)' }}>{TYPE_ICON[a.type]}</span>
                      <Badge cls={TYPE_COLOR[a.type] || 'b-gray'}>{a.type || '—'}</Badge>
                    </div>
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: 12.5 }}>{a.action || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-3)', maxWidth: 320 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.detail || '—'}</span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {(() => {
                        const raw = a.user || a.email || ''
                        // Format: "First L." from "First Last" or email
                        let display = 'System'
                        let avatarLetter = 'S'
                        if (raw) {
                          // Check if it looks like an email
                          if (raw.includes('@')) {
                            const localPart = raw.split('@')[0]
                            // Try to parse "firstname.lastname" or "firstlast"
                            const parts = localPart.split('.')
                            if (parts.length >= 2) {
                              const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
                              const lastInit = parts[1].charAt(0).toUpperCase()
                              display = `${first} ${lastInit}.`
                            } else {
                              display = localPart.charAt(0).toUpperCase() + localPart.slice(1)
                            }
                            avatarLetter = localPart.charAt(0).toUpperCase()
                          } else {
                            // Assume "First Last" format
                            const parts = raw.trim().split(/\s+/)
                            if (parts.length >= 2) {
                              const lastInit = parts[parts.length - 1].charAt(0).toUpperCase()
                              display = `${parts[0]} ${lastInit}.`
                            } else {
                              display = raw
                            }
                            avatarLetter = raw.charAt(0).toUpperCase()
                          }
                        }
                        return (
                          <>
                            <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--pr)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8.5, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                              {avatarLetter}
                            </div>
                            <span>{display}</span>
                          </>
                        )
                      })()}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default Audit
