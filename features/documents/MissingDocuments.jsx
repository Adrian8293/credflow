import { daysUntil, fmtDate, pName } from '../../lib/helpers.js'
import { Badge } from '../../components/ui/Badge.jsx'
import { REQUIRED_DOCS } from '../../constants/payerRequirements.js'
import { useState } from 'react'
import { createRequest } from '../../lib/db'
import { DOC_TYPES } from '../../constants/docTypes.js'

// What each requirement needs, and how it gets fixed.
//  type  = a document the provider can send (we can request it, or add it ourselves)
//  field = a value that lives on the provider record (edit the provider)
const FIX = {
  license: { how: 'type', docType: 'License' },
  malpractice: { how: 'type', docType: 'Malpractice' },
  w9: { how: 'type', docType: 'W-9' },
  dea: { how: 'type', docType: 'DEA' },
  supAgreement: { how: 'type', docType: 'Supervision Agreement' },
  npi: { how: 'field', hint: 'Add the NPI' },
  caqh: { how: 'field', hint: 'Add the CAQH number' },
  caqhAttest: { how: 'field', hint: 'Set the attestation date' },
  recred: { how: 'field', hint: 'Set the date' },
}

export function MissingDocuments({ db, openDocModal, actions = {} }) {
  const { setDb, toast, setPage, editProvider, setDocForm, requestConfirm } = actions
  const [busy, setBusy] = useState('')
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
      if (missing) issues.push({ prov, label: req.label, severity: req.severity, key: req.key, fix: FIX[req.key] })
    })
    // Also flag expired documents from the documents table
    db.documents.filter(d => d.provId === prov.id).forEach(doc => {
      const days = daysUntil(doc.exp)
      if (days !== null && days < 0) {
        issues.push({ prov, label: `${doc.type} EXPIRED`, severity: 'error', key: `doc-${doc.id}`, doc, fix: { how: 'doc', docType: doc.type }, detail: `Expired ${Math.abs(days)} days ago` })
      } else if (days !== null && days <= 30) {
        issues.push({ prov, label: `${doc.type} expiring soon`, severity: 'warn', key: `doc-exp-${doc.id}`, doc, fix: { how: 'doc', docType: doc.type }, detail: `${days} days remaining` })
      }
    })
  })

  const openReqs = (db.requests || []).filter(r => r.status === 'requested' || r.status === 'submitted')
  const reqFor = (issue) => issue.fix?.docType && openReqs.find(r => r.provId === issue.prov.id && r.docType === issue.fix.docType)

  async function request(issue) {
    const docType = DOC_TYPES.includes(issue.fix.docType) ? issue.fix.docType : 'Other'
    const k = issue.prov.id + issue.key
    setBusy(k)
    try {
      const due = new Date(); due.setDate(due.getDate() + 14)
      const dueStr = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`
      const r = await createRequest({ provId: issue.prov.id, docType, title: docType, note: '', due: dueStr })
      setDb?.(prev => ({ ...prev, requests: [r, ...(prev.requests || [])] }))
      toast?.(`Requested from ${issue.prov.fname} ${issue.prov.lname}. Due in 14 days. Track it on the Requests page.`, 'success')
    } catch (e) { toast?.(e.message || 'Could not send the request', 'error') }
    finally { setBusy('') }
  }
  // One tap: ask for everything that is missing and not already requested (skips renewals of existing files).
  const dueStr = () => { const d = new Date(); d.setDate(d.getDate() + 14); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  async function requestAll(list) {
    const seen = new Set()
    const todo = list.filter(i => {
      const k = i.prov.id + '|' + i.fix.docType
      if (seen.has(k) || reqFor(i)) return false
      seen.add(k); return true
    })
    if (!todo.length) return
    const names = [...new Set(todo.map(i => `${i.prov.fname} ${i.prov.lname}`))]
    const ok = requestConfirm ? await requestConfirm({
      title: `Ask for ${todo.length} document${todo.length === 1 ? '' : 's'}?`,
      body: `Sends ${todo.length} request${todo.length === 1 ? '' : 's'} to ${names.length === 1 ? names[0] : `${names.length} providers`}, each due in 14 days. They see them in their portal.`,
      confirmText: `Send ${todo.length} request${todo.length === 1 ? '' : 's'}`,
    }) : true
    if (!ok) return
    setBusy('all')
    let sent = 0
    try {
      for (const i of todo) {
        const docType = DOC_TYPES.includes(i.fix.docType) ? i.fix.docType : 'Other'
        const r = await createRequest({ provId: i.prov.id, docType, title: docType, note: '', due: dueStr() })
        setDb?.(prev => ({ ...prev, requests: [r, ...(prev.requests || [])] }))
        sent++
      }
      toast?.(`Sent ${sent} request${sent === 1 ? '' : 's'}. Track them on the Requests page.`, 'success')
    } catch (e) { toast?.(`Sent ${sent}, then stopped: ${e.message || 'something went wrong'}`, 'error') }
    finally { setBusy('') }
  }
  function addMyself(issue) {
    if (issue.fix.how === 'doc' && issue.doc) { openDocModal?.(issue.doc.id); return }
    openDocModal?.()
    setDocForm?.({ type: DOC_TYPES.includes(issue.fix.docType) ? issue.fix.docType : 'Other', provId: issue.prov.id })
  }
  function editProv(issue) { editProvider?.(issue.prov.id); setPage?.('providers') }

  function Actions({ issue }) {
    const f = issue.fix
    if (!f) return null
    const open = reqFor(issue)
    const k = issue.prov.id + issue.key
    if (f.how === 'field') {
      return <button className="btn btn-sm btn-primary" onClick={() => editProv(issue)}>{f.hint || 'Fix it'} →</button>
    }
    return (
      <>
        {open
          ? <span className="badge b-blue" title="Waiting on the provider. See the Requests page.">{open.status === 'submitted' ? 'Uploaded — review' : 'Requested'}</span>
          : <button className="btn btn-sm btn-primary" disabled={busy === k} onClick={() => request(issue)}>{busy === k ? 'Sending…' : f.how === 'doc' ? 'Request renewal' : 'Ask provider'}</button>}
        <button className="btn btn-sm btn-secondary" onClick={() => addMyself(issue)}>{f.how === 'doc' ? 'Update it' : 'Add it myself'}</button>
      </>
    )
  }

  const filtered = issues.filter(i =>
    (!filterSeverity || i.severity === filterSeverity) &&
    (!filterProv || i.prov.id === filterProv)
  )
  const askable = filtered.filter(i => i.fix?.how === 'type')
  const askableCount = new Set(askable.filter(i => !reqFor(i)).map(i => i.prov.id + '|' + i.fix.docType)).size
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
        <div style={{ marginLeft:'auto', display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          {askableCount > 0 && (
            <button className="btn btn-primary btn-sm" disabled={busy === 'all'} onClick={() => requestAll(askable)}>
              {busy === 'all' ? 'Sending…' : `Ask for all ${askableCount} missing document${askableCount === 1 ? '' : 's'}`}
            </button>
          )}
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
                  <div className="missing-doc-badge" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}><Actions issue={issue} /></div>
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
                  <div className="missing-doc-badge" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}><Actions issue={issue} /></div>
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
