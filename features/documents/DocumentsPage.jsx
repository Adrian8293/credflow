// DocumentsPage — 5 sub-tabs: All Docs · Missing Docs · Expiring Soon · OPCA Intake · Verified
// All existing components are preserved and rendered inside tabs.
import { useState } from 'react'
import { Documents } from './Documents.jsx'
import { MissingDocuments } from './MissingDocuments.jsx'
import { daysUntil, fmtDate, fmtFull, pName } from '../../lib/helpers.js'
import { Badge, ExpiryBadge } from '../../components/ui/Badge.jsx'
import { NO_EXPIRY_TYPES } from '../../hooks/useDocumentActions.js'
import OpcaUploadPanel from '../../components/OpcaUploadPanel.jsx'
import { useFeatures } from '../../hooks/useFeatures.js'
import { csvFromRows, downloadCsv } from '../../lib/csv.js'

const TABS = [
  { id: 'all',      label: 'All Documents' },
  { id: 'missing',  label: 'Missing Documents' },
  { id: 'expiring', label: 'Expiring Soon' },
  { id: 'opca',     label: 'OPCA Intake' },
  { id: 'verified', label: 'Current / OK' },
]

function ExpiringSoon({ db, openDocModal, alertDays = 90 }) {
  const inactive = new Set(db.providers.filter(p => p.status === 'Inactive').map(p => p.id))
  const docs = db.documents
    .map(d => ({ ...d, days: daysUntil(d.exp) }))
    .filter(d => d.days !== null && d.days <= alertDays && !inactive.has(d.provId))
    .sort((a, b) => a.days - b.days)

  return (
    <div>
      {docs.length === 0 ? (
        <div className="empty-state"><div className="ei"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><h4>No documents expiring soon</h4><p>All documents are valid beyond {alertDays} days.</p></div>
      ) : (
        <>
          <div style={{ background: 'rgba(245,158,11,.07)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 'var(--r)', padding: '10px 14px', marginBottom: 12, fontSize: 12, color: 'var(--amber-d)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
            ⚠ {docs.length} document{docs.length > 1 ? 's' : ''} expiring within {alertDays} days — take action now.
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr>
                <th className="no-sort">Provider</th>
                <th className="no-sort">Document</th>
                <th className="no-sort">Type</th>
                <th className="no-sort">Expiration</th>
                <th className="no-sort">Days Left</th>
                <th className="no-sort">Action</th>
              </tr></thead>
              <tbody>
                {docs.map(d => {
                  const isCrit = d.days <= 30
                  return (
                    <tr key={d.id} style={{ background: isCrit ? 'rgba(239,68,68,.03)' : undefined }}>
                      <td style={{ fontWeight: 500 }}>{pName(db.providers, d.provId)}</td>
                      <td style={{ fontWeight: 600, color: 'var(--text-1)' }}>{d.type}</td>
                      <td>{d.issuer || '—'}</td>
                      <td style={{ fontFamily: 'var(--fn-mono)', fontSize: 11.5, color: isCrit ? 'var(--danger)' : 'var(--warning)', fontWeight: 600 }}>{fmtDate(d.exp)}</td>
                      <td><span className={`badge ${isCrit ? 'b-red' : 'b-amber'}`}>{d.days} days</span></td>
                      <td><button className="btn btn-primary btn-sm" onClick={() => openDocModal && openDocModal(d.id)}>Renew</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function OpcaIntake({ db }) {
  const feat = useFeatures()
  const [selectedProv, setSelectedProv] = useState('')
  const provider = db.providers.find(p => p.id === selectedProv) || null

  // Recent OPCA intakes: docs of type "OPCA" or similar
  const opcaDocs = db.documents.filter(d => d.type && d.type.toLowerCase().includes('opca'))

  return (
    <div className="grid-2" style={{ alignItems: 'flex-start' }}>
      <div>
        <div className="card mb-12">
          <div className="card-header">
            <h3>OPCA PDF Intake</h3>
            <span className={`badge ${feat.ai ? 'b-blue' : 'b-gray'}`}>{feat.ai ? 'AI-assisted' : 'Free form reader'}</span>
          </div>
          <div className="card-body">
            <div style={{ background: 'var(--pr-l)', border: '1px solid #BFDBFE', borderRadius: 'var(--r)', padding: '10px 13px', marginBottom: 13, fontSize: 11.5, color: '#1e40af', fontWeight: 500, display: 'flex', gap: 7 }}>
              ℹ {feat.ai
                ? 'Upload an OPCA PDF. AI reads the form and the data is saved for your review.'
                : 'Upload an OPCA PDF that still has its fillable form fields. Core credentialing fields (name, license, DEA, NPI, malpractice, board certifications) are read for free; work history, education and references are not, so enter those by hand.'}
              {' '}Personal details such as home address, birth date and demographics are {feat.opcaStoresPersonal ? 'saved (OPCA_STORE_PERSONAL is on)' : 'not saved'}.
            </div>
            <div className="fg" style={{ marginBottom: 12 }}>
              <label>Select Provider</label>
              <select value={selectedProv} onChange={e => setSelectedProv(e.target.value)}>
                <option value="">— Choose a provider —</option>
                {db.providers.map(p => <option key={p.id} value={p.id}>{p.fname} {p.lname}{p.cred ? `, ${p.cred}` : ''}</option>)}
              </select>
            </div>
            {selectedProv ? (
              <OpcaUploadPanel provider={provider} onComplete={() => {}} />
            ) : (
              <div style={{ border: '2px dashed var(--border)', borderRadius: 'var(--r)', padding: 28, textAlign: 'center', background: 'var(--elevated)', color: 'var(--text-3)' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>Select a provider to upload OPCA PDF</div>
                <div style={{ fontSize: 11.5 }}>2023 · 2024 · 2025 versions supported</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div>
        {/* Recent intakes */}
        <div className="card mb-12">
          <div className="card-header"><h3>Recent OPCA Intakes</h3></div>
          <div className="card-body" style={{ padding: '4px 16px' }}>
            {opcaDocs.length === 0 ? (
              <div className="text-muted" style={{ padding: '14px 0' }}>No OPCA documents uploaded yet.</div>
            ) : (
              opcaDocs.slice(0, 6).map((d, i) => (
                <div key={d.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: i < Math.min(opcaDocs.length, 6) - 1 ? '1px solid var(--border-l)' : 'none' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-1)' }}>{pName(db.providers, d.provId)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{d.type} · {d.issuer || 'Extracted'}</div>
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{fmtDate(d.exp)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function VerifiedDocs({ db, alertDays = 90 }) {
  // Docs that are active (not expired)
  const docs = db.documents.filter(d => {
    if (NO_EXPIRY_TYPES.has(d.type)) return true  // exempt types are always current
    const days = daysUntil(d.exp)
    return days !== null && days > alertDays
  })
  return (
    <div className="tbl-wrap">
      <table>
        <thead><tr>
          <th className="no-sort">Provider</th>
          <th className="no-sort">Document</th>
          <th className="no-sort">Type</th>
          <th className="no-sort">Expiration</th>
          <th className="no-sort">Status</th>
        </tr></thead>
        <tbody>
          {!docs.length ? (
            <tr><td colSpan={5}><div className="empty-state"><div className="ei"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><h4>All documents are current and on file</h4></div></td></tr>
          ) : docs.map(d => (
            <tr key={d.id}>
              <td style={{ fontWeight: 500 }}>{pName(db.providers, d.provId)}</td>
              <td style={{ fontWeight: 600, color: 'var(--text-1)' }}>{d.type}</td>
              <td>{d.issuer || '—'}</td>
              <td style={{ fontFamily: 'var(--fn-mono)', fontSize: 11.5 }}>{fmtDate(d.exp)}</td>
              <td><span className="badge b-green">✓ Current</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}


function exportDocumentsCSV(documents, providers) {
  const headers = ['Provider', 'Document Type', 'Expiration Date', 'Days Until Expiry', 'File Name', 'Notes']
  const rows = documents.map(d => {
    const prov = providers.find(p => p.id === d.provId) || {}
    const daysLeft = d.exp ? daysUntil(d.exp) : ''
    return [
      ((prov.fname || '') + ' ' + (prov.lname || '')).trim(),
      d.type || '',
      d.exp || '',
      String(daysLeft),
      d.fileName || '',
      d.notes || '',
    ]
  })
  downloadCsv('documents_' + new Date().toISOString().split('T')[0] + '.csv', csvFromRows([headers, ...rows]))
}

export function DocumentsPage({ db, docSearch, setDocSearch, docFType, setDocFType, docFStatus, setDocFStatus, openDocModal, handleDeleteDocument }) {
  const [tab, setTab] = useState('all')

  const alertDays = db.settings?.alertDays || 90
  const expCount = db.documents.filter(d => { const days = daysUntil(d.exp); return days !== null && days <= alertDays }).length
  // missCount: providers missing required credential fields (NPI, license, malpractice)
  const missCount = db.providers.filter(p => p.status === 'Active' && (!p.npi || !p.licenseExp || !p.malExp)).length

  return (
    <div className="page">
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:800, color:'var(--text-1)', letterSpacing:'-.04em', margin:0, marginBottom:4 }}>Documents</h2>
          <p style={{ fontSize:12.5, color:'var(--text-4)', margin:0 }}>Store and manage all provider credential documents.</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => exportDocumentsCSV(db.documents, db.providers)} title="Export all documents to CSV">↓ Export CSV</button>
          <button className="btn btn-primary btn-sm" onClick={() => openDocModal()} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Document
          </button>
        </div>
      </div>
      <div className="tabs">
        {TABS.map(t => (
          <div key={t.id} className={`tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'expiring' && expCount > 0 && <span style={{ marginLeft: 5, background: 'rgba(245,158,11,.15)', color: 'var(--amber-d)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 9, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{expCount}</span>}
            {t.id === 'missing'  && <span style={{ marginLeft: 5, background: 'rgba(239,68,68,.1)', color: '#991B1B', border: '1px solid rgba(239,68,68,.22)', borderRadius: 9, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{missCount}</span>}
          </div>
        ))}
      </div>

      {tab === 'all'      && <Documents db={db} search={docSearch} setSearch={setDocSearch} fType={docFType} setFType={setDocFType} fStatus={docFStatus} setFStatus={setDocFStatus} openDocModal={openDocModal} handleDeleteDocument={handleDeleteDocument} />}
      {tab === 'missing'  && <MissingDocuments db={db} />}
      {tab === 'expiring' && <ExpiringSoon db={db} openDocModal={openDocModal} alertDays={alertDays} />}
      {tab === 'opca'     && <OpcaIntake db={db} />}
      {tab === 'verified' && <VerifiedDocs db={db} alertDays={alertDays} />}
    </div>
  )
}

export default DocumentsPage
