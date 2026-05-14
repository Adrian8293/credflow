/**
 * Documents.jsx — Lacentra
 * Redesigned document table: expiry urgency bars, file attachment indicators,
 * provider avatars, and visual status system.
 */

import { useState } from 'react'
import { useSorted } from '../../hooks/useSorted.js'
import { NO_EXPIRY_TYPES } from '../../hooks/useDocumentActions.js'
import { DocViewerModal } from './DocViewerModal.jsx'
import { daysUntil, fmtDate, pName, pNameShort } from '../../lib/helpers.js'

const SearchIcon  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const FileIcon    = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
const LinkIcon    = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
const PlusIcon    = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const AlertIcon   = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>

const DOC_COLORS = {
  'License':              '#1565C0',
  'Malpractice':          '#dc2626',
  'DEA':                  '#7c3aed',
  'CAQH Attestation':     '#059669',
  'Recredentialing':      '#d97706',
  'Supervision Agreement':'#0891b2',
  'NPI Letter':           '#374151',
  'W-9':                  '#6b7280',
  'CV / Resume':          '#92400e',
  'Other':                '#4b5563',
}

function docColor(type) { return DOC_COLORS[type] || DOC_COLORS['Other'] }

function ExpiryStatus({ days }) {
  if (days === null) return { label: 'No Date', cls: 'b-gray', color: 'var(--text-4)', bg: 'var(--elevated)', urgency: 0 }
  if (days < 0)   return { label: 'Expired',         cls: 'b-red',   color: '#dc2626', bg: 'rgba(220,38,38,.07)',  urgency: 4 }
  if (days <= 30) return { label: `${days}d — Critical`, cls: 'b-red',  color: '#dc2626', bg: 'rgba(220,38,38,.05)',  urgency: 3 }
  if (days <= 90) return { label: `${days}d — Expiring`, cls: 'b-amber', color: '#d97706', bg: 'rgba(217,119,6,.05)',  urgency: 2 }
  return                 { label: `${days}d`,          cls: 'b-green', color: 'var(--success)', bg: 'rgba(16,185,129,.05)', urgency: 1 }
}

// Mini urgency bar — fills red as expiry approaches
function UrgencyBar({ days, maxDays = 365 }) {
  if (days === null) return null
  const pct   = days < 0 ? 100 : Math.min((1 - days / maxDays) * 100, 100)
  const color = days < 0 ? '#ef4444' : days <= 30 ? '#ef4444' : days <= 90 ? '#f59e0b' : '#10b981'
  return (
    <div style={{ height: 3, background: 'var(--border-l)', borderRadius: 2, marginTop: 5, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width .3s' }} />
    </div>
  )
}

function ProviderChip({ providers, provId }) {
  const p = providers.find(x => x.id === provId)
  if (!p) return <span style={{ color: 'var(--text-4)' }}>—</span>
  const ini = ((p.fname||'')[0]||'') + ((p.lname||'')[0]||'')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--pr-l)', border: '1.5px solid rgba(21,101,192,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 800, color: 'var(--pr)', flexShrink: 0, letterSpacing: '-.01em' }}>
        {ini}
      </div>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.2 }}>
          {p.fname} {p.lname}
        </div>
        {p.cred && <div style={{ fontSize: 10.5, color: 'var(--text-4)' }}>{p.cred}</div>}
      </div>
    </div>
  )
}

function DocTypePill({ type }) {
  const color = docColor(type)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 6,
      background: `${color}12`, border: `1px solid ${color}30`,
      fontSize: 11.5, fontWeight: 700, color,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
      {type}
    </span>
  )
}

const DOC_TYPES = ['License','Malpractice','DEA','CAQH Attestation','Recredentialing','Supervision Agreement','NPI Letter','W-9','CV / Resume','Other']

export function Documents({ db, search, setSearch, fType, setFType, fStatus, setFStatus, openDocModal, handleDeleteDocument }) {
  const [viewingDoc, setViewingDoc] = useState(null)
  const rawDocs = db.documents.filter(d => {
    const txt = `${pName(db.providers,d.provId)} ${d.type} ${d.issuer||''} ${d.number||''}`.toLowerCase()
    if (!txt.includes((search||'').toLowerCase())) return false
    if (fType && d.type !== fType) return false
    if (fStatus) {
      const days = daysUntil(d.exp)
      const isExempt = NO_EXPIRY_TYPES.has(d.type)
      if (fStatus === 'no-expiry' && !isExempt)                                     return false
      if (fStatus === 'expired'   && (days === null || days >= 0))                   return false
      if (fStatus === 'critical'  && (days === null || days < 0 || days > 30))       return false
      if (fStatus === 'warning'   && (days === null || days < 0 || days > 90))       return false
      // 'ok' = has expiry > 90d OR is an exempt type (W-9, CV, NPI Letter)
      if (fStatus === 'ok'        && !isExempt && (days === null || days <= 90))     return false
      if (fStatus === 'ok'        && !isExempt && days === null && !isExempt)         return false
    }
    return true
  })

  const { sorted: list, thProps } = useSorted(rawDocs, 'exp')

  // Summary stats
  const expired  = db.documents.filter(d => { const x = daysUntil(d.exp); return x !== null && x < 0 }).length
  const critical = db.documents.filter(d => { const x = daysUntil(d.exp); return x !== null && x >= 0 && x <= 30 }).length
  const warning  = db.documents.filter(d => { const x = daysUntil(d.exp); return x !== null && x > 30 && x <= 90 }).length
  const withFile = db.documents.filter(d => d.fileUrl).length

  return (
    <div className="page">

      {/* Summary strip */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Docs',   val: db.documents.length, color: 'var(--text-1)' },
          { label: 'Expired',      val: expired,   color: '#dc2626',        active: expired > 0 },
          { label: 'Critical ≤30d',val: critical,  color: '#ef4444',        active: critical > 0 },
          { label: 'Expiring ≤90d',val: warning,   color: '#d97706',        active: warning > 0 },
          { label: 'Files Attached', val: withFile, color: 'var(--success)' },
        ].map(s => (
          <div key={s.label} style={{
            padding: '8px 14px', background: 'var(--card)',
            border: `1.5px solid ${s.active ? `${s.color}40` : 'var(--border)'}`,
            borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 1,
            boxShadow: s.active ? `0 0 0 3px ${s.color}10` : 'none',
          }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: s.color, letterSpacing: '-.04em' }}>{s.val}</span>
            <span style={{ fontSize: 10.5, color: 'var(--text-4)', fontWeight: 600 }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <div className="search-box" style={{ flex: '1 1 200px', maxWidth: 280 }}>
          <span className="si"><SearchIcon /></span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by provider, type, issuer…" />
        </div>

        <select className="filter-select" value={fType} onChange={e => setFType(e.target.value)} aria-label="Filter by type">
          <option value="">Type: All</option>
          {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>

        <select className="filter-select" value={fStatus} onChange={e => setFStatus(e.target.value)} aria-label="Filter by status">
          <option value="">Status: All</option>
          <option value="expired">Expired</option>
          <option value="critical">Critical (≤30d)</option>
          <option value="warning">Warning (≤90d)</option>
          <option value="ok">OK (&gt;90d)</option>
          <option value="no-expiry">No Expiry Date</option>
        </select>

        {(search || fType || fStatus) && (
          <button onClick={() => { setSearch(''); setFType(''); setFStatus('') }}
            style={{ fontSize: 12, color: 'var(--pr)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            Clear ×
          </button>
        )}
      </div>

      {/* Empty state */}
      {!list.length && (
        <div className="empty-state">
          <div className="empty-state-icon"><FileIcon /></div>
          <div className="empty-state-title">No documents found</div>
          <div className="empty-state-desc">{search || fType || fStatus ? 'Try clearing your filters.' : 'Add your first credential document to start tracking expiration dates.'}</div>
          {!search && !fType && !fStatus && <button className="btn btn-primary btn-sm" onClick={() => openDocModal()}>+ Add Document</button>}
        </div>
      )}

      {/* Table */}
      {list.length > 0 && (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th {...thProps('provId', 'Provider')} />
                <th {...thProps('type', 'Document Type')} />
                <th {...thProps('issuer', 'Issuer')} />
                <th className="no-sort" style={{ width: 110 }}>Number</th>
                <th {...thProps('exp', 'Expiration')} />
                <th className="no-sort" style={{ width: 140 }}>Days Remaining</th>
                <th className="no-sort" style={{ width: 55, textAlign: 'center' }}>File</th>
                <th className="no-sort" style={{ width: 100 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map(d => {
                const days   = daysUntil(d.exp)
                const status = ExpiryStatus({ days })
                return (
                  <tr key={d.id} style={{ cursor: 'pointer', background: status.urgency >= 3 ? status.bg : undefined }}
                    onClick={() => openDocModal(d.id)}>
                    <td onClick={e => e.stopPropagation()}>
                      <ProviderChip providers={db.providers} provId={d.provId} />
                    </td>
                    <td>
                      <DocTypePill type={d.type} />
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{d.issuer || '—'}</td>
                    <td>
                      {d.number
                        ? <code style={{ fontFamily: 'var(--fn-mono)', fontSize: 11, color: 'var(--text-3)', background: 'var(--elevated)', padding: '2px 5px', borderRadius: 4 }}>{d.number}</code>
                        : <span style={{ color: 'var(--text-4)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                      {d.exp ? fmtDate(d.exp) : '—'}
                    </td>
                    <td>
                      <div style={{ minWidth: 80 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          {status.urgency >= 3 && <span style={{ display: 'flex', color: status.color }}><AlertIcon /></span>}
                          <span style={{ fontSize: 12, fontWeight: status.urgency >= 2 ? 700 : 400, color: status.color }}>
                            {days === null ? '—' : days < 0 ? `${Math.abs(days)}d ago` : `${days}d`}
                          </span>
                        </div>
                        <UrgencyBar days={days} />
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      {d.fileUrl ? (
                        <button
                          onClick={() => setViewingDoc(d)}
                          title={d.fileName || 'View file'}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, background: 'rgba(16,185,129,.1)', border: '1.5px solid rgba(16,185,129,.3)', color: 'var(--success)', cursor: 'pointer' }}
                        >
                          <LinkIcon />
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-4)' }}>—</span>
                      )}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openDocModal(d.id)} style={{ fontSize: 11, padding: '3px 8px' }}>Edit</button>
                        <button className="btn btn-sm" onClick={() => handleDeleteDocument(d.id)} style={{ fontSize: 11, padding: '3px 8px', color: 'var(--danger)', borderColor: 'var(--danger)' }}>Del</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ padding: '8px 16px', background: 'var(--elevated)', borderTop: '1px solid var(--border-l)', fontSize: 11.5, color: 'var(--text-4)' }}>
            {list.length} of {db.documents.length} documents
          </div>
        </div>
      )}

      {/* Document viewer modal — opened from the file icon in the table */}
      {viewingDoc && (
        <DocViewerModal
          doc={viewingDoc}
          db={db}
          onClose={() => setViewingDoc(null)}
          onEdit={(id) => { setViewingDoc(null); openDocModal(id) }}
        />
      )}
    </div>
  )
}
