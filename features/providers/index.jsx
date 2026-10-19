/**
 * Providers/index.jsx — LACentra v5.0
 * 
 * Key changes from v4:
 *  - "Medicaid ID" column replaced with "Next Expiry" — the single most
 *    actionable piece of information for a credentialing specialist.
 *  - "Last Updated" column replaced with "Lic. Exp" for the same reason.
 *  - Pagination uses CSS classes (.pagination-bar, .pagination-btn).
 *  - Dropdown closes on outside click (useEffect listener).
 *  - ARIA roles on interactive elements.
 *  - Medicaid ID still visible in the action menu hover tooltip.
 */

import { useState, useEffect, useRef } from 'react'
import { fmtDate, daysUntil } from '../../lib/helpers.js'
import { providerReadiness } from '../../components/WorkflowOverhaul.jsx'
import { useSorted } from '../../hooks/useSorted.js'
import { usePagination } from '../../hooks/usePagination.js'

const PAGE_SIZE = 10

// ─── ICONS ────────────────────────────────────────────────────────────────────
const SearchIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)
const DotsIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
  </svg>
)

// ─── SPECIALTY COLOR MAP ───────────────────────────────────────────────────────
const SPEC_COLORS = {
  'Mental Health':        '#3563c9',
  'Massage Therapy':      '#1a8a7a',
  'Naturopathic':         '#6d3fb5',
  'Chiropractic':         '#c97d1e',
  'Acupuncture':          '#b8292e',
  'Licensed Psychologist':'#0891b2',
}
function specColor(spec) { return SPEC_COLORS[spec] || '#4f7ef8' }

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = { Active: 'b-green', Pending: 'b-amber', Inactive: 'b-gray' }
  return <span className={`badge ${map[status] || 'b-gray'}`}>{status || 'Unknown'}</span>
}

// ─── CAQH ATTESTATION BADGE ───────────────────────────────────────────────────
// Payers require re-attestation every 120 days; warn at 90 days elapsed.
function CaqhAttestBadge({ caqhAttest }) {
  if (!caqhAttest) return null
  const until = daysUntil(caqhAttest)
  if (until === null || isNaN(until)) return null
  const daysSince = -until
  if (daysSince < 90) return null

  const isAlert = daysSince >= 120
  const color  = isAlert ? 'var(--danger)' : 'var(--warning)'
  const bg     = isAlert ? 'rgba(239,68,68,.09)' : 'rgba(245,158,11,.09)'
  const border = isAlert ? 'rgba(239,68,68,.3)'  : 'rgba(245,158,11,.3)'
  const tip    = isAlert
    ? `CAQH attestation is ${daysSince}d old — payers may reject`
    : `CAQH attestation is ${daysSince}d old — re-attest soon`

  return (
    <span title={tip} style={{
      display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 5,
      padding: '1px 6px', fontSize: 10, fontWeight: 700, letterSpacing: '.02em',
      background: bg, border: `1px solid ${border}`, borderRadius: 99,
      color, cursor: 'default', whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {isAlert ? '⚠' : '●'} {daysSince}d
    </span>
  )
}

// ─── CREDENTIAL WARNING ────────────────────────────────────────────────────────
function CredWarning({ prov }) {
  const days   = [prov.licenseExp, prov.malExp, prov.caqhDue, prov.deaExp]
    .map(d => daysUntil(d))
    .filter(d => d !== null)
  const expired = days.some(d => d < 0)
  const urgent  = days.some(d => d >= 0 && d <= 30)
  if (expired) return <span title="Expired credential" style={{ color: 'var(--danger)', fontSize: 12, marginLeft: 5 }}>⚠</span>
  if (urgent)  return <span title="Expiring within 30 days" style={{ color: 'var(--warning)', fontSize: 12, marginLeft: 5 }}>●</span>
  return null
}

// ─── NEXT EXPIRY CELL — the most operationally critical column ────────────────
function NextExpiryCell({ prov }) {
  const fields = [
    { d: prov.licenseExp, label: 'License' },
    { d: prov.malExp,     label: 'Malpractice' },
    { d: prov.deaExp,     label: 'DEA' },
    { d: prov.caqhDue,   label: 'CAQH' },
    { d: prov.recred,    label: 'Re-cred' },
  ]
  const upcoming = fields
    .filter(x => x.d)
    .map(x => ({ ...x, days: daysUntil(x.d) }))
    .filter(x => x.days !== null)
    .sort((a, b) => a.days - b.days)

  const next = upcoming[0]
  if (!next) return <span style={{ color: 'var(--text-5)' }}>—</span>

  const isExpired = next.days < 0
  const isCritical = next.days >= 0 && next.days <= 14
  const isWarning  = next.days >= 15 && next.days <= 60

  const color = isExpired  ? 'var(--danger)'
              : isCritical ? 'var(--danger)'
              : isWarning  ? 'var(--warning)'
              : 'var(--text-4)'

  const label = isExpired
    ? `${next.label} expired ${Math.abs(next.days)}d ago`
    : `${next.label} in ${next.days}d`

  return (
    <div title={`Next: ${next.label} on ${fmtDate(next.d)}`}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color, whiteSpace: 'nowrap' }}>
        {fmtDate(next.d)}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 1, whiteSpace: 'nowrap' }}>
        {label}
      </div>
    </div>
  )
}

// ─── ROW DROPDOWN ─────────────────────────────────────────────────────────────
function RowMenu({ prov, onClose, openProvDetail, editProvider, syncFromNPPES }) {
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 200,
      background: 'var(--card)', border: '1.5px solid var(--border-mid)',
      borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-lg)',
      minWidth: 172, overflow: 'hidden',
    }} role="menu">
      <button className="dropdown-item" role="menuitem" onClick={() => { openProvDetail(prov.id); onClose() }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
        View Profile
      </button>
      <button className="dropdown-item" role="menuitem" onClick={() => { editProvider(prov.id); onClose() }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Edit Provider
      </button>
      {prov.npi && <>
        <div style={{ height: 1, background: 'var(--border-l)', margin: '3px 0' }} />
        <button className="dropdown-item" role="menuitem" onClick={() => { window.open(`/review/${prov.id}`, '_blank'); onClose() }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          OPCA Review
        </button>
        <button className="dropdown-item" role="menuitem" onClick={() => { syncFromNPPES?.(prov.id); onClose() }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.61"/></svg>
          Sync NPPES
        </button>
      </>}
      {prov.medicaid && <>
        <div style={{ height: 1, background: 'var(--border-l)', margin: '3px 0' }} />
        <div style={{ padding: '5px 12px 8px', fontSize: 10.5, color: 'var(--text-4)' }}>
          Medicaid: <span style={{ fontFamily: 'var(--fn-mono)', color: 'var(--text-3)' }}>{prov.medicaid}</span>
        </div>
      </>}
    </div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export function Providers({
  db, search, setSearch, fStatus, setFStatus, fSpec, setFSpec,
  openProvDetail, editProvider, setPage, setProvForm, setEditingId,
  setNpiInput, setNpiResult, syncFromNPPES, onAddProvider,
}) {
  const [menuOpen, setMenuOpen] = useState(null)
  const specs = [...new Set(db.providers.map(p => p.spec).filter(Boolean))].sort()

  const filtered = db.providers.filter(p => {
    const txt = `${p.fname} ${p.lname} ${p.cred || ''} ${p.npi || ''} ${p.spec || ''} ${p.email || ''} ${p.license || ''}`.toLowerCase()
    return (!search || txt.includes(search.toLowerCase()))
      && (!fStatus || (p.status || '').trim() === fStatus)
      && (!fSpec   || (p.spec   || '').trim().toLowerCase() === fSpec.toLowerCase())
  })

  const { sorted: list, thProps } = useSorted(filtered, 'lname')
  const {
    paginated, page, totalPages, nextPage, prevPage, setPage: goToPage, totalItems,
  } = usePagination(list, { pageSize: PAGE_SIZE })

  const hasFilters = !!(search || fStatus || fSpec)

  return (
    <div>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <div className="search-box" style={{ flex: '1 1 200px', maxWidth: 300 }}>
          <span className="si">{SearchIcon}</span>
          <input
            type="text" value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, NPI, or specialty…"
            aria-label="Search providers"
          />
        </div>

        <select className="filter-select" value={fStatus} onChange={e => setFStatus(e.target.value)} aria-label="Filter by status">
          <option value="">Status: All</option>
          <option>Active</option>
          <option>Pending</option>
          <option>Inactive</option>
        </select>

        <select className="filter-select" value={fSpec} onChange={e => setFSpec(e.target.value)} aria-label="Filter by specialty">
          <option value="">Specialty: All</option>
          {specs.map(s => <option key={s}>{s}</option>)}
        </select>

        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setFStatus(''); setFSpec('') }}
            style={{ fontSize: 12, color: 'var(--pr)', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}
            aria-label="Clear filters"
          >
            Clear ×
          </button>
        )}

        <span style={{ fontSize: 12, color: 'var(--text-4)', whiteSpace: 'nowrap', marginLeft: hasFilters ? 0 : 'auto' }}>
          {list.length} provider{list.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th {...thProps('lname', 'Provider')} />
              <th {...thProps('npi', 'NPI')} />
              <th {...thProps('caqh', 'CAQH')} />
              <th {...thProps('spec', 'Specialty')} />
              <th {...thProps('status', 'Status')} />
              <th {...thProps('licenseExp', 'Next Expiry')} />
              <th className="no-sort" style={{ width: 100 }}>Readiness</th>
              <th className="no-sort" style={{ width: 52, textAlign: 'center' }}>⋯</th>
            </tr>
          </thead>
          <tbody>
            {!list.length ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    <div className="ei">👥</div>
                    <h4>{hasFilters ? 'No providers match your filters' : 'No providers yet'}</h4>
                    <p style={{ fontSize: 12.5, color: 'var(--text-4)', margin: '4px 0 14px' }}>
                      {hasFilters
                        ? 'Try adjusting your search or filter criteria.'
                        : 'Add your first provider to start tracking credentialing.'}
                    </p>
                    {hasFilters
                      ? <button className="btn btn-secondary btn-sm" onClick={() => { setSearch(''); setFStatus(''); setFSpec('') }}>Clear filters</button>
                      : onAddProvider && <button className="btn btn-primary btn-sm" onClick={onAddProvider}>+ Add Provider</button>
                    }
                  </div>
                </td>
              </tr>
            ) : paginated.map(p => {
              const isMenuOpen = menuOpen === p.id
              const sc         = specColor(p.spec)
              const panels     = db.enrollments.filter(e => e.provId === p.id && e.stage === 'Active').length
              const ini        = ((p.fname || '')[0] || '') + ((p.lname || '')[0] || '')
              const readiness  = providerReadiness(p)
              const rdColor    = readiness >= 80 ? 'var(--success)' : readiness >= 60 ? 'var(--warning)' : 'var(--danger)'

              return (
                <tr key={p.id}>

                  {/* Provider */}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                        background: sc, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff',
                        overflow: 'hidden',
                      }}>
                        {p.avatarUrl
                          ? <img src={p.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
                          : ini}
                      </div>
                      <div>
                        <button
                          onClick={() => openProvDetail(p.id)}
                          style={{
                            fontWeight: 600, fontSize: 13, color: 'var(--pr)',
                            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                            display: 'flex', alignItems: 'center', gap: 0,
                            fontFamily: 'inherit', textAlign: 'left', lineHeight: 1.3,
                          }}
                          aria-label={`View profile for ${p.fname} ${p.lname}`}
                        >
                          {p.fname} {p.lname}{p.cred ? `, ${p.cred}` : ''}
                          <CredWarning prov={p} />
                        </button>
                        <div style={{ fontSize: 10.5, marginTop: 1, display: 'flex', gap: 6 }}>
                          {panels > 0 && (
                            <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                              {panels} active panel{panels !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* NPI */}
                  <td>
                    <span className="mono">{p.npi || '—'}</span>
                  </td>

                  {/* CAQH */}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                      <span className="mono">{p.caqh || '—'}</span>
                      <CaqhAttestBadge caqhAttest={p.caqhAttest} />
                    </div>
                    {p.caqhAttest && (
                      <div style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--fn)', marginTop: 1 }}>
                        Attested {fmtDate(p.caqhAttest)}
                      </div>
                    )}
                  </td>

                  {/* Specialty */}
                  <td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: sc, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{p.spec || '—'}</span>
                    </span>
                  </td>

                  {/* Status */}
                  <td><StatusBadge status={p.status} /></td>

                  {/* Next Expiry — replaces Medicaid ID (moved to action menu) */}
                  <td><NextExpiryCell prov={p} /></td>

                  {/* Readiness */}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, height: 4, borderRadius: 4, background: 'var(--border)', overflow: 'hidden', minWidth: 50 }}>
                        <div style={{ height: '100%', width: `${readiness}%`, background: rdColor, borderRadius: 4, transition: 'width .3s' }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: rdColor, minWidth: 30, textAlign: 'right' }}>
                        {readiness}%
                      </span>
                    </div>
                  </td>

                  {/* Actions */}
                  <td onClick={e => e.stopPropagation()} style={{ position: 'relative', textAlign: 'center' }}>
                    <button
                      className="btn btn-secondary btn-sm btn-icon"
                      onClick={() => setMenuOpen(isMenuOpen ? null : p.id)}
                      aria-label={`Actions for ${p.fname} ${p.lname}`}
                      aria-expanded={isMenuOpen}
                      aria-haspopup="menu"
                    >
                      {DotsIcon}
                    </button>
                    {isMenuOpen && (
                      <RowMenu
                        prov={p}
                        onClose={() => setMenuOpen(null)}
                        openProvDetail={openProvDetail}
                        editProvider={editProvider}
                        syncFromNPPES={syncFromNPPES}
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* ── Pagination ──────────────────────────────────────────────────── */}
        {list.length > PAGE_SIZE && (
          <div className="pagination-bar">
            <span className="pagination-info">
              Showing {Math.min((page - 1) * PAGE_SIZE + 1, totalItems)}–{Math.min(page * PAGE_SIZE, totalItems)} of {totalItems} providers
            </span>
            <div className="pagination-controls">
              <button className="pagination-btn" onClick={prevPage} disabled={page === 1} aria-label="Previous page">‹</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                .reduce((acc, n, i, arr) => {
                  if (i > 0 && n - arr[i - 1] > 1) acc.push('…')
                  acc.push(n)
                  return acc
                }, [])
                .map((n, i) =>
                  n === '…'
                    ? <span key={`e${i}`} style={{ fontSize: 12, color: 'var(--text-4)', padding: '0 4px' }}>…</span>
                    : <button key={n} className={`pagination-btn${n === page ? ' active' : ''}`} onClick={() => goToPage(n)} aria-label={`Page ${n}`} aria-current={n === page ? 'page' : undefined}>{n}</button>
                )}
              <button className="pagination-btn" onClick={nextPage} disabled={page === totalPages} aria-label="Next page">›</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
