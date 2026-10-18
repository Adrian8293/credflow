/**
 * ImportProvidersModal — bulk-add providers from a CSV file.
 * Flow: choose file → preview with per-row validation → import valid rows only.
 * Credentialing fields only; unrecognized columns are ignored (never stored).
 */
import { useMemo, useRef, useState } from 'react'
import { Modal } from '../../components/ui/Modal.jsx'
import { parseCsv, buildImportRows, TEMPLATE_CSV } from '../../lib/providerImport.js'
import { importProviders } from '../../lib/db.js'

const MAX_ROWS = 500

export function ImportProvidersModal({ existing = [], onClose, onImported }) {
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
      const rows = parseCsv(await f.text())
      const built = buildImportRows(rows, existing)
      if (built.rows.length > MAX_ROWS) { setError(`Up to ${MAX_ROWS} providers per import — this file has ${built.rows.length}.`); return }
      setFileName(f.name); setParsed(built)
    } catch (err) { setError('Could not read that file: ' + err.message) }
  }

  async function run() {
    setBusy(true); setError('')
    try {
      const saved = await importProviders(valid.map(r => r.provider))
      setResult({ count: saved.length })
      onImported?.(saved)
    } catch (err) { setError(err.message || 'Import failed — nothing was partially hidden; check the list and retry.') }
    finally { setBusy(false) }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'provider_import_template.csv'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const footer = result
    ? <button className="btn btn-primary" onClick={onClose}>Done</button>
    : <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={run} disabled={busy || !parsed || valid.length === 0 || parsed.missingRequired.length > 0}>
          {busy ? 'Importing…' : `Import ${valid.length || ''} provider${valid.length === 1 ? '' : 's'}`}
        </button>
      </>

  return (
    <Modal title="Import providers from CSV" sub="Credentialing details only — no SSNs or patient information." onClose={onClose} footer={footer} lg>
      {result ? (
        <div style={{ padding: '18px 4px', fontSize: 13.5, color: 'var(--text-1)' }}>
          ✓ Imported <strong>{result.count}</strong> provider{result.count === 1 ? '' : 's'}. New providers start as <em>Pending</em> unless the file said otherwise.
          Next: add their licenses and start enrollments from each provider’s page.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.5 }}>
            Needs at least <strong>First Name</strong> and <strong>Last Name</strong>. Optional: Credential, Specialty, NPI, Email, Phone, CAQH ID,
            License Number / State / Expiration, Malpractice Carrier / Policy / Expiration, DEA, Status. Dates: YYYY-MM-DD or M/D/YYYY.
            Providers whose NPI already exists are skipped.
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()}>{fileName ? `Change file (${fileName})` : 'Choose CSV file'}</button>
            <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}>↓ Download template</button>
            <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
          </div>
          {error && <div role="alert" style={{ color: 'var(--danger, #b42318)', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
          {parsed && parsed.missingRequired.length > 0 && (
            <div role="alert" style={{ color: 'var(--danger, #b42318)', fontSize: 12.5, marginBottom: 10 }}>
              Missing required column(s): {parsed.missingRequired.join(', ')}. Use the template for the exact headers.
            </div>
          )}
          {parsed && parsed.unknownHeaders.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-4)', marginBottom: 10 }}>Ignored columns: {parsed.unknownHeaders.join(', ')}</div>
          )}
          {parsed && parsed.rows.length > 0 && (
            <>
              <div style={{ fontSize: 12.5, marginBottom: 8, color: 'var(--text-2)' }}>
                <strong>{valid.length}</strong> ready to import{bad > 0 && <> · <span style={{ color: 'var(--danger, #b42318)' }}><strong>{bad}</strong> will be skipped</span></>}
              </div>
              <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
                  <thead><tr><th>Row</th><th>Name</th><th>NPI</th><th>License</th><th>Result</th></tr></thead>
                  <tbody>
                    {parsed.rows.map(r => (
                      <tr key={r.line}>
                        <td>{r.line}</td>
                        <td>{[r.provider.fname, r.provider.lname].filter(Boolean).join(' ')}{r.provider.cred ? `, ${r.provider.cred}` : ''}</td>
                        <td>{r.provider.npi || '—'}</td>
                        <td>{r.provider.license ? `${r.provider.licenseState || ''} ${r.provider.license}` : '—'}</td>
                        <td style={{ color: r.errors.length ? 'var(--danger, #b42318)' : r.warnings.length ? 'var(--warning, #b54708)' : 'var(--success, #067647)' }}>
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
