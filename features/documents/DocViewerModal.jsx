/**
 * DocViewerModal.jsx — Lacentra
 * Inline document viewer modal.
 *
 * Supported:    PDF, JPG, JPEG, PNG, WEBP, TIFF → rendered inline
 * Fallback:     DOC, DOCX, and any unrecognized type → download link
 *               (browsers cannot render Word documents without an external service)
 *
 * The modal also shows the document's metadata (provider, type, expiry, notes)
 * so staff can review the record alongside the file.
 */

import { useState } from 'react'
import { Modal } from '../../components/ui/Modal.jsx'
import { fmtDate, daysUntil, pName } from '../../lib/helpers.js'
import { NO_EXPIRY_TYPES } from '../../hooks/useDocumentActions.js'

const INLINE_IMAGE_TYPES = new Set(['jpg', 'jpeg', 'png', 'webp'])
const INLINE_PDF_TYPES   = new Set(['pdf'])
// TIFF is technically an image but browser inline support is inconsistent — treat as download
const DOWNLOAD_ONLY_TYPES = new Set(['doc', 'docx', 'tiff'])

function getFileExt(fileName) {
  return (fileName || '').split('.').pop().toLowerCase()
}

function getViewMode(fileName) {
  const ext = getFileExt(fileName)
  if (INLINE_PDF_TYPES.has(ext))   return 'pdf'
  if (INLINE_IMAGE_TYPES.has(ext)) return 'image'
  return 'download'
}

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
  const color  = days < 0 ? '#dc2626' : days <= 30 ? '#ef4444' : days <= 90 ? '#d97706' : '#10b981'
  const bg     = days < 0 ? 'rgba(220,38,38,.08)' : days <= 30 ? 'rgba(239,68,68,.07)' : days <= 90 ? 'rgba(217,119,6,.07)' : 'rgba(16,185,129,.08)'
  const label  = days < 0 ? `Expired ${Math.abs(days)}d ago` : days === 0 ? 'Expires today' : `${days}d remaining`
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: bg, color, fontWeight: 700, border: `1px solid ${color}30` }}>
      {label}
    </span>
  )
}

export function DocViewerModal({ doc, db, onClose, onEdit }) {
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [iframeError, setIframeError]   = useState(false)

  if (!doc) return null

  const viewMode   = getViewMode(doc.fileName)
  const fileUrl    = doc.fileUrl
  const hasFile    = !!fileUrl
  const provName   = pName(db.providers, doc.provId)

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{doc.type}</span>
          <ExpiryChip doc={doc} />
        </div>
      }
      onClose={onClose}
      lg  // uses modal-lg CSS class for wider layout
      footer={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {hasFile && (
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
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', background: 'var(--card)', border: '1.5px solid var(--border)',
                  borderRadius: 'var(--r)', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)',
                  textDecoration: 'none',
                }}
              >
                <ExternalIcon /> Open in new tab
              </a>
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

        {/* ── Metadata strip ─────────────────────────────────────────────── */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '6px 20px', padding: '12px 16px',
          background: 'var(--elevated)', borderBottom: '1px solid var(--border-l)',
          fontSize: 12,
        }}>
          {[
            { label: 'Provider',  value: provName },
            { label: 'Issuer',    value: doc.issuer || '—' },
            { label: 'Number',    value: doc.number || '—' },
            { label: 'Issued',    value: doc.issue  ? fmtDate(doc.issue) : '—' },
            { label: 'Expires',   value: NO_EXPIRY_TYPES.has(doc.type) ? 'Does not expire' : (doc.exp ? fmtDate(doc.exp) : '—') },
            ...(doc.notes ? [{ label: 'Notes', value: doc.notes }] : []),
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 2 }}>{label}</div>
              <div style={{ fontWeight: 500, color: 'var(--text-1)', wordBreak: 'break-word' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* ── File viewer area ───────────────────────────────────────────── */}
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

        {/* PDF viewer */}
        {hasFile && viewMode === 'pdf' && (
          <div style={{ position: 'relative', background: '#525659' }}>
            {!iframeLoaded && !iframeError && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#525659', zIndex: 1 }}>
                <div style={{ color: '#fff', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .65s linear infinite' }} />
                  Loading PDF…
                </div>
              </div>
            )}
            {iframeError && (
              <div style={{ padding: 32, textAlign: 'center', background: '#525659' }}>
                <div style={{ color: '#fff', fontSize: 13, marginBottom: 12 }}>
                  PDF preview unavailable in this browser.
                </div>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--pr)', color: '#fff', borderRadius: 'var(--r)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}
                >
                  <ExternalIcon /> Open PDF in new tab
                </a>
              </div>
            )}
            {!iframeError && (
              <iframe
                src={fileUrl}
                title={doc.fileName || 'Document'}
                onLoad={() => setIframeLoaded(true)}
                onError={() => { setIframeError(true); setIframeLoaded(true) }}
                style={{
                  width: '100%',
                  height: '68vh',
                  border: 'none',
                  display: 'block',
                  opacity: iframeLoaded ? 1 : 0,
                  transition: 'opacity .2s',
                }}
              />
            )}
          </div>
        )}

        {/* Image viewer */}
        {hasFile && viewMode === 'image' && (
          <div style={{ padding: 20, background: 'var(--elevated)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', minHeight: 200 }}>
            <img
              src={fileUrl}
              alt={doc.fileName || doc.type}
              style={{
                maxWidth: '100%',
                maxHeight: '65vh',
                objectFit: 'contain',
                borderRadius: 'var(--r)',
                boxShadow: '0 4px 20px rgba(0,0,0,.15)',
              }}
              onError={e => {
                e.target.style.display = 'none'
                e.target.nextSibling.style.display = 'block'
              }}
            />
            <div style={{ display: 'none', color: 'var(--text-4)', fontSize: 13, padding: 20 }}>
              Image could not be loaded. Use the download button below.
            </div>
          </div>
        )}

        {/* Download-only fallback (DOCX, TIFF, unknown) */}
        {hasFile && viewMode === 'download' && (
          <div style={{ padding: 40, textAlign: 'center', background: 'var(--elevated)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
              <polyline points="13 2 13 9 20 9"/>
            </svg>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
              {doc.fileName || 'Attached file'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-4)', marginBottom: 16 }}>
              This file type cannot be previewed in the browser.
            </div>
            <a
              href={fileUrl}
              download={doc.fileName || 'document'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 20px', background: 'var(--pr)', color: '#fff',
                borderRadius: 'var(--r)', textDecoration: 'none', fontSize: 13, fontWeight: 600,
              }}
            >
              <DownloadIcon /> Download File
            </a>
          </div>
        )}

      </div>
    </Modal>
  )
}
