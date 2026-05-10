/**
 * Providers/index.jsx — PrimeCredential
 * Premium provider TABLE matching the design reference:
 * Provider Name (clickable link) | NPI | CAQH ID | Medicaid ID | Specialty | Status | Last Updated | Actions (···)
 * Filters on the RIGHT side of search bar.
 */

import { useState } from 'react'
import { fmtDate, daysUntil } from '../../lib/helpers.js'
import { useSorted } from '../../hooks/useSorted.js'

const SearchIcon = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>

const SPEC_COLORS = {
  'Mental Health':'#3563c9','Massage Therapy':'#1a8a7a','Naturopathic':'#6d3fb5',
  'Chiropractic':'#c97d1e','Acupuncture':'#b8292e','Licensed Psychologist':'#0891b2',
}

function StatusBadge({ status }) {
  const map = { Active:'b-green', Pending:'b-amber', Inactive:'b-gray' }
  return <span className={`badge ${map[status]||'b-gray'}`}>{status||'Unknown'}</span>
}

function CredWarning({ prov }) {
  const licD  = daysUntil(prov.licenseExp)
  const malD  = daysUntil(prov.malExp)
  const caqhD = daysUntil(prov.caqhDue)
  const expired = [licD,malD,caqhD].some(d => d !== null && d < 0)
  const urgent  = [licD,malD,caqhD].some(d => d !== null && d >= 0 && d <= 30)
  if (expired) return <span title="Expired credential" style={{ color:'var(--danger)', fontSize:12, marginLeft:6 }}>⚠</span>
  if (urgent)  return <span title="Expiring within 30 days" style={{ color:'var(--warning)', fontSize:12, marginLeft:6 }}>●</span>
  return null
}

export function Providers({ db, search, setSearch, fStatus, setFStatus, fSpec, setFSpec, openProvDetail, editProvider, setPage, setProvForm, setEditingId, setNpiInput, setNpiResult, syncFromNPPES, onAddProvider }) {
  const [menuOpen, setMenuOpen] = useState(null)
  const specs = [...new Set(db.providers.map(p => p.spec).filter(Boolean))].sort()

  const filtered = db.providers.filter(p => {
    const txt = `${p.fname} ${p.lname} ${p.cred||''} ${p.npi||''} ${p.spec||''} ${p.email||''} ${p.license||''}`.toLowerCase()
    return (!search || txt.includes(search.toLowerCase()))
      && (!fStatus || (p.status||'').trim() === fStatus)
      && (!fSpec   || (p.spec||'').trim().toLowerCase() === fSpec.toLowerCase())
  })

  const { sorted: list, thProps } = useSorted(filtered, 'lname')

  return (
    <div>
      {/* Toolbar: search LEFT, filters RIGHT */}
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <div className="search-box" style={{ flex: '1 1 200px', maxWidth: 300 }}>
          <span className="si">{SearchIcon}</span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, NPI, or specialty…" />
        </div>

        {/* Filters on the right */}
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
          <select className="filter-select" value={fStatus} onChange={e => setFStatus(e.target.value)}>
            <option value="">Status</option>
            <option>Active</option><option>Pending</option><option>Inactive</option>
          </select>
          <select className="filter-select" value={fSpec} onChange={e => setFSpec(e.target.value)}>
            <option value="">Specialty</option>
            {specs.map(s => <option key={s}>{s}</option>)}
          </select>
          {(search || fStatus || fSpec) && (
            <button onClick={() => { setSearch(''); setFStatus(''); setFSpec('') }}
              style={{ fontSize: 12, color: 'var(--pr)', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Clear ×
            </button>
          )}
          <span style={{ fontSize: 12, color: 'var(--text-4)', whiteSpace: 'nowrap' }}>{list.length} providers</span>
        </div>
      </div>

      {/* Table */}
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th {...thProps('lname', 'Provider')} />
              <th {...thProps('npi', 'NPI')} />
              <th {...thProps('caqh', 'CAQH ID')} />
              <th {...thProps('medicaid', 'Medicaid ID')} />
              <th {...thProps('spec', 'Specialty')} />
              <th {...thProps('status', 'Status')} />
              <th {...thProps('licenseExp', 'Last Updated')} />
              <th style={{ width: 60, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!list.length ? (
              <tr><td colSpan={8}>
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E56F0" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                  </div>
                  <div className="empty-state-title">No providers found</div>
                  <div className="empty-state-desc">{search || fStatus || fSpec ? 'Try adjusting your filters.' : 'Add your first provider to get started.'}</div>
                  {!search && !fStatus && !fSpec && onAddProvider && (
                    <button className="btn btn-primary btn-sm" onClick={onAddProvider}>+ Add Provider</button>
                  )}
                </div>
              </td></tr>
            ) : list.map(p => {
              const isOpen = menuOpen === p.id
              const specCol = SPEC_COLORS[p.spec] || '#4f7ef8'
              const panels  = db.enrollments.filter(e => e.provId === p.id && e.stage === 'Active').length
              const ini     = ((p.fname||'')[0]||'') + ((p.lname||'')[0]||'')

              return (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => openProvDetail(p.id)}>
                  {/* Provider name — clickable like a link */}
                  <td onClick={ev => ev.stopPropagation()}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      {/* Mini avatar */}
                      <div style={{
                        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                        background: specCol, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 10.5, fontWeight: 800, color: '#fff',
                        overflow: 'hidden',
                      }}>
                        {p.avatarUrl
                          ? <img src={p.avatarUrl} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} onError={e=>{e.target.style.display='none'}} />
                          : ini}
                      </div>
                      <div>
                        <button onClick={() => openProvDetail(p.id)} style={{
                          fontWeight: 600, fontSize: 13, color: 'var(--pr)',
                          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                          display: 'flex', alignItems: 'center', gap: 0,
                          fontFamily: 'inherit', textAlign: 'left',
                        }}>
                          {p.fname} {p.lname}{p.cred ? `, ${p.cred}` : ''}
                          <CredWarning prov={p} />
                        </button>
                        {panels > 0 && <div style={{ fontSize: 10.5, color: 'var(--success)', fontWeight: 600 }}>{panels} active panel{panels!==1?'s':''}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'var(--fn-mono)', fontSize: 12, color: 'var(--text-3)' }}>{p.npi || '—'}</td>
                  <td style={{ fontFamily: 'var(--fn-mono)', fontSize: 12, color: 'var(--text-3)' }}>{p.caqh || '—'}</td>
                  <td style={{ fontFamily: 'var(--fn-mono)', fontSize: 12, color: 'var(--text-3)' }}>{p.medicaid || '—'}</td>
                  <td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: specCol, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{p.spec || '—'}</span>
                    </span>
                  </td>
                  <td><StatusBadge status={p.status} /></td>
                  <td style={{ fontSize: 12, color: 'var(--text-4)', whiteSpace: 'nowrap' }}>
                    {fmtDate(p.licenseExp) !== '—' ? fmtDate(p.licenseExp) : '—'}
                  </td>
                  <td onClick={ev => ev.stopPropagation()} style={{ position: 'relative', textAlign: 'center' }}>
                    <button className="btn btn-secondary btn-sm" style={{ padding: '4px 10px', fontSize: 12 }}
                      onClick={() => setMenuOpen(isOpen ? null : p.id)}>···</button>
                    {isOpen && (
                      <div style={{
                        position: 'absolute', top: '100%', right: 0, zIndex: 50,
                        background: 'var(--card)', border: '1.5px solid var(--border)',
                        borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-lg)',
                        minWidth: 165, overflow: 'hidden',
                      }}>
                        <button className="dropdown-item" onClick={() => { openProvDetail(p.id); setMenuOpen(null) }}>
                          👤 View Profile
                        </button>
                        <button className="dropdown-item" onClick={() => { editProvider(p.id); setMenuOpen(null) }}>
                          ✏ Edit Provider
                        </button>
                        {p.npi && (
                          <>
                            <div style={{ height: 1, background: 'var(--border-l)', margin: '3px 0' }} />
                            <button className="dropdown-item" onClick={() => { window.open(`/review/${p.id}`); setMenuOpen(null) }}>
                              📋 OPCA Review
                            </button>
                            <button className="dropdown-item" onClick={() => { syncFromNPPES?.(p.id); setMenuOpen(null) }}>
                              ↻ Sync NPPES
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {list.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', background: 'var(--elevated)', borderTop: '1px solid var(--border-l)' }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>Showing {list.length} of {db.providers.length} providers</span>
          </div>
        )}
      </div>
    </div>
  )
}
