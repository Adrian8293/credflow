/**
 * StorageCard — Settings → Storage. Owner/admin only (the database refuses anyone else).
 * Shows how much file space this organization uses, the biggest files, and lets you remove the FILES of
 * documents that expired a while ago while keeping the record (type, number, dates) for history.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { deleteDocumentFile } from '../../lib/db'
import { useGlobalContext } from '../../context/AppContext'
import { daysUntil, fmtDate, pNameShort } from '../../lib/helpers'

const LIMIT_MB = Number(process.env.NEXT_PUBLIC_STORAGE_LIMIT_MB) || 1024   // Supabase free plan: 1 GB of files
const mb = (b) => (b / 1024 / 1024)
const fmtSize = (b) => (b >= 1024 * 1024 ? `${mb(b).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
const AGE_CHOICES = [[0, 'Already expired'], [90, 'Expired over 90 days ago'], [365, 'Expired over a year ago']]

export function StorageCard() {
  const { db, setDb, toast, requestConfirm } = useGlobalContext()
  const [rows, setRows] = useState(null)        // null = loading
  const [err, setErr] = useState('')
  const [age, setAge] = useState(90)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('documents_storage_report')
    if (error) {
      setErr(error.code === '42501' ? 'Only owners and admins can see storage.'
        : /does not exist|schema cache/i.test(error.message || '') ? 'Run migration 021 in Supabase to turn this on (the file is supabase-migration-021-storage-report.sql).'
        : (error.message || 'Could not load storage.'))
      setRows([]); return
    }
    setErr(''); setRows(Array.isArray(data) ? data : [])
  }, [])
  useEffect(() => { load() }, [load])

  const total = useMemo(() => (rows || []).reduce((n, r) => n + Number(r.size_bytes || 0), 0), [rows])
  const expired = useMemo(() => (rows || []).filter(r => {
    const d = daysUntil(r.exp)
    return d !== null && d < -age
  }), [rows, age])
  const expiredBytes = expired.reduce((n, r) => n + Number(r.size_bytes || 0), 0)
  const pct = Math.min(100, (mb(total) / LIMIT_MB) * 100)
  const barColor = pct >= 90 ? 'var(--danger)' : pct >= 70 ? 'var(--warning)' : 'var(--success)'
  const biggest = (rows || []).slice(0, 5)
  const provName = (id) => pNameShort(db.providers, id) || 'Unknown provider'

  async function removeExpired() {
    if (!expired.length) return
    const ok = await requestConfirm({
      title: `Remove ${expired.length} expired file${expired.length === 1 ? '' : 's'}?`,
      body: `This permanently deletes the uploaded files (frees about ${fmtSize(expiredBytes)}). The document records stay, with their type, number and dates, so you keep the history. This cannot be undone, so download anything you need first.`,
      confirmText: `Delete ${expired.length} file${expired.length === 1 ? '' : 's'}`,
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    let done = 0
    try {
      for (const r of expired) {
        setProgress(`Removing ${done + 1} of ${expired.length}…`)
        await deleteDocumentFile(r.doc_id, r.file_path)
        done++
        setDb?.(prev => ({ ...prev, documents: prev.documents.map(d => d.id === r.doc_id ? { ...d, filePath: '', fileName: '', fileUrl: '' } : d) }))
      }
      toast?.(`Removed ${done} file${done === 1 ? '' : 's'}. Freed about ${fmtSize(expiredBytes)}.`, 'success')
    } catch (e) {
      toast?.(`Stopped after ${done}: ${e.message || 'something went wrong'}`, 'error')
    } finally { setBusy(false); setProgress(''); load() }
  }

  if (rows === null) return <div className="card"><div className="card-body" style={{ fontSize: 13, color: 'var(--text-4)' }}>Loading storage…</div></div>
  if (err) return <div className="card"><div className="card-body" style={{ fontSize: 13.5, color: 'var(--text-3)' }}>{err}</div></div>

  return (
    <div className="grid-2">
      <div className="card">
        <div className="card-body">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>File storage used</div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em' }}>
            {fmtSize(total)} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-4)' }}>of {LIMIT_MB >= 1024 ? `${(LIMIT_MB / 1024).toFixed(0)} GB` : `${LIMIT_MB} MB`}</span>
          </div>
          <div style={{ height: 10, background: 'var(--elevated)', borderRadius: 99, overflow: 'hidden', margin: '10px 0' }} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Storage used">
            <div style={{ width: `${Math.max(pct, total ? 1 : 0)}%`, height: '100%', background: barColor, transition: 'width .3s' }} />
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-4)', lineHeight: 1.5 }}>
            {rows.length} file{rows.length === 1 ? '' : 's'}{rows.length ? `, about ${fmtSize(total / rows.length)} each` : ''}. The limit is for your whole Supabase project, and this counts this organization's documents only.
            {pct >= 70 && <b style={{ color: barColor }}> Getting full: clean up expired files or upgrade the plan.</b>}
          </div>
          {biggest.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-4)', margin: '16px 0 6px' }}>Largest files</div>
              {biggest.map(r => (
                <div key={r.doc_id} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--border-l)' }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{provName(r.prov_id)} · {r.doc_type}</span>
                  <b>{fmtSize(Number(r.size_bytes || 0))}</b>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Free up space</div>
          <p style={{ fontSize: 12.5, color: 'var(--text-4)', lineHeight: 1.5, margin: '0 0 12px' }}>
            Expired licenses and policies are replaced by newer ones. Remove the old uploaded files and keep the record (type, number, dates).
            New uploads already replace the previous file, and phone photos are shrunk automatically before they are stored.
          </p>
          <select className="filter-select" value={age} onChange={e => setAge(Number(e.target.value))} aria-label="Which expired files">
            {AGE_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <div style={{ margin: '12px 0', fontSize: 13.5 }}>
            {expired.length === 0
              ? <span style={{ color: 'var(--text-4)' }}>No files match. Nothing to clean up.</span>
              : <><b>{expired.length}</b> file{expired.length === 1 ? '' : 's'} · frees about <b>{fmtSize(expiredBytes)}</b></>}
          </div>
          {expired.slice(0, 6).map(r => (
            <div key={r.doc_id} style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '3px 0' }}>
              {provName(r.prov_id)} · {r.doc_type} · expired {fmtDate(r.exp)}
            </div>
          ))}
          {expired.length > 6 && <div style={{ fontSize: 12.5, color: 'var(--text-4)' }}>…and {expired.length - 6} more</div>}
          <button className="btn btn-danger mt-12" disabled={busy || expired.length === 0} onClick={removeExpired}>
            {busy ? progress || 'Removing…' : 'Remove these files'}
          </button>
        </div>
      </div>
    </div>
  )
}
