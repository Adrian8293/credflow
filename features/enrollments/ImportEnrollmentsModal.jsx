/**
 * ImportEnrollmentsModal — bulk-add payer enrollments from a CSV (round-trips with "Export CSV").
 * Providers and payers are matched to existing records; nothing is auto-created.
 */
import { useMemo, useRef, useState } from 'react'
import { Modal } from '../../components/ui/Modal.jsx'
import { parseCsv } from '../../lib/providerImport.js'
import { buildEnrollmentRows, ENROLLMENT_TEMPLATE_CSV } from '../../lib/enrollmentImport.js'
import { importEnrollments } from '../../lib/db.js'

const MAX_ROWS = 500

export function ImportEnrollmentsModal({ providers = [], payers = [], existing = [], onClose, onImported }) {
  const [parsed, setParsed] = useState(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const valid = useMemo(() => (parsed ? parsed.rows.filter(r => r.errors.length === 0) : []), [parsed])
  const bad = parsed ? parsed.rows.length - valid.length : 0

  async function onFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setError(''); setResult(null)
    if (f.size > 2 * 1024 * 1024) { setError('That file is over 2 MB — split it into smaller files.'); return }
    try {
      const built = buildEnrollmentRows(parseCsv(await f.text()), providers, payers, existing)
      if (built.rows.length > MAX_ROWS) { setError(`Up to ${MAX_ROWS} enrollments per import — this file has ${built.rows.length}.`); return }
      setFileName(f.name); setParsed(built)
    } catch (err) { setError('Could not read that file: ' + err.message) }
  }

  async function run() {
    setBusy(true); setError('')
    try {
      const saved = await importEnrollments(valid)
      setResult({ count: saved.length })
      onImported?.(saved)
    } catch (err) { setError(err.message || 'Import failed — please retry.') }
    finally { setBusy(false) }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([ENROLLMENT_TEMPLATE_CSV], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'enrollment_import_template.csv'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const footer = result
    ? <button className="btn btn-primary" onClick={onClose}>Done</button>
    : <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={run} disabled={busy || !parsed || valid.length === 0 || parsed.missingRequired.length > 0}>
          {busy ? 'Importing…' : `Import ${valid.length || ''} application${valid.length === 1 ? '' : 's'}`}
        </button>
      </>

  const bad_ = 'var(--danger, #b42318)'
  return (
    <Modal title="Import applications from CSV" sub="Matches existing providers and payers — nothing new is created." onClose={onClose} footer={footer} lg>
      {result ? (
        <div style={{ padding: '18px 4px', fontSize: 13.5, color: 'var(--text-1)' }}>
          ✓ Imported <strong>{result.count}</strong> application{result.count === 1 ? '' : 's'}. Each one has an audit-trail entry.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.5 }}>
            Needs <strong>Provider</strong> (full name) or <strong>NPI</strong>, and <strong>Payer</strong> (exactly as named on the Payers page).
            Optional: Type (Individual/Group), Group, Group NPI, Stage, Submitted, Credentialing Effective, Contract Effective, Effective Date, Follow-up, Notes.
            The file from <em>Export CSV</em> works as-is. Dates: MM/DD/YYYY. Existing provider + payer pairs are skipped.
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()}>{fileName ? `Change file (${fileName})` : 'Choose CSV file'}</button>
            <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}>↓ Download template</button>
            <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
          </div>
          {error && <div role="alert" style={{ color: bad_, fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
          {parsed && parsed.missingRequired.length > 0 && (
            <div role="alert" style={{ color: bad_, fontSize: 12.5, marginBottom: 10 }}>Missing required column(s): {parsed.missingRequired.join(', ')}. Use the template for the exact headers.</div>
          )}
          {parsed && parsed.unknownHeaders.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-4)', marginBottom: 10 }}>Ignored columns: {parsed.unknownHeaders.join(', ')}</div>
          )}
          {parsed && parsed.rows.length > 0 && (
            <>
              <div style={{ fontSize: 12.5, marginBottom: 8, color: 'var(--text-2)' }}>
                <strong>{valid.length}</strong> ready to import{bad > 0 && <> · <span style={{ color: bad_ }}><strong>{bad}</strong> will be skipped</span></>}
              </div>
              <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
                  <thead><tr><th>Row</th><th>Provider</th><th>Payer</th><th>Stage</th><th>Result</th></tr></thead>
                  <tbody>
                    {parsed.rows.map(r => (
                      <tr key={r.line}>
                        <td>{r.line}</td><td>{r.provName || '—'}</td><td>{r.payName || '—'}</td><td>{r.enrollment.stage}</td>
                        <td style={{ color: r.errors.length ? bad_ : r.warnings.length ? 'var(--warning, #b54708)' : 'var(--success, #067647)' }}>
                          {r.errors.length ? r.errors.join('; ') : r.warnings.length ? `OK · ${r.warnings.join('; ')}` : 'OK'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {parsed && parsed.rows.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No data rows found in that file.</div>}
        </>
      )}
    </Modal>
  )
}
