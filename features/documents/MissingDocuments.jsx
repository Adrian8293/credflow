import { daysUntil, fmtDate, pName } from '../../lib/helpers.js'
import { Badge } from '../../components/ui/Badge.jsx'
import { REQUIRED_DOCS } from '../../constants/payerRequirements.js'

function MissingDocuments({ db }) {
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
          {errors.length > 0 && <span className="badge b-red">⚠ {errors.length} Critical</span>}
          {warns.length > 0 && <span className="badge b-amber">! {warns.length} Warnings</span>}
          {filtered.length === 0 && <span className="badge b-green">✅ All Clear</span>}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="empty-state"><div className="ei">✅</div><h4>No issues found</h4><p>All required documents are on file and current.</p></div>
      ) : (
        <>
          {errors.length > 0 && (
            <div className="mb-20">
              <div className="text-xs font-500" style={{ letterSpacing:'.6px', textTransform:'uppercase', color:'var(--red)', marginBottom:10 }}>🔴 Critical — Missing or Expired ({errors.length})</div>
              {errors.map((issue, i) => (
                <div key={i} className="missing-doc-row">
                  <div className="missing-doc-icon">❌</div>
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
                  <div className="missing-doc-icon">⚠️</div>
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

export { MissingDocuments }
