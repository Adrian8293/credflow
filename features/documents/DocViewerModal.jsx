/**
 * DocViewerModal.jsx — Lacentra
 *
 * When a document has a file attached:
 *  1. Fetches a fresh signed URL from /api/get-document-url (server-side, service role)
 *  2. Opens the file in a resizable browser popup window
 *  3. Closes the modal automatically after popup opens
 *
 * The modal stays open only if there is no file (shows metadata + attach prompt)
 * or if the URL fetch fails (shows error + fallback link).
 */

import { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal.jsx'
import { fmtDate, daysUntil, pName } from '../../lib/helpers.js'
import { NO_EXPIRY_TYPES } from '../../hooks/useDocumentActions.js'

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  )
}

function ExternalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  )
}

function ExpiryChip({ doc }) {
  if (NO_EXPIRY_TYPES.has(doc.type)) {
    return (
      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(107,114,128,.1)', color: 'var(--text-4)', fontWeight: 600 }}>
        No Expiry
      </span>
    )
  }
  if (!doc.exp) return null
  const days = daysUntil(doc.exp)
  if (days === null) return null
  const color = days < 0 ? '#dc2626' : days <= 30 ? '#ef4444' : days <= 90 ? '#d97706' : '#10b981'
  const bg    = days < 0 ? 'rgba(220,38,38,.08)' : days <= 30 ? 'rgba(239,68,68,.07)' : days <= 90 ? 'rgba(217,119,6,.07)' : 'rgba(16,185,129,.08)'
  const label = days < 0 ? `Expired ${Math.abs(days)}d ago` : days === 0 ? 'Expires today' : `${days}d remaining`
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: bg, color, fontWeight: 700, border: `1px solid ${color}30` }}>
      {label}
    </span>
  )
}

function MetaStrip({ doc, db }) {
  const provName = pName(db.providers, doc.provId)
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: '6px 20px', padding: '12px 16px',
      background: 'var(--elevated)', borderBottom: '1px solid var(--border-l)',
      fontSize: 12,
    }}>
      {[
        { label: 'Provider', value: provName },
        { label: 'Issuer',   value: doc.issuer || '—' },
        { label: 'Number',   value: doc.number || '—' },
        { label: 'Issued',   value: doc.issue  ? fmtDate(doc.issue) : '—' },
        { label: 'Expires',  value: NO_EXPIRY_TYPES.has(doc.type) ? 'Does not expire' : (doc.exp ? fmtDate(doc.exp) : '—') },
        ...(doc.notes ? [{ label: 'Notes', value: doc.notes }] : []),
      ].map(({ label, value }) => (
        <div key={label}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 2 }}>{label}</div>
          <div style={{ fontWeight: 500, color: 'var(--text-1)', wordBreak: 'break-word' }}>{value}</div>
        </div>
      ))}
    </div>
  )
}

function openPopup(url, docId) {
  const w    = Math.min(1100, window.screen.availWidth  - 40)
  const h    = Math.min(860,  window.screen.availHeight - 40)
  const left = Math.round((window.screen.availWidth  - w) / 2)
  const top  = Math.round((window.screen.availHeight - h) / 2)
  window.open(
    url,
    `doc_${docId}`,
    `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes,toolbar=no,menubar=no`
  )
}

export function DocViewerModal({ doc, db, onClose, onEdit }) {
  const [status,   setStatus]   = useState('idle')   // idle | loading | done | error
  const [freshUrl, setFreshUrl] = useState(null)

  // S-02: hasFile is true if either the new file_path or legacy file_url is populated
  const hasFile = !!(doc?.filePath || doc?.fileUrl)

  useEffect(() => {
    if (!doc?.id || !hasFile) return
    setStatus('loading')
    fetch(`/api/get-document-url?documentId=${doc.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.signedUrl) {
          setFreshUrl(data.signedUrl)
          openPopup(data.signedUrl, doc.id)
          setStatus('done')
          onClose()
        } else {
          setStatus('error')
        }
      })
      .catch(() => setStatus('error'))
  }, [doc?.id])

  if (!doc) return null

  const fileUrl = freshUrl || doc.fileUrl

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{doc.type}</span>
          <ExpiryChip doc={doc} />
        </div>
      }
      onClose={onClose}
      lg
      footer={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {hasFile && fileUrl && (
            <>
              <a
                href={fileUrl}
                download={doc.fileName || 'document'}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', background: 'var(--card)', border: '1.5px solid var(--border)',
                  borderRadius: 'var(--r)', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)',
                  textDecoration: 'none', cursor: 'pointer',
                }}
              >
                <DownloadIcon /> Download
              </a>
              <button
                onClick={() => openPopup(fileUrl, doc.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', background: 'var(--card)', border: '1.5px solid var(--border)',
                  borderRadius: 'var(--r)', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <ExternalIcon /> Open in window
              </button>
            </>
          )}
          <div style={{ flex: 1 }} />
          {onEdit && (
            <button className="btn btn-secondary btn-sm" onClick={() => { onClose(); onEdit(doc.id) }}>
              Edit Record
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

        <MetaStrip doc={doc} db={db} />

        {/* No file attached */}
        {!hasFile && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-4)' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12, opacity: .4 }}>
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
              <polyline points="13 2 13 9 20 9"/>
            </svg>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>No file attached</div>
            <div style={{ fontSize: 12, color: 'var(--text-4)' }}>Edit this record to attach a file.</div>
            {onEdit && (
              <button className="btn btn-primary btn-sm" onClick={() => { onClose(); onEdit(doc.id) }} style={{ marginTop: 14 }}>
                Attach File
              </button>
            )}
          </div>
        )}

        {/* Loading */}
        {hasFile && status === 'loading' && (
          <div style={{ padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: 'var(--text-3)' }}>
            <div style={{ width: 22, height: 22, border: '2.5px solid var(--border)', borderTopColor: 'var(--pr)', borderRadius: '50%', animation: 'spin .65s linear infinite' }} />
            <div style={{ fontSize: 13 }}>Opening file…</div>
          </div>
        )}

        {/* Error */}
        {hasFile && status === 'error' && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>
              Could not generate a secure link for this file.
            </div>
            {(doc.fileUrl) && (
              <a
                href={doc.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '9px 20px', background: 'var(--pr-solid)', color: '#fff',
                  borderRadius: 'var(--r)', textDecoration: 'none', fontSize: 13, fontWeight: 600,
                }}
              >
                <ExternalIcon /> Try opening directly
              </a>
            )}
          </div>
        )}

        {/* Done */}
        {hasFile && status === 'done' && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
            File opened in a separate window.
          </div>
        )}

      </div>
    </Modal>
  )
}
