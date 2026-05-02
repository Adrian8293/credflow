// components/OpcaReviewPanel.jsx
// Split-screen OPCA review dashboard.
// Left: live form preview with stamped provider data.
// Right: tabbed panel — Progress | Issues | Attestation | Peer Refs | Work History | Auth

import { useState, useCallback } from 'react'
import { validateProviderForOPCA, getSectionScores } from '../lib/opca-validation-adapter'

// ── Attestation questions by version ─────────────────────────────────────────

const ATTESTATION_QUESTIONS_2025 = [
  { q: 'a', text: 'Has your license, certification, DEA registration, or narcotic certificate ever been denied, limited, suspended, revoked, or subject to corrective action?' },
  { q: 'b', text: 'Ever been suspended, fined, disciplined, or excluded for any reasons by Medicare, Medicaid, or any public program?' },
  { q: 'c', text: 'Ever been denied clinical privileges, membership, or contractual participation by any health care related organization?' },
  { q: 'd', text: 'Ever surrendered clinical privileges, accepted restrictions, or resigned from any health care organization while under investigation?' },
  { q: 'e', text: 'Has an application for clinical privileges ever been withdrawn on your request prior to the organization\'s final action?' },
  { q: 'f', text: 'Has your membership in any professional organization ever been revoked, denied, or limited?' },
  { q: 'g', text: 'Have you ever voluntarily or involuntarily left or been discharged from any education or training program?' },
  { q: 'h', text: 'Have you ever had board certification revoked?' },
  { q: 'i', text: 'Have you ever been the subject of any reports to a state or federal data bank or licensing entity?' },
  { q: 'j', text: 'Have you ever been charged with a criminal violation (felony or misdemeanor)?' },
  { q: 'k', text: 'Do you presently use any illegal drugs?' },
  { q: 'l', text: 'Are you unable to perform any of the services/clinical privileges required, with or without reasonable accommodation?' },
  { q: 'm', text: 'Have any professional liability claims or lawsuits ever been closed and/or filed against you?' },
  { q: 'n', text: 'Has your professional liability insurance ever been terminated, not renewed, restricted, or modified?' },
  { q: 'o', text: 'HEALTH ATTESTATION — I attest to no physical, mental health, or chemical dependency conditions that currently affect my ability to practice.', isCheckbox: true },
]

const ATTESTATION_QUESTIONS_2024 = [
  ...ATTESTATION_QUESTIONS_2025.slice(0, 11), // A–K same
  { q: 'l', text: 'Do you attest to no current physical, mental health, or chemical dependency conditions that currently affect your ability to practice, with or without reasonable accommodation?' },
  { q: 'm', text: 'Are you unable to perform any of the services/clinical privileges required, with or without reasonable accommodation?' },
  { q: 'n', text: 'Have any professional liability claims or lawsuits ever been closed and/or filed against you?' },
  { q: 'o', text: 'Has your professional liability insurance ever been terminated, not renewed, restricted, or modified?' },
]

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  root: { display: 'flex', height: '100vh', fontFamily: "'IBM Plex Sans', system-ui, sans-serif", background: '#0d0f14', color: '#e8eaf0', overflow: 'hidden' },
  // Left panel
  leftPanel: { flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #2a2f3d', overflow: 'hidden', background: '#0a0b0f' },
  previewHeader: { padding: '10px 16px', background: '#13161e', borderBottom: '1px solid #2a2f3d', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },
  previewLabel: { fontSize: 10, color: '#555c72', fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase' },
  previewViewport: { flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: 24 },
  formPage: { width: '100%', maxWidth: 640, background: 'white', borderRadius: 4, padding: '32px 48px', color: '#111', fontSize: 10, fontFamily: "'Times New Roman', serif", boxShadow: '0 8px 40px rgba(0,0,0,0.6)', position: 'relative' },
  // Right panel
  rightPanel: { width: 420, display: 'flex', flexDirection: 'column', background: '#13161e', flexShrink: 0 },
  vStrip: { padding: '10px 16px', borderBottom: '1px solid #2a2f3d', display: 'flex', alignItems: 'center', gap: 10, background: '#1a1e28', flexShrink: 0 },
  tabs: { display: 'flex', borderBottom: '1px solid #2a2f3d', flexShrink: 0, overflowX: 'auto' },
  tab: (active) => ({ flex: '0 0 auto', padding: '8px 14px', fontSize: 11, fontWeight: 500, background: 'transparent', border: 'none', cursor: 'pointer', color: active ? '#4f7cff' : '#555c72', borderBottom: '2px solid ' + (active ? '#4f7cff' : 'transparent'), whiteSpace: 'nowrap', transition: 'color 0.15s' }),
  content: { flex: 1, overflowY: 'auto', padding: 16 },
  footer: { padding: 16, borderTop: '1px solid #2a2f3d', flexShrink: 0 },
  // Cards
  issueCard: (severity) => ({ padding: '10px 12px', borderRadius: 6, borderLeft: '3px solid ' + (severity === 'error' ? '#ff4f4f' : '#f5c842'), background: severity === 'error' ? '#2e0e0e' : '#2e2608', marginBottom: 8 }),
  fieldGroup: { background: '#1a1e28', border: '1px solid #2a2f3d', borderRadius: 8, overflow: 'hidden', marginBottom: 10 },
  fieldGroupTitle: { padding: '8px 12px', fontSize: 10, color: '#8b90a8', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: '#212636', borderBottom: '1px solid #2a2f3d' },
  input: { width: '100%', background: '#13161e', border: '1px solid #2a2f3d', borderRadius: 4, padding: '6px 9px', color: '#e8eaf0', fontSize: 11, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' },
  btn: (primary, disabled) => ({ width: '100%', padding: '10px 0', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', border: primary ? 'none' : '1px solid #2a4a8e', background: disabled ? '#1e2d5a' : primary ? '#4f7cff' : 'transparent', color: disabled ? '#4f7cff' : '#fff', opacity: disabled ? 0.6 : 1, transition: 'all 0.15s' }),
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Dot({ color }) {
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
}

function FV({ value, placeholder = '—' }) {
  return <span style={{ fontFamily: 'monospace', fontSize: 9, color: value ? '#1a3fc0' : '#ccc', fontWeight: value ? 600 : 400, minHeight: 12, display: 'block' }}>{value || placeholder}</span>
}

function FormField({ label, value }) {
  return (
    <div style={{ flex: 1, borderBottom: '1px solid #999', paddingBottom: 2 }}>
      <div style={{ fontSize: 7, color: '#666', marginBottom: 2 }}>{label}</div>
      <FV value={value} />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OpcaReviewPanel({ provider, onSave, onBack }) {
  const [local, setLocal] = useState(provider)
  const [tab, setTab] = useState('progress')
  const [version, setVersion] = useState('2025')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [currentPage, setCurrentPage] = useState(3)

  const validation = validateProviderForOPCA(local, version)
  const errors = validation.issues.filter(i => i.severity === 'error')
  const warnings = validation.issues.filter(i => i.severity === 'warning')
  const blocking = errors.filter(i => i.blocking)
  const sectionScores = getSectionScores(local)

  const statusColor = blocking.length > 0 ? '#ff4f4f' : warnings.length > 0 ? '#f5c842' : '#3ecf8e'
  const questions = version === '2025' ? ATTESTATION_QUESTIONS_2025 : ATTESTATION_QUESTIONS_2024

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  function updateOpca(updates) {
    const updated = { ...local, opcaData: { ...(local.opcaData || {}), ...updates } }
    setLocal(updated)
    return updated
  }

  async function save(data = local) {
    setSaving(true)
    try {
      await onSave(data)
      showToast('Saved to Supabase.', 'success')
    } catch (e) {
      showToast('Save failed: ' + e.message, 'error')
    }
    setSaving(false)
  }

  // ── Attestation ───────────────────────────────────────────────────────────

  function setAttestation(q, val) {
    const attest = { ...(local.opcaData?.attestation_answers || {}) }
    attest[`question_${q}`] = val
    updateOpca({ attestation_answers: attest })
  }

  async function signAttestation() {
    const attest = local.opcaData?.attestation_answers || {}
    const unanswered = questions.filter(({ q }) => {
      const v = attest[`question_${q}`]
      return v === null || v === undefined
    })
    if (unanswered.length > 0) {
      showToast(`Unanswered: ${unanswered.map(q => q.q.toUpperCase()).join(', ')}`, 'warn')
      return
    }
    const updated = updateOpca({
      attestation_answers: { ...attest, signed_at: new Date().toISOString() }
    })
    await save(updated)
  }

  // ── Work history ──────────────────────────────────────────────────────────

  function addWorkEntry() {
    const history = [...(local.opcaData?.work_history || []), { employer_name: '', from_date: '', to_date: '', is_current: false, contact_name: '', phone: '' }]
    updateOpca({ work_history: history })
  }

  function updateWorkEntry(i, field, value) {
    const history = [...(local.opcaData?.work_history || [])]
    history[i] = { ...history[i], [field]: value }
    updateOpca({ work_history: history })
  }

  function removeWorkEntry(i) {
    const history = [...(local.opcaData?.work_history || [])]
    history.splice(i, 1)
    updateOpca({ work_history: history })
  }

  // ── Peer refs ─────────────────────────────────────────────────────────────

  function updateRef(i, field, value) {
    const refs = [...(local.opcaData?.peer_references || [])]
    while (refs.length <= i) refs.push({})
    refs[i] = { ...refs[i], [field]: value }
    updateOpca({ peer_references: refs })
  }

  // ── Auth & Release ────────────────────────────────────────────────────────

  function updateAuth(field, value) {
    const auth = { ...(local.opcaData?.authorization_release || {}) }
    auth[field] = value
    updateOpca({ authorization_release: auth })
  }

  async function signAuth() {
    const auth = local.opcaData?.authorization_release || {}
    if (!auth.printed_name?.trim()) {
      showToast('Enter printed name before signing.', 'warn')
      return
    }
    const updated = updateOpca({ authorization_release: { ...auth, signed_at: new Date().toISOString() } })
    await save(updated)
  }

  // ── Form preview pages ────────────────────────────────────────────────────

  const pages = {
    3: () => (
      <>
        <div style={{ fontWeight: 'bold', fontSize: 10, borderBottom: '1px solid #000', marginBottom: 8, textTransform: 'uppercase' }}>II. Practitioner Information</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
          <FormField label="Last Name" value={local.lname} />
          <FormField label="First Name" value={local.fname} />
          <FormField label="Degree(s)" value={local.cred} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
          <FormField label="Email" value={local.email} />
          <FormField label="Phone" value={local.phone} />
          <FormField label="Specialty" value={local.spec} />
        </div>
        {version === '2025' && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 8, background: '#f8f8ff', padding: 6, border: '1px solid #dde' }}>
            <FormField label="Race (REALD — optional)" value={local.opcaData?.reald_race} />
            <FormField label="Ethnicity (REALD)" value={local.opcaData?.reald_ethnicity} />
            <FormField label="Primary Language" value={local.opcaData?.reald_primary_language} />
          </div>
        )}
        <div style={{ marginTop: 12, fontWeight: 'bold', fontSize: 10, borderBottom: '1px solid #000', marginBottom: 8, textTransform: 'uppercase' }}>III. Specialty</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <FormField label="Principal Specialty" value={local.spec} />
          <FormField label="NPI Taxonomy Code" value={local.taxonomyCode} />
        </div>
      </>
    ),
    8: () => (
      <>
        <div style={{ fontWeight: 'bold', fontSize: 10, borderBottom: '1px solid #000', marginBottom: 8, textTransform: 'uppercase' }}>XIV. Licensure, Registrations & ID Numbers</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
          <FormField label="OR License #" value={local.license} />
          <FormField label="License Type" value={local.cred} />
          <FormField label="Expiration" value={local.licenseExp} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
          <FormField label="DEA # (if applicable)" value={local.dea || 'DNA'} />
          {version === '2025' && <FormField label="DEA Issue Date ★2025" value={local.opcaData?.dea_issue_date} />}
          <FormField label="DEA Expiration" value={local.dea ? local.deaExp : 'N/A'} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <FormField label="Individual NPI" value={local.npi} />
          <FormField label="Medicare #" value={local.ptan} />
          <FormField label="OR Medicaid #" value={local.medicaid} />
        </div>
      </>
    ),
    10: () => (
      <>
        <div style={{ fontWeight: 'bold', fontSize: 10, borderBottom: '1px solid #000', marginBottom: 8, textTransform: 'uppercase' }}>XVII. Work History</div>
        {(local.opcaData?.work_history || []).map((j, i) => (
          <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px dashed #ccc' }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
              <FormField label="Employer / Practice" value={j.employer_name} />
              <FormField label="Contact" value={j.contact_name} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <FormField label="From" value={j.from_date} />
              <FormField label="To" value={j.is_current ? 'Present' : j.to_date} />
            </div>
          </div>
        ))}
        {!local.opcaData?.work_history?.length && <div style={{ fontSize: 9, color: '#c44' }}>⚠ No work history entered</div>}
      </>
    ),
    11: () => (
      <>
        <div style={{ fontWeight: 'bold', fontSize: 10, borderBottom: '1px solid #000', marginBottom: 8, textTransform: 'uppercase' }}>XVIII. Peer References <span style={{ fontWeight: 400, fontSize: 9 }}>(3 required)</span></div>
        {[0, 1, 2].map(i => {
          const ref = local.opcaData?.peer_references?.[i]
          return (
            <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px dashed #ccc' }}>
              <div style={{ fontSize: 8, color: '#666', fontWeight: 'bold', marginBottom: 4 }}>
                Reference {i + 1} {!ref?.reference_name && <span style={{ color: '#c44' }}>MISSING</span>}
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
                <FormField label="Name" value={ref?.reference_name} />
                {version === '2025' && <FormField label="Location ★2025" value={ref?.location_name} />}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <FormField label="Specialty" value={ref?.specialty} />
                <FormField label="Credentials" value={ref?.credentials} />
                <FormField label="Phone" value={ref?.phone} />
              </div>
            </div>
          )
        })}
      </>
    ),
    14: () => {
      const attest = local.opcaData?.attestation_answers || {}
      return (
        <>
          <div style={{ fontWeight: 'bold', fontSize: 10, borderBottom: '1px solid #000', marginBottom: 8, textTransform: 'uppercase' }}>XXI. Attestation Questions</div>
          {questions.map(({ q, text, isCheckbox }) => {
            const val = attest[`question_${q}`]
            const unanswered = val === null || val === undefined
            return (
              <div key={q} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 5, paddingBottom: 4, borderBottom: '1px dotted #eee' }}>
                <span style={{ fontWeight: 'bold', fontSize: 9, minWidth: 14, color: '#333' }}>{q.toUpperCase()}.</span>
                <span style={{ flex: 1, fontSize: 8, lineHeight: 1.4, color: '#333' }}>{text.substring(0, 80)}{text.length > 80 ? '…' : ''}</span>
                {isCheckbox
                  ? <span style={{ fontSize: 11 }}>{val ? '☑' : '☐'}</span>
                  : <span style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 700, color: unanswered ? '#c44' : val ? '#c44' : '#2a7a3a' }}>{unanswered ? '—' : val ? 'YES' : 'NO'}</span>
                }
              </div>
            )
          })}
          <div style={{ marginTop: 16, borderTop: '1px solid #999', paddingTop: 8 }}>
            <FormField label="Provider Signature" value={attest.signed_at ? `Signed ${new Date(attest.signed_at).toLocaleDateString()}` : null} />
          </div>
        </>
      )
    },
    15: () => {
      const auth = local.opcaData?.authorization_release || {}
      return (
        <>
          <div style={{ fontWeight: 'bold', fontSize: 10, borderBottom: '1px solid #000', marginBottom: 12, textTransform: 'uppercase' }}>Authorization & Release of Information</div>
          <div style={{ fontSize: 8, color: '#555', lineHeight: 1.6, marginBottom: 20 }}>
            By submitting this application, I authorize all individuals and institutions to release information bearing on my professional qualifications, ethical standing, competence, and mental and physical health status…
          </div>
          <div style={{ display: 'flex', gap: 16, borderTop: '1px solid #999', paddingTop: 12 }}>
            <FormField label="Printed Name" value={auth.printed_name} />
            <FormField label="Signature / Date" value={auth.signed_at ? `Signed ${new Date(auth.signed_at).toLocaleDateString()}` : null} />
          </div>
        </>
      )
    },
  }

  const PAGE_LABELS = { 3: 'Sec II–III', 8: 'Sec XIV', 10: 'Sec XVII', 11: 'Sec XVIII', 14: 'Sec XXI', 15: 'Auth' }
  const PAGE_LIST = [3, 8, 10, 11, 14, 15]

  function renderPage() {
    const renderer = pages[currentPage]
    return renderer ? renderer() : <div style={{ color: '#999', fontSize: 10, padding: 20, textAlign: 'center' }}>Page {currentPage}</div>
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={S.root}>

      {/* ── LEFT: Form preview ───────────────────────────────────────────── */}
      <div style={S.leftPanel}>
        <div style={S.previewHeader}>
          {onBack && (
            <button onClick={onBack} style={{ padding: '3px 10px', fontSize: 11, background: 'transparent', border: '1px solid #2a2f3d', borderRadius: 4, color: '#8b90a8', cursor: 'pointer', marginRight: 4 }}>← Back</button>
          )}
          <span style={S.previewLabel}>OPCA {version} — {local.lname}, {local.fname} {local.cred}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {PAGE_LIST.map(p => (
              <button key={p} onClick={() => setCurrentPage(p)} style={{ padding: '2px 8px', fontSize: 10, fontFamily: 'monospace', cursor: 'pointer', borderRadius: 3, border: '1px solid ' + (currentPage === p ? '#4f7cff' : '#2a2f3d'), background: currentPage === p ? '#1e2d5a' : 'transparent', color: currentPage === p ? '#4f7cff' : '#555c72' }}>
                {PAGE_LABELS[p]}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 3, marginLeft: 8 }}>
            {['2024','2025'].map(v => (
              <button key={v} onClick={() => setVersion(v)} style={{ padding: '2px 8px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700, cursor: 'pointer', borderRadius: 3, border: '1px solid ' + (version === v ? '#4f7cff' : '#2a2f3d'), background: version === v ? '#1e2d5a' : 'transparent', color: version === v ? '#4f7cff' : '#555c72' }}>{v}</button>
            ))}
          </div>
        </div>

        <div style={S.previewViewport}>
          <div style={S.formPage}>
            {/* Initials stamp */}
            <div style={{ fontSize: 8, color: '#888', marginBottom: 16, display: 'flex', gap: 20 }}>
              Initials:&nbsp;<span style={{ color: '#1a3fc0', fontFamily: 'monospace', fontWeight: 700 }}>{(local.fname?.[0] || '') + (local.lname?.[0] || '')}</span>
              &nbsp;&nbsp;Date:&nbsp;<span style={{ color: '#1a3fc0', fontFamily: 'monospace', fontWeight: 700 }}>{new Date().toLocaleDateString()}</span>
            </div>
            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 13, textTransform: 'uppercase', borderBottom: '2px solid #000', paddingBottom: 10, marginBottom: 16 }}>
              Oregon Practitioner Credentialing Application
            </div>
            {renderPage()}
            <div style={{ position: 'absolute', bottom: 12, left: 48, right: 48, display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#555', borderTop: '1px solid #ddd', paddingTop: 6 }}>
              <span>Oregon Practitioner Credentialing Application</span>
              <span>Page {currentPage} of {version === '2025' ? 16 : 15}</span>
              <span>300-265163_MSC 9048 ({version === '2025' ? '09/2025' : '05/2024'})</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Editor panel ──────────────────────────────────────────── */}
      <div style={S.rightPanel}>

        {/* Validation strip */}
        <div style={S.vStrip}>
          <Dot color={statusColor} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>
            {blocking.length > 0 ? `${blocking.length} blocking issue${blocking.length !== 1 ? 's' : ''}` : errors.length > 0 ? `${errors.length} error${errors.length !== 1 ? 's' : ''}` : warnings.length > 0 ? `${warnings.length} warning${warnings.length !== 1 ? 's' : ''}` : 'Ready to export'}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, fontSize: 10, fontFamily: 'monospace' }}>
            {errors.length > 0 && <span style={{ background: '#2e0e0e', color: '#ff4f4f', padding: '2px 7px', borderRadius: 3 }}>✕ {errors.length}</span>}
            {warnings.length > 0 && <span style={{ background: '#2e2608', color: '#f5c842', padding: '2px 7px', borderRadius: 3 }}>⚠ {warnings.length}</span>}
            {errors.length === 0 && <span style={{ background: '#0e2e20', color: '#3ecf8e', padding: '2px 7px', borderRadius: 3 }}>✓ OK</span>}
          </div>
        </div>

        {/* Tabs */}
        <div style={S.tabs}>
          {[['progress','Progress'],['issues','Issues'],['attestation','Attestation'],['refs','Peer Refs'],['history','Work History'],['auth','Auth & Release']].map(([key, label]) => (
            <button key={key} style={S.tab(tab === key)} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>

        {/* Tab content */}
        <div style={S.content}>

          {/* PROGRESS */}
          {tab === 'progress' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sectionScores.map(s => {
                const cls = s.score === 100 ? '#3ecf8e' : s.score > 0 ? '#f5c842' : '#ff4f4f'
                return (
                  <div key={s.key} onClick={() => { setTab('issues'); setCurrentPage(s.page) }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#1a1e28', border: '1px solid #2a2f3d', borderRadius: 6, cursor: 'pointer' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 500 }}>{s.label}</div>
                      <div style={{ fontSize: 10, color: '#555c72', fontFamily: 'monospace' }}>{s.completed}/{s.total} fields</div>
                    </div>
                    <div style={{ width: 80, height: 4, background: '#212636', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: s.score + '%', height: '100%', background: cls, borderRadius: 2, transition: 'width 0.3s' }} />
                    </div>
                    <div style={{ fontSize: 10, fontFamily: 'monospace', color: cls, minWidth: 32, textAlign: 'right' }}>{s.score}%</div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ISSUES */}
          {tab === 'issues' && (
            <div>
              {validation.issues.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40, color: '#3ecf8e', fontSize: 13 }}>✅ No issues — ready to export</div>
              )}
              {[...validation.issues].sort((a,b) => (a.severity === 'error' ? -1 : 1)).map((iss, idx) => (
                <div key={idx} style={S.issueCard(iss.severity)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, padding: '1px 5px', borderRadius: 2, background: iss.severity === 'error' ? '#ff4f4f' : '#f5c842', color: iss.severity === 'error' ? '#fff' : '#000' }}>{iss.severity.toUpperCase()}</span>
                    {iss.blocking && <span style={{ fontSize: 9, color: '#ff4f4f', marginLeft: 'auto' }}>⛔ BLOCKS EXPORT</span>}
                  </div>
                  <div style={{ fontSize: 10, color: '#8b90a8', fontFamily: 'monospace', marginBottom: 3 }}>{iss.section}</div>
                  <div style={{ fontSize: 11, color: '#e8eaf0', lineHeight: 1.4 }}>{iss.message}</div>
                </div>
              ))}
            </div>
          )}

          {/* ATTESTATION */}
          {tab === 'attestation' && (
            <div>
              <div style={{ fontSize: 10, color: '#8b90a8', marginBottom: 12, lineHeight: 1.5 }}>
                All 15 questions required for the {version} OPCA. YES answers need a written explanation attached.
              </div>
              {questions.map(({ q, text, isCheckbox }) => {
                const val = local.opcaData?.attestation_answers?.[`question_${q}`]
                const unanswered = val === null || val === undefined
                return (
                  <div key={q} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 0', borderBottom: '1px solid #2a2f3d' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#4f7cff', width: 16, flexShrink: 0 }}>{q.toUpperCase()}</span>
                    <span style={{ flex: 1, fontSize: 10, color: '#8b90a8', lineHeight: 1.4 }}>{text}</span>
                    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                      {isCheckbox ? (
                        <button onClick={() => setAttestation(q, !val)} style={{ width: 28, height: 22, borderRadius: 3, border: '1px solid ' + (val ? '#3ecf8e' : '#2a2f3d'), background: val ? '#0e2e20' : '#1a1e28', color: val ? '#3ecf8e' : '#555c72', cursor: 'pointer', fontSize: 12 }}>{val ? '✓' : '☐'}</button>
                      ) : (
                        <>
                          <button onClick={() => setAttestation(q, true)} style={{ width: 34, height: 22, borderRadius: 3, fontSize: 10, fontWeight: 700, border: '1px solid ' + (val === true ? '#ff4f4f' : '#2a2f3d'), background: val === true ? '#2e0e0e' : '#1a1e28', color: val === true ? '#ff4f4f' : '#555c72', cursor: 'pointer' }}>YES</button>
                          <button onClick={() => setAttestation(q, false)} style={{ width: 34, height: 22, borderRadius: 3, fontSize: 10, fontWeight: 700, border: '1px solid ' + (val === false ? '#3ecf8e' : '#2a2f3d'), background: val === false ? '#0e2e20' : '#1a1e28', color: val === false ? '#3ecf8e' : '#555c72', cursor: 'pointer' }}>NO</button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
              <button onClick={signAttestation} style={{ ...S.btn(true, false), marginTop: 14 }}>
                {local.opcaData?.attestation_answers?.signed_at ? `✓ Re-sign (signed ${new Date(local.opcaData.attestation_answers.signed_at).toLocaleDateString()})` : '✍ Sign Attestation'}
              </button>
            </div>
          )}

          {/* PEER REFS */}
          {tab === 'refs' && (
            <div>
              <div style={{ fontSize: 10, color: '#8b90a8', marginBottom: 12 }}>3 peers required. At least one should be from Medical Staff at each facility you have privileges.</div>
              {[0, 1, 2].map(i => {
                const ref = local.opcaData?.peer_references?.[i] || {}
                const refFields = [
                  ['Name *', 'reference_name'],
                  ['Specialty', 'specialty'],
                  ['Credentials', 'credentials'],
                  ['Professional Relationship', 'professional_relationship'],
                  ['Phone *', 'phone'],
                  ['Email', 'email'],
                  ...(version === '2025' ? [['Location / Facility ★2025', 'location_name']] : []),
                ]
                return (
                  <div key={i} style={S.fieldGroup}>
                    <div style={S.fieldGroupTitle}>REFERENCE {i + 1} {!ref.reference_name && <span style={{ color: '#ff4f4f' }}>— MISSING</span>}</div>
                    <div style={{ padding: 12 }}>
                      {refFields.map(([label, field]) => (
                        <div key={field} style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 10, color: '#8b90a8', marginBottom: 3 }}>{label}</div>
                          <input value={ref[field] || ''} onChange={e => updateRef(i, field, e.target.value)} style={S.input} placeholder={label.replace(' *', '').replace(' ★2025', '')} />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              <button onClick={() => save()} disabled={saving} style={S.btn(true, saving)}>{saving ? 'Saving…' : '💾 Save Peer References'}</button>
            </div>
          )}

          {/* WORK HISTORY */}
          {tab === 'history' && (
            <div>
              <div style={{ fontSize: 10, color: '#8b90a8', marginBottom: 12, lineHeight: 1.5 }}>
                Account for all periods from professional school entry to present. Explain any gaps over 2 months.
              </div>
              {(local.opcaData?.work_history || []).map((job, i) => (
                <div key={i} style={S.fieldGroup}>
                  <div style={{ ...S.fieldGroupTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>JOB {i + 1}</span>
                    <button onClick={() => removeWorkEntry(i)} style={{ background: 'transparent', border: 'none', color: '#ff4f4f', cursor: 'pointer', fontSize: 12 }}>✕</button>
                  </div>
                  <div style={{ padding: 12 }}>
                    {[
                      ['Employer / Practice *', 'employer_name'],
                      [version === '2025' ? 'Contact Name & Position ★2025' : 'Contact Name', 'contact_name'],
                      ['Phone', 'phone'],
                      ['From (YYYY-MM)', 'from_date'],
                      ['To (YYYY-MM, blank if current)', 'to_date'],
                      ['Liability Carrier', 'liability_carrier'],
                    ].map(([label, field]) => (
                      <div key={field} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: '#8b90a8', marginBottom: 3 }}>{label}</div>
                        <input value={job[field] || ''} onChange={e => updateWorkEntry(i, field, e.target.value)} style={S.input} placeholder={label.replace(' *', '').replace(/★2025/g, '')} />
                      </div>
                    ))}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#8b90a8', cursor: 'pointer' }}>
                      <input type="checkbox" checked={job.is_current || false} onChange={e => updateWorkEntry(i, 'is_current', e.target.checked)} />
                      Current position
                    </label>
                  </div>
                </div>
              ))}
              <button onClick={addWorkEntry} style={{ ...S.btn(false, false), marginBottom: 8, fontSize: 12 }}>+ Add Work Entry</button>
              {/* Gap explanations */}
              {(local.opcaData?.work_history_gaps || []).length > 0 && (
                <div style={S.fieldGroup}>
                  <div style={S.fieldGroupTitle}>GAP EXPLANATIONS (XVII-B)</div>
                  <div style={{ padding: 12 }}>
                    {(local.opcaData.work_history_gaps).map((gap, i) => (
                      <div key={i} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: '#8b90a8', marginBottom: 3 }}>{gap.from_date} → {gap.to_date}</div>
                        <input value={gap.explanation || ''} onChange={e => {
                          const gaps = [...local.opcaData.work_history_gaps]
                          gaps[i] = { ...gaps[i], explanation: e.target.value }
                          updateOpca({ work_history_gaps: gaps })
                        }} style={S.input} placeholder="Explain gap (required)" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={() => save()} disabled={saving} style={S.btn(true, saving)}>{saving ? 'Saving…' : '💾 Save Work History'}</button>
            </div>
          )}

          {/* AUTH & RELEASE */}
          {tab === 'auth' && (
            <div>
              <div style={{ fontSize: 10, color: '#8b90a8', marginBottom: 12, lineHeight: 1.5 }}>
                Authorization and Release of Information (Page 15). Must be signed separately from the Attestation.
              </div>
              <div style={S.fieldGroup}>
                <div style={S.fieldGroupTitle}>AUTHORIZATION & RELEASE</div>
                <div style={{ padding: 12 }}>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: '#8b90a8', marginBottom: 3 }}>Printed Name *</div>
                    <input value={local.opcaData?.authorization_release?.printed_name || ''} onChange={e => updateAuth('printed_name', e.target.value)} style={S.input} placeholder={`${local.fname} ${local.lname}, ${local.cred}`} />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: '#8b90a8', marginBottom: 3 }}>Release to Organizations</div>
                    <input value={local.opcaData?.authorization_release?.release_to_orgs || ''} onChange={e => updateAuth('release_to_orgs', e.target.value)} style={S.input} placeholder="e.g. PacificSource, OHA, Providence Health" />
                  </div>
                  {local.opcaData?.authorization_release?.signed_at && (
                    <div style={{ fontSize: 11, color: '#3ecf8e', marginTop: 8 }}>
                      ✓ Signed {new Date(local.opcaData.authorization_release.signed_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
              <button onClick={signAuth} style={S.btn(true, false)}>
                {local.opcaData?.authorization_release?.signed_at ? '✓ Re-sign Authorization' : '✍ Sign Authorization & Release'}
              </button>
            </div>
          )}

        </div>

        {/* Footer: Export */}
        <div style={S.footer}>
          {blocking.length > 0 && (
            <div style={{ fontSize: 10, color: '#ff4f4f', marginBottom: 10, lineHeight: 1.5 }}>
              ⛔ {blocking.length} blocking issue{blocking.length !== 1 ? 's' : ''} must be resolved before export.
            </div>
          )}
          <button disabled={blocking.length > 0} style={S.btn(true, blocking.length > 0)}>
            ⬇ Export Filled OPCA {version} PDF
          </button>
        </div>

      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, padding: '10px 16px', borderRadius: 6, fontSize: 12, fontWeight: 500, background: '#13161e', border: '1px solid ' + (toast.type === 'success' ? '#3ecf8e' : toast.type === 'error' ? '#ff4f4f' : '#f5c842'), color: toast.type === 'success' ? '#3ecf8e' : toast.type === 'error' ? '#ff4f4f' : '#f5c842', zIndex: 200, maxWidth: 320, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
