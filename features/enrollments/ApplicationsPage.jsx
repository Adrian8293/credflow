/**
 * ApplicationsPage.jsx — PrimeCredential
 * Features:
 *  1. Inline stage progression — one-click "→ Next Stage" from row
 *  2. Bulk actions — select rows to bulk-update stage or delete
 *  3. Loading skeleton while data loads
 *  4. Pagination via usePagination hook (25 per page)
 */

import { useState, useEffect, useRef } from 'react'
import { STAGES } from '../../constants/stages.js'
import { StageBadge } from '../../components/ui/Badge.jsx'
import { daysUntil, fmtDate, pNameShort, payName } from '../../lib/helpers.js'
import { useSorted } from '../../hooks/useSorted.js'
import { usePagination } from '../../hooks/usePagination.js'
import { ApplicationsTableSkeleton } from '../../components/ui/Skeletons.jsx'
import { Pagination } from '../../components/ui/Pagination.jsx'

const SearchIcon = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const MailIcon   = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
const ChevRightIcon = <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>

const SUBTABS = ['All Applications','In Progress','Submitted','Approved','Returned']

const STAGE_TO_TAB = {
  'All Applications': null,
  'In Progress':  ['Under Review','Awaiting CAQH','Pending Verification','Additional Info Requested','In Credentialing'],
  'Submitted':    ['Application Submitted','Submitted'],
  'Approved':     ['Active','Approved'],
  'Returned':     ['Returned','Denied','Rejected'],
}

function appId(e) {
  return e.appId || `APP-${String(e.id || '').slice(-8).toUpperCase().padStart(8,'0')}`
}

function nextStage(current) {
  const idx = STAGES.indexOf(current)
  if (idx === -1 || idx >= STAGES.length - 2) return null
  return STAGES[idx + 1]
}


function exportEnrollmentsCSV(filtered, providers, payers) {
  const headers = ['Provider', 'Credential', 'Payer', 'Stage', 'Submitted', 'Effective Date', 'Follow-up', 'Notes']
  const rows = filtered.map(e => {
    const prov = providers.find(p => p.id === e.provId) || {}
    const payer = payers.find(p => p.id === e.payId) || {}
    return [
      (prov.fname + ' ' + (prov.lname || '')).trim(),
      prov.cred || '',
      payer.name || '',
      e.stage || '',
      e.submitted || '',
      e.effectiveDate || '',
      e.followUp || '',
      (e.notes || '').replace(/,/g, ';'),
    ]
  })
  const csv = [headers, ...rows].map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = 'applications_' + new Date().toISOString().split('T')[0] + '.csv'
  a.click(); URL.revokeObjectURL(url)
}

export function ApplicationsPage({ db, openEnrollModal, search, setSearch, fStage, setFStage, fProv, setFProv, handleDeleteEnrollment, onDraftEmail, handleStageChange, loading }) {
  const [subtab, setSubtab]       = useState('All Applications')
  const [menuOpen, setMenuOpen]   = useState(null)
  const [selected, setSelected]   = useState(new Set())
  const [bulkStage, setBulkStage] = useState('')
  const [advancing, setAdvancing] = useState(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const total     = db.enrollments.length
  const active    = db.enrollments.filter(e => ['Active','Approved'].includes(e.stage)).length
  const pending   = db.enrollments.filter(e => ['Application Submitted','Awaiting CAQH','Pending Verification','Under Review','In Credentialing'].includes(e.stage)).length
  const attention = db.enrollments.filter(e => ['Additional Info Requested','Returned','Denied'].includes(e.stage)).length

  const allowedStages = STAGE_TO_TAB[subtab]

  const filtered = db.enrollments.filter(e => {
    const txt = `${pNameShort(db.providers, e.provId)} ${payName(db.payers, e.payId)} ${e.stage} ${e.notes||''}`.toLowerCase()
    const matchSearch = !search || txt.includes(search.toLowerCase())
    const matchStage  = !fStage  || e.stage === fStage
    const matchProv   = !fProv   || e.provId === fProv
    const matchTab    = !allowedStages || allowedStages.some(s => (e.stage||'').toLowerCase().includes(s.toLowerCase()))
    return matchSearch && matchStage && matchProv && matchTab
  })

  const { sorted: list, thProps } = useSorted(filtered, 'submitted')

  // ── Pagination ────────────────────────────────────────────────────────────
  const pagination = usePagination(list, { pageSize: 25 })
  const pagedList  = pagination.paginated

  // Reset to page 1 when filters change
  useEffect(() => { pagination.setPage(1) }, [search, fStage, fProv, subtab]) // pagination.setPage is stable (from usePagination)

  function tabCount(t) {
    const stages = STAGE_TO_TAB[t]
    if (!stages) return db.enrollments.length
    return db.enrollments.filter(e => stages.some(s => (e.stage||'').toLowerCase().includes(s.toLowerCase()))).length
  }

  const allSelected  = pagedList.length > 0 && pagedList.every(e => selected.has(e.id))
  const someSelected = pagedList.some(e => selected.has(e.id))

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(pagedList.map(e => e.id)))
  }

  function toggleOne(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function handleBulkStage() {
    if (!bulkStage || selected.size === 0) return
    for (const id of selected) { await handleStageChange?.(id, bulkStage) }
    setSelected(new Set()); setBulkStage('')
  }

  async function handleBulkDelete() {
    for (const id of [...selected]) { await handleDeleteEnrollment(id) }
    setSelected(new Set())
  }

  async function handleAdvance(ev, enrollment) {
    ev.stopPropagation()
    const next = nextStage(enrollment.stage)
    if (!next) return
    setAdvancing(enrollment.id)
    await handleStageChange?.(enrollment.id, next)
    setAdvancing(null)
  }

  return (
    <div className="page">
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-.04em', margin: 0, marginBottom: 4 }}>Applications</h2>
            <p style={{ fontSize: 12.5, color: 'var(--text-4)', margin: 0 }}>Track and manage all credentialing applications.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" style={{ height: 36, fontSize: 13 }} onClick={() => exportEnrollmentsCSV(filtered, db.providers, db.payers)} title="Export current view to CSV">↓ Export CSV</button>
            <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, fontSize: 13 }} onClick={() => openEnrollModal()}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Application
            </button>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 }}>
        {[
          { label: 'Total',        val: total,     accent: 'kpi-blue',   sub: 'All applications' },
          { label: 'Active Panels',val: active,    accent: 'kpi-green',  sub: 'Credentialed & active' },
          { label: 'In Progress',  val: pending,   accent: 'kpi-amber',  sub: 'Awaiting approval' },
          { label: 'Needs Action', val: attention, accent: 'kpi-red',    sub: 'Returned or additional info' },
        ].map(k => (
          <div key={k.label} className={`kpi ${k.accent}`}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.val}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Subtabs */}
      <div className="tabs" style={{ marginBottom: 14 }}>
        {SUBTABS.map(t => (
          <div key={t} className={`tab${subtab === t ? ' active' : ''}`} onClick={() => { setSubtab(t); setSelected(new Set()) }}>
            {t}
            <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 700, background: subtab === t ? 'rgba(30,86,240,.12)' : 'var(--elevated)', color: subtab === t ? 'var(--pr)' : 'var(--text-4)', border: '1px solid var(--border)', borderRadius: 9, padding: '1px 6px' }}>{tabCount(t)}</span>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <div className="search-box" style={{ flex: '1 1 220px', maxWidth: 280 }}>
          <span className="si">{SearchIcon}</span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by provider, payer, ID…" />
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
          <select className="filter-select" value={fProv} onChange={e => setFProv(e.target.value)}>
            <option value="">All Providers</option>
            {db.providers.map(p => <option key={p.id} value={p.id}>{p.fname} {p.lname}</option>)}
          </select>
          <select className="filter-select" value={fStage} onChange={e => setFStage(e.target.value)}>
            <option value="">All Stages</option>
            {STAGES.map(s => <option key={s}>{s}</option>)}
          </select>
          {(search || fProv || fStage) && (
            <button onClick={() => { setSearch(''); setFProv(''); setFStage('') }}
              style={{ fontSize: 12, color: 'var(--pr)', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Clear ×
            </button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'rgba(30,86,240,.06)', border: '1.5px solid var(--pr)', borderRadius: 'var(--r)', marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--pr)' }}>{selected.size} selected</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select className="filter-select" style={{ fontSize: 12, height: 30 }} value={bulkStage} onChange={e => setBulkStage(e.target.value)}>
              <option value="">Move to stage…</option>
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" disabled={!bulkStage} onClick={handleBulkStage} style={{ fontSize: 12, height: 30 }}>Apply</button>
          </div>
          <button className="btn btn-sm" style={{ fontSize: 12, height: 30, color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={handleBulkDelete}>Delete selected</button>
          <button style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setSelected(new Set())}>Clear ×</button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading ? (
        <ApplicationsTableSkeleton rows={7} />
      ) : (
      <>
      {/* Table */}
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 36, paddingLeft: 12 }}>
                <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected && !allSelected }} onChange={toggleAll} style={{ cursor: 'pointer' }} />
              </th>
              <th {...thProps('appId', 'App ID')} />
              <th {...thProps('provId', 'Provider')} />
              <th {...thProps('payId', 'Payer')} />
              <th {...thProps('stage', 'Status')} />
              <th {...thProps('submitted', 'Submitted')} />
              <th {...thProps('updated', 'Last Updated')} />
              <th {...thProps('followup', 'Follow-up')} />
              <th style={{ width: 170 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!pagedList.length ? (
              <tr><td colSpan={9}>
                <div className="empty-state">
                  <div className="empty-state-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E56F0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
                  <div className="empty-state-title">No applications found</div>
                  <div className="empty-state-desc">{search || fProv || fStage ? 'Try adjusting your filters.' : 'Create your first application to get started.'}</div>
                  {!search && !fProv && !fStage && <button className="btn btn-primary btn-sm" onClick={() => openEnrollModal()}>+ New Application</button>}
                </div>
              </td></tr>
            ) : pagedList.map(e => {
              const fuD    = daysUntil(e.followup)
              const fuCol  = fuD !== null && fuD <= 0 ? 'var(--danger)' : fuD !== null && fuD <= 7 ? 'var(--warning)' : 'var(--text-3)'
              const isOpen = menuOpen === e.id
              const isChecked = selected.has(e.id)
              const next = nextStage(e.stage)
              const isAdv = advancing === e.id

              return (
                <tr key={e.id} style={{ cursor: 'pointer', background: isChecked ? 'rgba(30,86,240,.04)' : undefined }} onClick={() => openEnrollModal(e.id)}>
                  <td onClick={ev => ev.stopPropagation()} style={{ paddingLeft: 12 }}>
                    <input type="checkbox" checked={isChecked} onChange={() => toggleOne(e.id)} style={{ cursor: 'pointer' }} />
                  </td>
                  <td onClick={ev => ev.stopPropagation()}>
                    <button onClick={() => openEnrollModal(e.id)} style={{ fontFamily: 'var(--fn-mono)', fontSize: 11.5, color: 'var(--pr)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>
                      {appId(e)}
                    </button>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{pNameShort(db.providers, e.provId)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-4)' }}>{db.providers.find(x => x.id === e.provId)?.cred || ''}</div>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--text-2)' }}>{payName(db.payers, e.payId)}</td>
                  <td><StageBadge stage={e.stage} /></td>
                  <td style={{ fontSize: 12.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDate(e.submitted)}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--text-4)', whiteSpace: 'nowrap' }}>{fmtDate(e.updated || e.submitted)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {e.followup ? (
                      <span style={{ fontSize: 12, fontWeight: fuD !== null && fuD <= 7 ? 700 : 400, color: fuCol }}>
                        {fmtDate(e.followup)}
                        {fuD !== null && fuD <= 0 && <span style={{ fontSize: 10, marginLeft: 4 }}>overdue</span>}
                      </span>
                    ) : '—'}
                  </td>
                  <td onClick={ev => ev.stopPropagation()} style={{ position: 'relative', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {next && (
                        <button
                          title={`Advance to: ${next}`}
                          onClick={ev => handleAdvance(ev, e)}
                          disabled={isAdv}
                          style={{
                            fontSize: 10.5, fontWeight: 600, padding: '3px 7px',
                            background: 'var(--elevated)', border: '1.5px solid var(--border)',
                            borderRadius: 'var(--r)', cursor: isAdv ? 'wait' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 3,
                            color: 'var(--text-2)', maxWidth: 96, overflow: 'hidden',
                            opacity: isAdv ? 0.5 : 1, transition: 'all .15s',
                          }}
                        >
                          {ChevRightIcon}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 70 }}>
                            {next.split('–')[0].trim().split(' ').slice(0,2).join(' ')}
                          </span>
                        </button>
                      )}
                      <div ref={isOpen ? menuRef : null} style={{ position: 'relative' }}>
                        <button className="btn btn-secondary btn-sm" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setMenuOpen(isOpen ? null : e.id)}>···</button>
                        {isOpen && (
                          <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 50, background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-lg)', minWidth: 190, overflow: 'hidden' }}>
                            <button className="dropdown-item" onClick={() => { openEnrollModal(e.id); setMenuOpen(null) }}>✏ Edit Application</button>
                            {onDraftEmail && <button className="dropdown-item" onClick={() => { onDraftEmail(e); setMenuOpen(null) }}>{MailIcon} Draft Follow-up Email</button>}
                            <div style={{ height: 1, background: 'var(--border-l)', margin: '3px 0' }} />
                            <div style={{ padding: '4px 12px 2px', fontSize: 10.5, color: 'var(--text-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Change Stage</div>
                            <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                              {STAGES.filter(s => s !== e.stage).map(s => (
                                <button key={s} className="dropdown-item" style={{ fontSize: 12 }} onClick={() => { handleStageChange?.(e.id, s); setMenuOpen(null) }}>{s}</button>
                              ))}
                            </div>
                            <div style={{ height: 1, background: 'var(--border-l)', margin: '3px 0' }} />
                            <button className="dropdown-item" style={{ color: 'var(--danger)' }} onClick={() => { handleDeleteEnrollment(e.id); setMenuOpen(null) }}>✕ Delete</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', background: 'var(--elevated)', borderTop: '1px solid var(--border-l)', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>
            Showing {pagedList.length ? ((pagination.page - 1) * 25) + 1 : 0}–{Math.min(pagination.page * 25, list.length)} of {list.length} applications
            {list.length !== db.enrollments.length && <span> (filtered from {db.enrollments.length} total)</span>}
          </span>
          {someSelected && <span style={{ fontSize: 11.5, color: 'var(--pr)', fontWeight: 600 }}>{selected.size} row{selected.size !== 1 ? 's' : ''} selected</span>}
        </div>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div style={{ marginTop: 12 }}>
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            pageSize={25}
            onPageChange={pagination.setPage}
            onNext={pagination.nextPage}
            onPrev={pagination.prevPage}
          />
        </div>
      )}
      </>
      )}
    </div>
  )
}

export default ApplicationsPage
