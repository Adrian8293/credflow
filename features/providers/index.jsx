import { useSorted } from '../../hooks/useSorted.js'
import { Badge, ExpiryBadge } from '../../components/ui/Badge.jsx'
import { SPEC_COLORS } from '../../constants/stages.js'
import { useState } from 'react'
import { WorkflowProviderCard, providerReadiness, daysUntilWF as daysUntil } from '../../components/WorkflowOverhaul'

export function Providers({ db, search, setSearch, fStatus, setFStatus, fSpec, setFSpec, openProvDetail, editProvider, setPage, setProvForm, setEditingId, setNpiInput, setNpiResult, syncFromNPPES }) {
  const [sortBy, setSortBy] = useState('name')
  const filtered = db.providers.filter(p => {
    const txt = `${p.fname} ${p.lname} ${p.cred} ${p.npi} ${p.focus} ${p.spec} ${p.email||''} ${p.phone||''} ${p.license||''} ${p.medicaid||''} ${p.caqh||''} ${p.dea||''} ${p.supervisor||''} ${p.notes||''}`.toLowerCase()
    return (!search || txt.includes(search.toLowerCase())) && (!fStatus || (p.status||'').trim()===fStatus) && (!fSpec || (p.spec||'').trim().toLowerCase()===fSpec.toLowerCase())
  })
  const list = [...filtered].sort((a, b) => {
    if (sortBy === 'name')  return `${a.lname} ${a.fname}`.localeCompare(`${b.lname} ${b.fname}`)
    if (sortBy === 'fname') return `${a.fname} ${a.lname}`.localeCompare(`${b.fname} ${b.lname}`)
    if (sortBy === 'spec') return (a.spec||'').localeCompare(b.spec||'')
    if (sortBy === 'status') return (a.status||'').localeCompare(b.status||'')
    if (sortBy === 'license') { const da=daysUntil(a.licenseExp), db2=daysUntil(b.licenseExp); return (da??99999)-(db2??99999) }
    if (sortBy === 'panels') { const pa=db.enrollments.filter(e=>e.provId===a.id&&e.stage==='Active').length; const pb=db.enrollments.filter(e=>e.provId===b.id&&e.stage==='Active').length; return pb-pa }
    if (sortBy === 'readiness') { return providerReadiness(a) - providerReadiness(b) }
    return 0
  })
  return <div className="page">
    <div className="toolbar">
      <div className="search-box"><span className="si">🔍</span><input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, NPI, license, specialty…" style={{width:280}} /></div>
      <select className="filter-select" value={fStatus} onChange={e=>setFStatus(e.target.value)}><option value="">All Statuses</option><option>Active</option><option>Pending</option><option>Inactive</option></select>
      <select className="filter-select" value={fSpec} onChange={e=>setFSpec(e.target.value)}><option value="">All Specialties</option><option>Mental Health</option><option>Massage Therapy</option><option>Naturopathic</option><option>Chiropractic</option><option>Acupuncture</option></select>
      <select className="filter-select" value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{minWidth:140}}>
        <option value="name">Sort: Last Name A–Z</option>
        <option value="fname">Sort: First Name A–Z</option>
        <option value="spec">Sort: Specialty</option>
        <option value="status">Sort: Status</option>
        <option value="license">Sort: License Expiry</option>
        <option value="panels">Sort: Active Panels</option>
        <option value="readiness">Sort: Readiness ↑</option>
      </select>
      <div className="toolbar-right"><button className="btn btn-primary btn-sm" onClick={()=>{setProvForm({});setEditingId(e=>({...e,provider:null}));setNpiInput('');setNpiResult(null);setPage('add-provider')}}>＋ Add Provider</button></div>
    </div>
    {!list.length ? <div className="empty-state"><div className="ei">👤</div><h4>No providers found</h4></div> : list.map(p => (
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
}

// ─── ADD / EDIT PROVIDER ───────────────────────────────────────────────────────
// ─── NpiLookupPanel ──────────────────────────────────────────────────────────
// Dual-mode NPI lookup for Add/Edit Provider:
//   Mode A — lookup by 10-digit NPI number (instant auto-fill)
//   Mode B — search by name (inline, no redirect needed)
// Either way, selecting a result pre-fills the provider form.

export { Providers }
