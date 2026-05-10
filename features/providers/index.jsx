/**
 * Providers/index.jsx — PrimeCredential
 * Premium provider card grid with compact inline actions.
 * Filters live in a slim single-line toolbar.
 */

import { useState } from 'react'
import { WorkflowProviderCard, providerReadiness, daysUntilWF as daysUntil } from '../../components/WorkflowOverhaul'

const SearchIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>

export function Providers({ db, search, setSearch, fStatus, setFStatus, fSpec, setFSpec, openProvDetail, editProvider, setPage, setProvForm, setEditingId, setNpiInput, setNpiResult, syncFromNPPES }) {
  const [sortBy, setSortBy] = useState('name')

  const specs = [...new Set(db.providers.map(p => p.spec).filter(Boolean))].sort()

  const list = db.providers
    .filter(p => {
      const txt = `${p.fname} ${p.lname} ${p.cred} ${p.npi} ${p.focus} ${p.spec} ${p.email||''} ${p.license||''}`.toLowerCase()
      return (!search || txt.includes(search.toLowerCase()))
        && (!fStatus || (p.status || '').trim() === fStatus)
        && (!fSpec   || (p.spec   || '').trim().toLowerCase() === fSpec.toLowerCase())
    })
    .sort((a, b) => {
      if (sortBy === 'name')      return `${a.lname} ${a.fname}`.localeCompare(`${b.lname} ${b.fname}`)
      if (sortBy === 'spec')      return (a.spec||'').localeCompare(b.spec||'')
      if (sortBy === 'status')    return (a.status||'').localeCompare(b.status||'')
      if (sortBy === 'license')   { const da=daysUntil(a.licenseExp), db2=daysUntil(b.licenseExp); return (da??99999)-(db2??99999) }
      if (sortBy === 'panels')    { const pa=db.enrollments.filter(e=>e.provId===a.id&&e.stage==='Active').length; const pb=db.enrollments.filter(e=>e.provId===b.id&&e.stage==='Active').length; return pb-pa }
      return 0
    })

  const activeCount  = db.providers.filter(p => p.status === 'Active').length
  const pendingCount = db.providers.filter(p => p.status === 'Pending').length

  function addProvider() {
    setProvForm({})
    setEditingId(e => ({ ...e, provider: null }))
    setNpiInput('')
    setNpiResult(null)
    setPage('add-provider')
  }

  return (
    <div>
      {/* ── Compact single-line toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Search — icon INSIDE left edge, no overlap */}
        <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', pointerEvents: 'none', display: 'flex' }}>
            {SearchIcon}
          </span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search providers…"
            style={{
              width: '100%', boxSizing: 'border-box',
              paddingLeft: 34, paddingRight: 10, height: 34,
              border: '1.5px solid var(--border)', borderRadius: 'var(--r)',
              fontSize: 13, color: 'var(--text-1)', background: 'var(--card)',
              outline: 'none', fontFamily: 'inherit',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--pr)'}
            onBlur={e => e.target.style.borderColor  = 'var(--border)'}
          />
        </div>

        <select value={fStatus} onChange={e => setFStatus(e.target.value)} className="filter-select" style={{ height: 34, fontSize: 12.5 }}>
          <option value="">All Statuses</option>
          <option>Active</option><option>Pending</option><option>Inactive</option>
        </select>

        <select value={fSpec} onChange={e => setFSpec(e.target.value)} className="filter-select" style={{ height: 34, fontSize: 12.5 }}>
          <option value="">All Specialties</option>
          {specs.map(s => <option key={s}>{s}</option>)}
        </select>

        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="filter-select" style={{ height: 34, fontSize: 12.5, minWidth: 130 }}>
          <option value="name">Last Name A–Z</option>
          <option value="spec">Specialty</option>
          <option value="status">Status</option>
          <option value="license">License Expiry</option>
          <option value="panels">Active Panels</option>
        </select>

        {(search || fStatus || fSpec) && (
          <button onClick={() => { setSearch(''); setFStatus(''); setFSpec('') }}
            style={{ fontSize: 12, color: 'var(--pr)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', whiteSpace: 'nowrap' }}>
            Clear ×
          </button>
        )}

        {/* Summary pills — space efficient */}
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexShrink: 0 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-4)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{list.length}</span> shown
          </span>
          <button className="btn btn-primary btn-sm" onClick={addProvider} style={{ height: 34, fontSize: 12.5 }}>
            + Add Provider
          </button>
        </div>
      </div>

      {/* ── Provider cards ── */}
      {list.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E56F0" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          </div>
          <div className="empty-state-title">No providers found</div>
          <div className="empty-state-desc">
            {search || fStatus || fSpec ? 'Try adjusting your search or filters.' : 'Add your first provider to get started.'}
          </div>
          {!search && !fStatus && !fSpec && (
            <button className="btn btn-primary btn-sm" onClick={addProvider}>+ Add Provider</button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(p => (
            <WorkflowProviderCard
              key={p.id}
              prov={p}
              db={db}
              onOpen={openProvDetail}
              onEdit={editProvider}
              onEnroll={null}
              onSync={syncFromNPPES}
            />
          ))}
        </div>
      )}
    </div>
  )
}
