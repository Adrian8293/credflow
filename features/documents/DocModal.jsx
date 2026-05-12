/**
 * DocModal.jsx — PrimeCredential
 * Document add/edit modal with Supabase Storage file attachment.
 *
 * Flow:
 *  1. User fills metadata (type, expiry, etc.) and saves → gets a document ID
 *  2. If a file is staged, uploadDocumentFile() is called with the new ID
 *  3. The document record is updated with file_url + file_name
 *
 * For existing documents the file can be replaced or removed inline.
 */

import { useRef, useState } from 'react'
import { Modal } from '../../components/ui/Modal.jsx'
import { uploadDocumentFile, deleteDocumentFile } from '../../lib/db.js'

const ALLOWED_EXTENSIONS = ['pdf','jpg','jpeg','png','webp','doc','docx','tiff']
const MAX_MB = 10

function FileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
      <polyline points="13 2 13 9 20 9"/>
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16"/>
      <line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
    </svg>
  )
}

export function DocModal({ db, docForm, setDocForm, editingId, handleSaveDocument, onClose, saving, toast }) {
  const f   = k => docForm[k] ?? ''
  const set = (k, v) => setDocForm(prev => ({ ...prev, [k]: v }))

  // Staged file (not yet uploaded — waits for save to get doc ID)
  const [stagedFile, setStagedFile]   = useState(null)
  const [uploading, setUploading]     = useState(false)
  const [dragOver, setDragOver]       = useState(false)
  const [fileError, setFileError]     = useState('')
  const fileInputRef = useRef(null)

  function validateFile(file) {
    const ext = file.name.split('.').pop().toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `File type .${ext} not allowed. Use: ${ALLOWED_EXTENSIONS.join(', ')}`
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      return `File exceeds ${MAX_MB} MB (${(file.size/1024/1024).toFixed(1)} MB)`
    }
    return null
  }

  function stageFile(file) {
    const err = validateFile(file)
    if (err) { setFileError(err); return }
    setFileError('')
    setStagedFile(file)
  }

  function onFileInput(e) {
    const file = e.target.files?.[0]
    if (file) stageFile(file)
    e.target.value = ''
  }

  function onDrop(e) {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) stageFile(file)
  }

  async function handleRemoveExistingFile() {
    if (!editingId.doc || !f('fileUrl')) return
    setUploading(true)
    try {
      await deleteDocumentFile(editingId.doc, f('fileUrl'))
      set('fileUrl', '')
      set('fileName', '')
      toast?.('File removed.', 'success')
    } catch (err) {
      toast?.(err.message, 'error')
    }
    setUploading(false)
  }

  // Called by the Save button — saves metadata, then uploads any staged file,
  // then closes the modal. The parent wrapper intentionally does NOT close the
  // modal so this function owns the full sequence.
  async function handleSaveWithUpload() {
    // MED-004: mark required fields as touched before attempting save so
    // inline validation errors show when the user hits Save on an empty form
    setDocForm(prev => ({ ...prev, _touched: { provId: true, exp: true } }))
    const saved = await handleSaveDocument()
    if (saved && stagedFile) {
      setUploading(true)
      try {
        const { fileUrl, fileName } = await uploadDocumentFile(saved.id, saved.provId, stagedFile)
        setDocForm(prev => ({ ...prev, fileUrl, fileName }))
        setStagedFile(null)
        toast?.('File attached successfully.', 'success')
      } catch (err) {
        toast?.(`File upload failed: ${err.message}`, 'error')
        setUploading(false)
        return // leave modal open so user can retry
      }
      setUploading(false)
    }
    // Close the modal only after the full save+upload sequence completes
    if (saved) onClose()
  }

  const isBusy = saving || uploading
  const existingFile = f('fileUrl')

  return (
    <Modal
      title={editingId.doc ? 'Edit Document' : 'Add Document / Credential'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSaveWithUpload} disabled={isBusy}>
            {uploading ? 'Uploading…' : saving ? 'Saving…' : 'Save Document'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="fg">
          <label>Provider *</label>
          <select value={f('provId')} onChange={e => set('provId', e.target.value)}>
            <option value="">— Select Provider —</option>
            {db.providers.map(p => <option key={p.id} value={p.id}>{p.fname} {p.lname}</option>)}
          </select>
        </div>
        <div className="fg">
          <label>Document Type *</label>
          <select value={f('type')} onChange={e => set('type', e.target.value)}>
            <option>License</option>
            <option>Malpractice</option>
            <option>DEA</option>
            <option>CAQH Attestation</option>
            <option>Recredentialing</option>
            <option>Supervision Agreement</option>
            <option>NPI Letter</option>
            <option>W-9</option>
            <option>CV / Resume</option>
            <option>Other</option>
          </select>
        </div>
        <div className="fg"><label>Issuer / Carrier</label><input type="text" value={f('issuer')} onChange={e => set('issuer', e.target.value)} placeholder="OBRC, HPSO…" /></div>
        <div className="fg"><label>License / Policy Number</label><input type="text" value={f('number')} onChange={e => set('number', e.target.value)} /></div>
        <div className="fg"><label>Issue Date</label><input type="date" value={f('issue')} onChange={e => set('issue', e.target.value)} /></div>
        <div className="fg"><label>Expiration Date *</label><input type="date" value={f('exp')} onChange={e => set('exp', e.target.value)} /></div>
        <div className="fg full"><label>Notes</label><textarea value={f('notes')} onChange={e => set('notes', e.target.value)} style={{ minHeight: 56 }} /></div>

        {/* ── File Attachment ───────────────────────────────────────────────── */}
        <div className="fg full">
          <label style={{ marginBottom: 8, display: 'block' }}>
            File Attachment
            <span style={{ fontSize: 10.5, color: 'var(--text-4)', fontWeight: 400, marginLeft: 6 }}>
              PDF, JPG, PNG, DOCX — max {MAX_MB} MB
            </span>
          </label>

          {/* Existing attached file */}
          {existingFile && !stagedFile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(16,185,129,.06)', border: '1.5px solid rgba(16,185,129,.25)', borderRadius: 'var(--r)', marginBottom: 10 }}>
              <span style={{ color: 'var(--success)', flexShrink: 0 }}><FileIcon /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f('fileName') || 'Attached file'}
                </div>
                <a href={existingFile} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, color: 'var(--pr)', fontWeight: 500 }}>
                  View file ↗
                </a>
              </div>
              <button
                onClick={handleRemoveExistingFile}
                disabled={uploading}
                style={{ flexShrink: 0, fontSize: 11, color: 'var(--danger)', background: 'none', border: '1px solid rgba(239,68,68,.25)', borderRadius: 'var(--r)', padding: '3px 9px', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Remove
              </button>
            </div>
          )}

          {/* Staged (pending upload) file */}
          {stagedFile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(30,86,240,.05)', border: '1.5px solid rgba(30,86,240,.22)', borderRadius: 'var(--r)', marginBottom: 10 }}>
              <span style={{ color: 'var(--pr)', flexShrink: 0 }}><FileIcon /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {stagedFile.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-4)' }}>
                  {(stagedFile.size / 1024 / 1024).toFixed(2)} MB — will upload on save
                </div>
              </div>
              <button
                onClick={() => setStagedFile(null)}
                style={{ flexShrink: 0, fontSize: 11, color: 'var(--text-3)', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '3px 9px', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Clear
              </button>
            </div>
          )}

          {/* Drop zone (shown when no file staged and no existing file) */}
          {!stagedFile && !existingFile && (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? 'var(--pr)' : 'var(--border-mid)'}`,
                borderRadius: 'var(--r-lg)',
                padding: '22px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragOver ? 'rgba(30,86,240,.04)' : 'var(--elevated)',
                transition: 'all .15s',
              }}
            >
              <div style={{ color: dragOver ? 'var(--pr)' : 'var(--text-4)', display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                <UploadIcon />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: dragOver ? 'var(--pr)' : 'var(--text-2)', marginBottom: 4 }}>
                Drop file here or click to browse
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-4)' }}>
                {ALLOWED_EXTENSIONS.map(e => e.toUpperCase()).join(' · ')} — max {MAX_MB} MB
              </div>
            </div>
          )}

          {/* Replace file link when file already exists */}
          {existingFile && !stagedFile && (
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ marginTop: 6, fontSize: 12, color: 'var(--pr)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.38"/></svg>
              Replace file
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_EXTENSIONS.map(e => `.${e}`).join(',')}
            onChange={onFileInput}
            style={{ display: 'none' }}
          />

          {fileError && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {fileError}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
