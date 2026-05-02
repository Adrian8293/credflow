// components/OpcaUploadPanel.jsx
// Upload a filled OPCA PDF (any version) → extract → save as source of truth → generate 2025 PDF
// Supports: 2023/2024 migration workflow + new provider intake

import { useState, useRef, useCallback } from 'react'

const STEPS = {
  IDLE: 'idle',
  UPLOADING: 'uploading',
  EXTRACTING: 'extracting',
  REVIEW: 'review',
  MIGRATING: 'migrating',
  GENERATING: 'generating',
  DONE: 'done',
  ERROR: 'error',
}

export default function OpcaUploadPanel({ provider, onComplete }) {
  const [step, setStep] = useState(STEPS.IDLE)
  const [dragOver, setDragOver] = useState(false)
  const [extractedProfile, setExtractedProfile] = useState(null)
  const [migrationSummary, setMigrationSummary] = useState(null)
  const [error, setError] = useState(null)
  const [initials, setInitials] = useState(
    provider ? (provider.fname?.[0] + provider.lname?.[0]).toUpperCase() : ''
  )
  const fileInputRef = useRef()

  const handleFile = useCallback(async (file) => {
    if (!file || file.type !== 'application/pdf') {
      setError('Please upload a PDF file.')
      return
    }

    setError(null)
    setStep(STEPS.UPLOADING)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('providerId', provider?.id || '')

    setStep(STEPS.EXTRACTING)
    try {
      const res = await fetch('/api/opca-extract', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Extraction failed')

      setExtractedProfile(data)
      setStep(STEPS.REVIEW)
    } catch (err) {
      setError(err.message)
      setStep(STEPS.ERROR)
    }
  }, [provider])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    handleFile(file)
  }, [handleFile])

  const handleMigrate = async () => {
    setStep(STEPS.MIGRATING)
    setError(null)
    try {
      const res = await fetch('/api/opca-migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: extractedProfile.profileId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Migration failed')
      setMigrationSummary(data.summary)
      setExtractedProfile(prev => ({ ...prev, profileId: data.newProfileId, formVersion: '2025' }))
      setStep(STEPS.REVIEW)
    } catch (err) {
      setError(err.message)
      setStep(STEPS.ERROR)
    }
  }

  const handleGenerate = async () => {
    setStep(STEPS.GENERATING)
    setError(null)
    try {
      const res = await fetch('/api/generate-opca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: extractedProfile.profileId, initials }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'PDF generation failed')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `OPCA_2025_${provider?.lname || 'Provider'}_${new Date().toISOString().slice(0,10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      setStep(STEPS.DONE)
      onComplete?.()
    } catch (err) {
      setError(err.message)
      setStep(STEPS.ERROR)
    }
  }

  const reset = () => {
    setStep(STEPS.IDLE)
    setExtractedProfile(null)
    setMigrationSummary(null)
    setError(null)
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>OPCA Form Intelligence</h2>
        <p style={styles.subtitle}>
          Upload any filled OPCA (2023, 2024, or 2025) to extract provider data and generate a pixel-perfect 2025 submission.
        </p>
      </div>

      {/* ── Upload Zone ─────────────────────────────────────────────── */}
      {step === STEPS.IDLE && (
        <div
          style={{ ...styles.dropZone, ...(dragOver ? styles.dropZoneActive : {}) }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0])}
          />
          <div style={styles.dropIcon}>📄</div>
          <div style={styles.dropText}>Drop filled OPCA PDF here</div>
          <div style={styles.dropSubtext}>or click to browse · 2023 · 2024 · 2025</div>
        </div>
      )}

      {/* ── Loading States ────────────────────────────────────────────── */}
      {(step === STEPS.UPLOADING || step === STEPS.EXTRACTING || step === STEPS.MIGRATING || step === STEPS.GENERATING) && (
        <div style={styles.loadingBox}>
          <div style={styles.spinner} />
          <div style={styles.loadingText}>
            {step === STEPS.UPLOADING && 'Uploading PDF...'}
            {step === STEPS.EXTRACTING && 'AI is reading the form — extracting all 20 sections...'}
            {step === STEPS.MIGRATING && 'Migrating to 2025 format — checking for new fields...'}
            {step === STEPS.GENERATING && 'Filling official 2025 OPCA PDF...'}
          </div>
        </div>
      )}

      {/* ── Review Panel ─────────────────────────────────────────────── */}
      {step === STEPS.REVIEW && extractedProfile && (
        <div style={styles.reviewBox}>
          <div style={styles.reviewHeader}>
            <span style={styles.checkmark}>✓</span>
            <div>
              <div style={styles.reviewTitle}>Extraction Complete</div>
              <div style={styles.reviewSub}>
                {extractedProfile.provider} · Form version: <strong>{extractedProfile.formVersion}</strong> · {extractedProfile.fieldsExtracted} sections extracted
              </div>
            </div>
          </div>

          {/* Migration warning if old version */}
          {extractedProfile.formVersion !== '2025' && !migrationSummary && (
            <div style={styles.warningBox}>
              <div style={styles.warningTitle}>⚠ Older Form Version Detected</div>
              <div style={styles.warningText}>
                This is a <strong>{extractedProfile.formVersion}</strong> OPCA. The 2025 version adds new required fields (REALD data, DEA issue date). Click <em>Migrate to 2025</em> to create an updated version — all existing data will be preserved.
              </div>
              <button style={styles.btnSecondary} onClick={handleMigrate}>
                Migrate to 2025 →
              </button>
            </div>
          )}

          {/* Migration summary */}
          {migrationSummary && (
            <div style={styles.migrationSummary}>
              <div style={styles.migSummaryTitle}>Migration Summary: {migrationSummary.sourceVersion} → 2025</div>
              {migrationSummary.newFieldsMissing?.length > 0 && (
                <div>
                  <div style={styles.migLabel}>New fields needing provider input:</div>
                  {migrationSummary.newFieldsMissing.map(f => (
                    <div key={f.field} style={styles.missingField}>
                      <span style={{ color: f.required ? '#ef4444' : '#f59e0b' }}>
                        {f.required ? '● Required' : '○ Optional'}
                      </span>
                      {' '}{f.label} (Section {f.section})
                    </div>
                  ))}
                </div>
              )}
              {migrationSummary.warnings?.filter(w => w.severity === 'warning').map((w, i) => (
                <div key={i} style={styles.warningItem}>⚠ {w.message}</div>
              ))}
              {migrationSummary.readyToExport && (
                <div style={styles.readyBadge}>✓ Ready to generate 2025 PDF</div>
              )}
            </div>
          )}

          {/* Generate section */}
          {(extractedProfile.formVersion === '2025') && (
            <div style={styles.generateSection}>
              <div style={styles.initialsRow}>
                <label style={styles.label}>Provider Initials (for page headers):</label>
                <input
                  style={styles.initialsInput}
                  value={initials}
                  onChange={(e) => setInitials(e.target.value.toUpperCase())}
                  maxLength={4}
                  placeholder="e.g. JSD"
                />
              </div>
              <button style={styles.btnPrimary} onClick={handleGenerate}>
                ↓ Generate Official 2025 OPCA PDF
              </button>
            </div>
          )}

          <button style={styles.btnGhost} onClick={reset}>Upload a different form</button>
        </div>
      )}

      {/* ── Done ──────────────────────────────────────────────────────── */}
      {step === STEPS.DONE && (
        <div style={styles.doneBox}>
          <div style={styles.doneIcon}>✓</div>
          <div style={styles.doneTitle}>PDF Downloaded</div>
          <div style={styles.doneSub}>Official 2025 OPCA PDF has been filled and downloaded. Ready for submission.</div>
          <button style={styles.btnGhost} onClick={reset}>Process Another Form</button>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {error && (
        <div style={styles.errorBox}>
          <strong>Error:</strong> {error}
          <button style={styles.btnGhost} onClick={reset}>Try Again</button>
        </div>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  container: {
    fontFamily: "'DM Sans', system-ui, sans-serif",
    maxWidth: 640,
    margin: '0 auto',
    padding: 24,
  },
  header: { marginBottom: 24 },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#0f172a',
    margin: '0 0 6px',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    margin: 0,
    lineHeight: 1.5,
  },
  dropZone: {
    border: '2px dashed #cbd5e1',
    borderRadius: 12,
    padding: '48px 24px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all .2s ease',
    background: '#f8fafc',
  },
  dropZoneActive: {
    borderColor: '#3b82f6',
    background: '#eff6ff',
  },
  dropIcon: { fontSize: 40, marginBottom: 12 },
  dropText: { fontSize: 16, fontWeight: 600, color: '#1e293b', marginBottom: 6 },
  dropSubtext: { fontSize: 13, color: '#94a3b8' },
  loadingBox: {
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: 40,
    textAlign: 'center',
    background: '#f8fafc',
  },
  spinner: {
    width: 36, height: 36,
    border: '3px solid #e2e8f0',
    borderTopColor: '#3b82f6',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    margin: '0 auto 16px',
  },
  loadingText: { fontSize: 15, color: '#475569' },
  reviewBox: {
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    overflow: 'hidden',
    background: '#fff',
  },
  reviewHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '20px 24px',
    borderBottom: '1px solid #f1f5f9',
    background: '#f0fdf4',
  },
  checkmark: {
    width: 36, height: 36,
    background: '#22c55e',
    color: '#fff',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    flexShrink: 0,
  },
  reviewTitle: { fontSize: 16, fontWeight: 700, color: '#15803d' },
  reviewSub: { fontSize: 13, color: '#4ade80', marginTop: 2, color: '#166534' },
  warningBox: {
    margin: 20,
    padding: 16,
    background: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: 8,
  },
  warningTitle: { fontSize: 14, fontWeight: 700, color: '#92400e', marginBottom: 6 },
  warningText: { fontSize: 13, color: '#78350f', lineHeight: 1.5, marginBottom: 12 },
  migrationSummary: {
    margin: 20,
    padding: 16,
    background: '#f0f9ff',
    border: '1px solid #bae6fd',
    borderRadius: 8,
  },
  migSummaryTitle: { fontSize: 14, fontWeight: 700, color: '#0369a1', marginBottom: 10 },
  migLabel: { fontSize: 13, color: '#0c4a6e', fontWeight: 600, marginBottom: 6 },
  missingField: { fontSize: 13, color: '#1e293b', padding: '2px 0' },
  warningItem: { fontSize: 13, color: '#92400e', padding: '4px 0' },
  readyBadge: {
    marginTop: 10,
    fontSize: 13,
    color: '#166534',
    fontWeight: 600,
  },
  generateSection: {
    padding: '20px 24px',
    borderTop: '1px solid #f1f5f9',
  },
  initialsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  label: { fontSize: 13, color: '#64748b' },
  initialsInput: {
    width: 70,
    padding: '6px 10px',
    border: '1px solid #cbd5e1',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 700,
    textAlign: 'center',
    letterSpacing: 2,
  },
  btnPrimary: {
    width: '100%',
    padding: '13px 0',
    background: '#1d4ed8',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'background .15s',
  },
  btnSecondary: {
    padding: '8px 16px',
    background: '#fff',
    color: '#92400e',
    border: '1px solid #f59e0b',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnGhost: {
    display: 'block',
    width: '100%',
    padding: '10px 0',
    background: 'transparent',
    color: '#94a3b8',
    border: 'none',
    fontSize: 13,
    cursor: 'pointer',
    marginTop: 8,
    textDecoration: 'underline',
  },
  doneBox: {
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: 40,
    textAlign: 'center',
    background: '#f0fdf4',
  },
  doneIcon: {
    width: 56, height: 56,
    background: '#22c55e',
    color: '#fff',
    borderRadius: '50%',
    fontSize: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  },
  doneTitle: { fontSize: 20, fontWeight: 700, color: '#15803d', marginBottom: 8 },
  doneSub: { fontSize: 14, color: '#166534', lineHeight: 1.5, marginBottom: 20 },
  errorBox: {
    padding: 16,
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 8,
    fontSize: 14,
    color: '#dc2626',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
}
