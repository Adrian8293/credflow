import { daysUntil, fmtDate, pName } from '../../lib/helpers.js'
import { Badge } from '../../components/ui/Badge.jsx'
import { REQUIRED_DOCS } from '../../constants/payerRequirements.js'
import { useState } from 'react'

export function MissingDocuments({ db }) {
  const [filterSeverity, setFilterSeverity] = useState('')
  const [filterProv, setFilterProv] = useState('')

  const issues = []
  db.providers.filter(p => p.status === 'Active').forEach(prov => {
    REQUIRED_DOCS.forEach(req => {
      if (req.skipIf && req.skipIf(prov)) return
      let missing = false
      if (req.checkFn) {
        missing = !req.checkFn(prov, db.documents)
      } else if (req.field) {
        const val = prov[req.field]
        if (!val) { missing = true }
        else {
          const days = daysUntil(val)
          if (days !== null && days < 0) missing = true
        }
      }
      if (missing) issues.push({ prov, label: req.label, severity: req.severity, key: req.key })
    })
    // Also flag expired documents from the documents table
    db.documents.filter(d => d.provId === prov.id).forEach(doc => {
      const days = daysUntil(doc.exp)
      if (days !== null && days < 0) {
        issues.push({ prov, label: `${doc.type} EXPIRED`, severity: 'error', key: `doc-${doc.id}`, detail: `Expired ${Math.abs(days)} days ago` })
      } else if (days !== null && days <= 30) {
        issues.push({ prov, label: `${doc.type} expiring soon`, severity: 'warn', key: `doc-exp-${doc.id}`, detail: `${days} days remaining` })
      }
    })
  })

  const filtered = issues.filter(i =>
    (!filterSeverity || i.severity === filterSeverity) &&
    (!filterProv || i.prov.id === filterProv)
  )
  const errors = filtered.filter(i => i.severity === 'error')
  const warns = filtered.filter(i => i.severity === 'warn')

  return (
    <div className="page">
      <div className="toolbar" style={{ marginBottom:18 }}>
        <select className="filter-select" value={filterSeverity} onChange={e=>setFilterSeverity(e.target.value)}>
          <option value="">All Issues</option>
          <option value="error">Critical Only</option>
          <option value="warn">Warnings Only</option>
        </select>
        <select className="filter-select" value={filterProv} onChange={e=>setFilterProv(e.target.value)}>
          <option value="">All Providers</option>
          {db.providers.filter(p=>p.status==='Active').map(p=><option key={p.id} value={p.id}>{p.fname} {p.lname}</option>)}
        </select>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          {errors.length > 0 && <span className="badge b-red"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> {errors.length} Critical</span>}
          {warns.length > 0 && <span className="badge b-amber">! {warns.length} Warnings</span>}
          {filtered.length === 0 && <span className="badge b-green"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> All Clear</span>}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="empty-state"><div className="ei"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><h4>No issues found</h4><p>All required documents are on file and current.</p></div>
      ) : (
        <>
          {errors.length > 0 && (
            <div className="mb-20">
              <div className="text-xs font-500" style={{ letterSpacing:'.6px', textTransform:'uppercase', color:'var(--red)', marginBottom:10 }}>🔴 Critical — Missing or Expired ({errors.length})</div>
              {errors.map((issue, i) => (
                <div key={i} className="missing-doc-row">
                  <div className="missing-doc-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
                  <div className="missing-doc-body">
                    <div className="missing-doc-title">{issue.prov.fname} {issue.prov.lname}{issue.prov.cred ? `, ${issue.prov.cred}` : ''}</div>
                    <div className="missing-doc-sub">{issue.label}{issue.detail ? ` · ${issue.detail}` : ''}</div>
                  </div>
                  <div className="missing-doc-badge"><span className="badge b-red">Action Required</span></div>
                </div>
              ))}
            </div>
          )}
          {warns.length > 0 && (
            <div>
              <div className="text-xs font-500" style={{ letterSpacing:'.6px', textTransform:'uppercase', color:'var(--amber)', marginBottom:10 }}>🟡 Warnings — Review Recommended ({warns.length})</div>
              {warns.map((issue, i) => (
                <div key={i} className="missing-doc-row warn">
                  <div className="missing-doc-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
                  <div className="missing-doc-body">
                    <div className="missing-doc-title">{issue.prov.fname} {issue.prov.lname}{issue.prov.cred ? `, ${issue.prov.cred}` : ''}</div>
                    <div className="missing-doc-sub">{issue.label}{issue.detail ? ` · ${issue.detail}` : ''}</div>
                  </div>
                  <div className="missing-doc-badge"><span className="badge b-amber">Review</span></div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── PAYER REQUIREMENTS ─────────────────────────────────────────────────────────
