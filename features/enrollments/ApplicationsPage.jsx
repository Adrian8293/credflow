/**
 * ApplicationsPage.jsx — Lacentra
 * Features:
 *  1. Inline stage progression — one-click "→ Next Stage" from row
 *  2. Bulk actions — stage, follow-up date, export, delete; one confirmation, batched, audited per row;
 *     selection is cleared when filters change and can span every page of the current view
 *  3. Loading skeleton while data loads
 *  4. Pagination via usePagination hook (25 per page)
 */

import { useState, useEffect, useRef } from 'react'
import { STAGES } from '../../constants/stages.js'
import { StageBadge } from '../../components/ui/Badge.jsx'
import { daysUntil, fmtDate, pNameShort, payName } from '../../lib/helpers.js'
import { useSorted } from '../../hooks/useSorted.js'
import { usePersistedState } from '../../hooks/usePersistedState.js'
import { usePagination } from '../../hooks/usePagination.js'
import { ApplicationsTableSkeleton } from '../../components/ui/Skeletons.jsx'
import { Pagination } from '../../components/ui/Pagination.jsx'
import { DateInput } from '../../components/ui/DateInput.jsx'
import { ImportEnrollmentsModal } from './ImportEnrollmentsModal.jsx'
import { csvFromRows, downloadCsv } from '../../lib/csv.js'

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
  const headers = ['Provider', 'Credential', 'Payer', 'Type', 'Group', 'Group NPI', 'Stage', 'Submitted', 'Credentialing Effective', 'Contract Effective', 'Effective Date', 'Follow-up', 'Notes']
  const rows = filtered.map(e => {
    const prov = providers.find(p => p.id === e.provId) || {}
    const payer = payers.find(p => p.id === e.payId) || {}
    return [
      (prov.fname + ' ' + (prov.lname || '')).trim(),
      prov.cred || '',
      payer.name || '',
      e.level || 'Individual',
      e.groupName || '',
      e.groupNpi || '',
      e.stage || '',
      e.submitted || '',
      e.credentialingEffective || '',
      e.contractEffective || '',
      e.effective || '',
      e.followup || '',
      e.notes || '',
    ]
  })
  downloadCsv('applications_' + new Date().toISOString().split('T')[0] + '.csv', csvFromRows([headers, ...rows]))
}

export function ApplicationsPage({ db, setDb, openEnrollModal, search, setSearch, fStage, setFStage, fProv, setFProv, handleDeleteEnrollment, onDraftEmail, handleStageChange, handleBulkStage, handleBulkFollowup, handleBulkDelete, loading }) {
  const [subtab, setSubtab]       = usePersistedState('lc_pref_apps_tab', 'All Applications', v => SUBTABS.includes(v))
  const [importOpen, setImportOpen] = useState(false)
  const [menuOpen, setMenuOpen]   = useState(null)
  const [selected, setSelected]   = useState(new Set())
  const [bulkStage, setBulkStage] = useState('')
  const [bulkDate, setBulkDate]   = useState('')
  const [bulkBusy, setBulkBusy]   = useState(false)
  const [fLevel, setFLevel]     = usePersistedState('lc_pref_apps_level', '', v => ['', 'Individual', 'Group'].includes(v))
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
    const txt = `${pNameShort(db.providers, e.provId)} ${payName(db.payers, e.payId)} ${e.stage} ${e.groupName||''} ${e.notes||''}`.toLowerCase()
    const matchSearch = !search || txt.includes(search.toLowerCase())
    const matchStage  = !fStage  || e.stage === fStage
    const matchProv   = !fProv   || e.provId === fProv
    const matchLevel  = !fLevel  || (e.level || 'Individual') === fLevel
    const matchTab    = !allowedStages || allowedStages.some(s => (e.stage||'').toLowerCase().includes(s.toLowerCase()))
    return matchSearch && matchStage && matchProv && matchTab && matchLevel
  })

  const { sorted: list, thProps } = useSorted(filtered, 'submitted', 'asc', 'lc_pref_apps_sort')

  // ── Pagination ────────────────────────────────────────────────────────────
  const pagination = usePagination(list, { pageSize: 25 })
  const pagedList  = pagination.paginated

  // Reset to page 1 when filters change
  useEffect(() => { pagination.setPage(1) }, [search, fStage, fProv, subtab]) // pagination.setPage is stable (from usePagination)
  // Selection never outlives the view it was made in: changing a filter clears it, so a bulk action can
  // never touch rows the user cannot see.
  useEffect(() => { setSelected(new Set()) }, [search, fStage, fProv, fLevel, subtab])
  const visibleIds = new Set(list.map(e => e.id))
  const selectedIds = [...selected].filter(id => visibleIds.has(id))

  function tabCount(t) {
    const stages = STAGE_TO_TAB[t]
    if (!stages) return db.enrollments.length
    return db.enrollments.filter(e => stages.some(s => (e.stage||'').toLowerCase().includes(s.toLowerCase()))).length
  }

  const allSelected  = pagedList.length > 0 && pagedList.every(e => selected.has(e.id))
  const someSelected = selectedIds.length > 0
  const allMatchingSelected = list.length > 0 && selectedIds.length === list.length

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(pagedList.map(e => e.id)))
  }

  function toggleOne(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function runBulk(fn, reset) {
    if (bulkBusy || !selectedIds.length) return
    setBulkBusy(true)
    const ok = await fn()
    setBulkBusy(false)
    if (ok) { setSelected(new Set()); reset?.() }
  }
  const onBulkStage    = () => bulkStage && runBulk(() => handleBulkStage(selectedIds, bulkStage), () => setBulkStage(''))
  const onBulkFollowup = (clear) => runBulk(() => handleBulkFollowup(selectedIds, clear ? '' : bulkDate), () => setBulkDate(''))
  const onBulkDelete   = () => runBulk(() => handleBulkDelete(selectedIds))
  const onBulkExport   = () => exportEnrollmentsCSV(list.filter(e => selected.has(e.id)), db.providers, db.payers)

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
            <button className="btn btn-secondary hide-on-phone" style={{ height: 36, fontSize: 13 }} onClick={() => setImportOpen(true)} title="Add many applications from a CSV file">Import CSV</button>
            <button className="btn btn-secondary hide-on-phone" style={{ height: 36, fontSize: 13 }} onClick={() => exportEnrollmentsCSV(filtered, db.providers, db.payers)} title="Export current view to CSV">↓ Export CSV</button>
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
            <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 700, background: subtab === t ? 'rgba(21,101,192,.12)' : 'var(--elevated)', color: subtab === t ? 'var(--pr)' : 'var(--text-4)', border: '1px solid var(--border)', borderRadius: 9, padding: '1px 6px' }}>{tabCount(t)}</span>
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
          <select className="filter-select" value={fLevel} onChange={e => setFLevel(e.target.value)}>
            <option value="">Individual + Group</option>
            <option value="Individual">Individual only</option>
            <option value="Group">Group only</option>
          </select>
          <select className="filter-select" value={fStage} onChange={e => setFStage(e.target.value)}>
            <option value="">All Stages</option>
            {STAGES.map(s => <option key={s}>{s}</option>)}
          </select>
          {(search || fProv || fStage || fLevel) && (
            <button onClick={() => { setSearch(''); setFProv(''); setFStage(''); setFLevel('') }}
              style={{ fontSize: 12, color: 'var(--pr)', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Clear ×
            </button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div style={{ padding: '10px 14px', background: 'rgba(21,101,192,.06)', border: '1.5px solid var(--pr)', borderRadius: 'var(--r)', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--pr)' }}>{selectedIds.length} selected</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select className="filter-select" style={{ fontSize: 12, height: 30 }} value={bulkStage} onChange={e => setBulkStage(e.target.value)} aria-label="Move selected to stage">
                <option value="">Move to stage…</option>
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className="btn btn-primary btn-sm" disabled={!bulkStage || bulkBusy} onClick={onBulkStage} style={{ fontSize: 12, height: 30 }}>Apply</button>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <DateInput  value={bulkDate} onChange={e => setBulkDate(e.target.value)} aria-label="Follow-up date for selected"
                style={{ fontSize: 12, height: 30, padding: '0 8px', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--card)', color: 'var(--text-1)' }} />
              <button className="btn btn-secondary btn-sm" disabled={!bulkDate || bulkBusy} onClick={() => onBulkFollowup(false)} style={{ fontSize: 12, height: 30 }}>Set follow-up</button>
              <button className="btn btn-ghost btn-sm" disabled={bulkBusy} onClick={() => onBulkFollowup(true)} style={{ fontSize: 12, height: 30 }}>Clear</button>
            </div>
            <button className="btn btn-secondary btn-sm" style={{ fontSize: 12, height: 30 }} onClick={onBulkExport}>↓ Export selected</button>
            <button className="btn btn-sm" disabled={bulkBusy} style={{ fontSize: 12, height: 30, color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={onBulkDelete}>Delete selected</button>
            <button style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setSelected(new Set())}>Clear ×</button>
          </div>
          {allSelected && !allMatchingSelected && list.length > pagedList.length && (
            <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-2)' }}>
              All {pagedList.length} on this page are selected.{' '}
              <button style={{ color: 'var(--pr)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12.5 }}
                onClick={() => setSelected(new Set(list.map(e => e.id)))}>
                Select all {list.length} matching this view
              </button>
            </div>
          )}
          {allMatchingSelected && list.length > pagedList.length && (
            <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-2)' }}>All {list.length} matching applications are selected.</div>
          )}
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
                  <div className="ei">📋</div>
                  <h4>No applications found</h4>
                  <p style={{ fontSize: 12.5, color: 'var(--text-4)', margin: '4px 0 14px' }}>
                    {search || fProv || fStage ? 'Try adjusting your filters.' : 'Create your first application to get started.'}
                  </p>
                  {!search && !fProv && !fStage
                    ? <button className="btn btn-primary btn-sm" onClick={() => openEnrollModal()}>+ New Application</button>
                    : <button className="btn btn-secondary btn-sm" onClick={() => { setSearch(''); setFProv(''); setFStage('') }}>Clear filters</button>}
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
                <tr key={e.id} style={{ cursor: 'pointer', background: isChecked ? 'rgba(21,101,192,.04)' : undefined }} onClick={() => openEnrollModal(e.id)}>
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
                  <td style={{ fontSize: 13, color: 'var(--text-2)' }}>
                    {payName(db.payers, e.payId)}
                    <div style={{ fontSize: 11, color: e.level === 'Group' ? 'var(--pr)' : 'var(--text-4)', fontWeight: e.level === 'Group' ? 600 : 400 }}>
                      {e.level === 'Group' ? `Group${e.groupName ? ' · ' + e.groupName : ''}` : 'Individual'}
                    </div>
                  </td>
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
        <div className="pagination-bar">
          <span className="pagination-info">
            Showing {pagedList.length ? ((pagination.page - 1) * 25) + 1 : 0}–{Math.min(pagination.page * 25, list.length)} of {list.length} applications
            {list.length !== db.enrollments.length ? <span> · filtered from {db.enrollments.length} total</span> : null}
          </span>
          {someSelected && <span style={{ fontSize: 11.5, color: 'var(--pr)', fontWeight: 600 }}>{selectedIds.length} row{selectedIds.length !== 1 ? 's' : ''} selected</span>}
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
      {importOpen && (
        <ImportEnrollmentsModal
          providers={db.providers} payers={db.payers} existing={db.enrollments}
          onClose={() => setImportOpen(false)}
          onImported={(saved) => setDb?.(prev => ({ ...prev, enrollments: [...saved.filter(x => !prev.enrollments.some(e => e.id === x.id)), ...prev.enrollments] }))}
        />
      )}
    </div>
  )
}

export default ApplicationsPage
