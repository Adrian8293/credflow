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
import { providerReadiness } from '../../lib/readiness.js'
import { useSorted } from '../../hooks/useSorted.js'
import { usePagination } from '../../hooks/usePagination.js'
import { AvatarImg } from '../../components/ui/AvatarImg'
import { TableViews } from '../../components/ui/TableViews.jsx'
import { useTableViews } from '../../hooks/useTableViews.js'

// Columns the table can show. Provider is always shown; the extra credential columns start hidden.
const PROV_COLUMNS = [
  { id: 'provider', label: 'Provider', locked: true },
  { id: 'npi', label: 'NPI' }, { id: 'caqh', label: 'CAQH' }, { id: 'spec', label: 'Specialty' },
  { id: 'status', label: 'Status' }, { id: 'next', label: 'Next expiry' }, { id: 'ready', label: 'Readiness' },
  { id: 'payers', label: 'Active payers', hiddenByDefault: true },
  { id: 'license', label: 'License expires', hiddenByDefault: true },
  { id: 'malpractice', label: 'Malpractice expires', hiddenByDefault: true },
  { id: 'dea', label: 'DEA expires', hiddenByDefault: true },
  { id: 'caqhDue', label: 'CAQH re-attest due', hiddenByDefault: true },
]
const PROV_VIEWS = [
  { name: 'Credentialing view', columns: ['npi', 'caqh', 'spec', 'status', 'next', 'ready'], filters: { quick: '' } },
  { name: 'Compliance view', columns: ['status', 'license', 'malpractice', 'dea', 'caqhDue', 'next'], filters: { quick: '' } },
  { name: 'Enrollment view', columns: ['status', 'payers', 'ready'], filters: { quick: '' } },
  { name: 'Expiring in 30 days', filters: { quick: 'soon', search: '', fStatus: '', fSpec: '' } },
  { name: 'Already expired', filters: { quick: 'expired', search: '', fStatus: '', fSpec: '' } },
  { name: 'Needs work (under 60%)', filters: { quick: 'low', search: '', fStatus: '', fSpec: '' } },
]

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

// Days until the soonest credential date (negative = already expired); 99999 when nothing is on file.
function nextDays(prov) {
  const ds = [prov.licenseExp, prov.malExp, prov.deaExp, prov.caqhDue, prov.recred].map(d => daysUntil(d)).filter(d => d !== null)
  return ds.length ? Math.min(...ds) : 99999
}
const readinessWord = r => (r >= 80 ? 'Ready' : r >= 60 ? 'Almost' : 'Needs work')

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
  const [quick, setQuick] = useState('')   // '' | 'expired' | 'soon' | 'low'
  const tv = useTableViews('providers', PROV_COLUMNS)
  const getFilters = () => ({ search, fStatus, fSpec, quick })
  const setFilters = (f) => {
    if ('search' in f) setSearch(f.search ?? '')
    if ('fStatus' in f) setFStatus(f.fStatus ?? '')
    if ('fSpec' in f) setFSpec(f.fSpec ?? '')
    if ('quick' in f) setQuick(f.quick ?? '')
  }
  const specs = [...new Set(db.providers.map(p => p.spec).filter(Boolean))].sort()

  const withNext = db.providers.map(p => ({ ...p, _next: nextDays(p), _ready: providerReadiness(p) }))
  const quickCount = {
    expired: withNext.filter(p => p._next < 0).length,
    soon:    withNext.filter(p => p._next >= 0 && p._next <= 30).length,
    low:     withNext.filter(p => p._ready < 60).length,
  }
  const quickTest = {
    expired: p => p._next < 0,
    soon:    p => p._next >= 0 && p._next <= 30,
    low:     p => p._ready < 60,
  }

  const filtered = withNext.filter(p => {
    const txt = `${p.fname} ${p.lname} ${p.cred || ''} ${p.npi || ''} ${p.spec || ''} ${p.email || ''} ${p.license || ''}`.toLowerCase()
    return (!search || txt.includes(search.toLowerCase()))
      && (!fStatus || (p.status || '').trim() === fStatus)
      && (!quick || quickTest[quick](p))
      && (!fSpec   || (p.spec   || '').trim().toLowerCase() === fSpec.toLowerCase())
  })

  const { sorted: list, thProps, sortKey, sortDir, toggleSort } = useSorted(filtered, 'lname')
  const {
    paginated, page, totalPages, nextPage, prevPage, setPage: goToPage, totalItems,
  } = usePagination(list, { pageSize: PAGE_SIZE })

  const hasFilters = !!(search || fStatus || fSpec || quick)
  const clearAll = () => { setSearch(''); setFStatus(''); setFSpec(''); setQuick('') }

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

        <select className="filter-select show-on-phone" aria-label="Sort providers"
          value={`${sortKey}`} onChange={e => { if (e.target.value !== sortKey) toggleSort(e.target.value) }}>
          <option value="lname">Sort: Name</option>
          <option value="_next">Sort: Soonest expiry</option>
          <option value="_ready">Sort: Readiness</option>
          <option value="status">Sort: Status</option>
        </select>

        {hasFilters && (
          <button
            onClick={clearAll}
            className="x-link"
            aria-label="Clear all filters"
          >
            Clear filters ×
          </button>
        )}

        <span style={{ marginLeft: hasFilters ? 0 : 'auto' }}><TableViews tv={tv} builtIns={PROV_VIEWS} getFilters={getFilters} setFilters={setFilters} /></span>
        <span style={{ fontSize: 12, color: 'var(--text-4)', whiteSpace: 'nowrap' }}>
          {list.length} provider{list.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Quick filters ───────────────────────────────────────────────── */}
      {(quickCount.expired + quickCount.soon + quickCount.low) > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {[['expired', 'Expired', quickCount.expired], ['soon', 'Expiring in 30 days', quickCount.soon], ['low', 'Needs work', quickCount.low]].map(([k, l, n]) => (
            (n > 0 || quick === k) && (
              <button key={k} type="button" aria-pressed={quick === k} onClick={() => setQuick(quick === k ? '' : k)}
                className={`btn btn-sm ${quick === k ? 'btn-primary' : 'btn-secondary'}`} style={{ borderRadius: 999 }}>
                {l} <span style={{ opacity: .75 }}>{n}</span>
              </button>
            )
          ))}
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th {...thProps('lname', 'Provider')} />
              {tv.isOn('npi') && <th {...thProps('npi', 'NPI')} />}
              {tv.isOn('caqh') && <th {...thProps('caqh', 'CAQH')} />}
              {tv.isOn('spec') && <th {...thProps('spec', 'Specialty')} />}
              {tv.isOn('status') && <th {...thProps('status', 'Status')} />}
              {tv.isOn('next') && <th {...thProps('_next', 'Next Expiry')} />}
              {tv.isOn('ready') && <th {...thProps('_ready', 'Readiness')} style={{ width: 130, cursor: 'pointer' }} />}
              {tv.isOn('payers') && <th className="no-sort">Active payers</th>}
              {tv.isOn('license') && <th {...thProps('licenseExp', 'License expires')} />}
              {tv.isOn('malpractice') && <th {...thProps('malExp', 'Malpractice expires')} />}
              {tv.isOn('dea') && <th {...thProps('deaExp', 'DEA expires')} />}
              {tv.isOn('caqhDue') && <th {...thProps('caqhDue', 'CAQH due')} />}
              <th className="no-sort" style={{ width: 52, textAlign: 'center' }}>⋯</th>
            </tr>
          </thead>
          <tbody>
            {!list.length ? (
              <tr>
                <td colSpan={tv.visibleCount + 1}>
                  <div className="empty-state">
                    <div className="ei">👥</div>
                    <h4>{hasFilters ? 'No providers match your filters' : 'No providers yet'}</h4>
                    <p style={{ fontSize: 12.5, color: 'var(--text-4)', margin: '4px 0 14px' }}>
                      {hasFilters
                        ? 'Try adjusting your search or filter criteria.'
                        : 'Add your first provider to start tracking credentialing.'}
                    </p>
                    {hasFilters
                      ? <button className="btn btn-secondary btn-sm" onClick={clearAll}>Clear filters</button>
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
              const readiness  = p._ready
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
                          ? <AvatarImg src={p.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
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
                  {tv.isOn('npi') && (
                    <td>
                    <span className="mono">{p.npi || '—'}</span>
                  </td>
                  )}

                  {/* CAQH */}
                  {tv.isOn('caqh') && (
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
                  )}

                  {/* Specialty */}
                  {tv.isOn('spec') && (
                    <td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: sc, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{p.spec || '—'}</span>
                    </span>
                  </td>
                  )}

                  {/* Status */}
                  {tv.isOn('status') && (
                    <td><StatusBadge status={p.status} /></td>
                  )}

                  {/* Next Expiry — replaces Medicaid ID (moved to action menu) */}
                  {tv.isOn('next') && <td><NextExpiryCell prov={p} /></td>}

                  {/* Readiness */}
                  {tv.isOn('ready') && <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, height: 4, borderRadius: 4, background: 'var(--border)', overflow: 'hidden', minWidth: 50 }}>
                        <div style={{ height: '100%', width: `${readiness}%`, background: rdColor, borderRadius: 4, transition: 'width .3s' }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: rdColor, minWidth: 30, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {readiness}% <span style={{ fontWeight: 600 }}>{readinessWord(readiness)}</span>
                      </span>
                    </div>
                  </td>}

                  {tv.isOn('payers') && (
                    <td style={{ fontSize: 13 }}>
                      {(() => {
                        const names = db.enrollments.filter(e => e.provId === p.id && e.stage === 'Active')
                          .map(e => (db.payers.find(x => x.id === e.payId) || {}).name).filter(Boolean)
                        return names.length ? names.join(', ') : <span style={{ color: 'var(--text-muted)' }}>None active</span>
                      })()}
                    </td>
                  )}
                  {tv.isOn('license') && <td>{p.licenseExp ? fmtDate(p.licenseExp) : '—'}</td>}
                  {tv.isOn('malpractice') && <td>{p.malExp ? fmtDate(p.malExp) : '—'}</td>}
                  {tv.isOn('dea') && <td>{p.deaExp ? fmtDate(p.deaExp) : '—'}</td>}
                  {tv.isOn('caqhDue') && <td>{p.caqhDue ? fmtDate(p.caqhDue) : '—'}</td>}

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
