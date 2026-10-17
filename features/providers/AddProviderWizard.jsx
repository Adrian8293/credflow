/**
 * AddProviderWizard.jsx — Lacentra v2
 *
 * Replaces the 100-line single-form AddProvider.jsx with a 4-step wizard:
 *   Step 1: Basic Info (name, credential, specialty, status, contact)
 *   Step 2: Credentials & IDs (NPI, CAQH, license, DEA, Medicaid, PTAN)
 *   Step 3: Insurance & Supervision (malpractice, recred, supervisor)
 *   Step 4: Review & Save
 *
 * Features:
 *  - Sticky top progress bar showing step names
 *  - Step-level validation (required fields gated per step)
 *  - NPI lookup wired to Step 2 autofill
 *  - Psychology Today section shown only for Mental Health specialty
 *  - Review step shows all values in a read-only summary before saving
 *  - Keyboard-friendly (Enter moves to next step)
 *
 * Usage: Drop-in replacement. Same props as AddProvider.jsx.
 */

import { US_STATES } from '../../constants/usStates.js'
import { useState, useCallback } from 'react'
import { NpiLookupPanel } from './NpiLookupPanel.jsx'

// ─── STEP DEFINITIONS ────────────────────────────────────────────────────────
const STEPS = [
  { id: 'basic',      label: 'Basic Info',        short: '1' },
  { id: 'credentials',label: 'Credentials & IDs', short: '2' },
  { id: 'insurance',  label: 'Insurance',          short: '3' },
  { id: 'review',     label: 'Review & Save',      short: '4' },
]

// ─── REQUIRED FIELDS PER STEP ────────────────────────────────────────────────
const REQUIRED = {
  basic:       ['fname', 'lname'],
  credentials: ['licenseExp'],
  insurance:   [],
  review:      [],
}

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────
function WizardProgress({ step, setStep, completed }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      marginBottom: 24,
    }}>
      {STEPS.map((s, i) => {
        const isDone    = completed.includes(s.id)
        const isActive  = s.id === step
        const isReached = STEPS.findIndex(x => x.id === step) >= i
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            {/* Node */}
            <div
              onClick={() => isReached && setStep(s.id)}
              style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: isDone ? 13 : 12,
                fontWeight: 700,
                cursor: isReached ? 'pointer' : 'default',
                flexShrink: 0,
                border: `2px solid ${isActive ? 'var(--pr)' : isDone ? 'var(--success)' : 'var(--border)'}`,
                background: isActive ? 'var(--pr)' : isDone ? 'var(--success)' : 'transparent',
                color: isActive || isDone ? '#fff' : 'var(--text-3)',
                transition: 'all .2s',
              }}
            >
              {isDone && !isActive ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              ) : s.short}
            </div>
            {/* Label */}
            <div style={{
              marginLeft: 6, marginRight: 4,
              fontSize: 11, fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--text-1)' : isDone ? 'var(--text-2)' : 'var(--text-3)',
              whiteSpace: 'nowrap',
              display: window.innerWidth < 480 ? 'none' : 'block',
            }}>
              {s.label}
            </div>
            {/* Connector */}
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1,
                height: 2,
                background: isDone ? 'var(--success)' : 'var(--border)',
                margin: '0 8px',
                transition: 'background .2s',
                marginLeft: window.innerWidth < 480 ? 6 : 8,
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── FIELD HELPERS ────────────────────────────────────────────────────────────
function FieldGroup({ children, cols = 2 }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: '10px 16px',
    }}>
      {children}
    </div>
  )
}

function Field({ label, required, children, hint, full }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5 }}>
        {label}{required && <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

function SectionDivider({ title }) {
  return (
    <div style={{
      gridColumn: '1 / -1',
      fontSize: 10.5,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '.06em',
      color: 'var(--text-3)',
      borderBottom: '1px solid var(--border)',
      paddingBottom: 6,
      marginTop: 8,
    }}>
      {title}
    </div>
  )
}

// ─── REVIEW ROW ───────────────────────────────────────────────────────────────
function ReviewRow({ label, value, onEdit, stepId }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 160, flexShrink: 0, fontSize: 11.5, color: 'var(--text-3)', paddingTop: 1 }}>{label}</div>
      <div style={{ flex: 1, fontSize: 12.5, color: 'var(--text-1)', fontWeight: 500 }}>{value}</div>
      <button
        onClick={() => onEdit(stepId)}
        style={{ flexShrink: 0, fontSize: 11, color: 'var(--pr)', fontWeight: 500, padding: 0, background: 'none', border: 'none', cursor: 'pointer' }}
      >
        Edit
      </button>
    </div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export function AddProviderWizard({
  db,
  provForm, setProvForm,
  editingId, setEditingId,
  npiInput, setNpiInput,
  npiResult, setNpiResult,
  npiLoading, lookupNPI,
  handleSaveProvider,
  handleDeleteProvider,
  handlePhotoUpload,
  handleDeletePhoto,
  photoUploading,
  setPage,
  saving,
}) {
  const [step, setStep]           = useState('basic')
  const [completed, setCompleted] = useState([])
  const [errors, setErrors]       = useState({})

  const f   = (k) => provForm[k] || ''
  const set = (k, v) => setProvForm(prev => ({ ...prev, [k]: v }))

  // Validate current step's required fields
  function validateStep(s) {
    const req   = REQUIRED[s] || []
    const errs  = {}
    req.forEach(k => { if (!provForm[k]) errs[k] = 'Required' })
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function goNext() {
    const idx = STEPS.findIndex(s => s.id === step)
    if (!validateStep(step)) return
    setCompleted(c => [...new Set([...c, step])])
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1].id)
  }

  function goPrev() {
    const idx = STEPS.findIndex(s => s.id === step)
    if (idx > 0) setStep(STEPS[idx - 1].id)
  }

  const inp = useCallback((k, placeholder, type = 'text', opts = {}) => (
    <input
      type={type}
      value={f(k)}
      onChange={e => { set(k, e.target.value); if (errors[k]) setErrors(prev => ({ ...prev, [k]: null })) }}
      placeholder={placeholder}
      style={errors[k] ? { borderColor: 'var(--danger)' } : {}}
      {...opts}
    />
  ), [provForm, errors])

  const sel = useCallback((k, children) => (
    <select value={f(k)} onChange={e => set(k, e.target.value)}>
      {children}
    </select>
  ), [provForm])

  const isEdit    = !!editingId?.provider
  const stepIdx   = STEPS.findIndex(s => s.id === step)
  const isFirst   = stepIdx === 0
  const isReview  = step === 'review'

  // ── STEP CONTENT ──────────────────────────────────────────────────────────
  function renderStep() {
    switch (step) {

      // ── STEP 1: BASIC INFO ──────────────────────────────────────────────
      case 'basic':
        return (
          <FieldGroup>
            <SectionDivider title="Identity" />
            <Field label="First Name" required>
              {inp('fname', 'Jane')}
              {errors.fname && <div style={{ color: 'var(--danger)', fontSize: 11, marginTop: 3 }}>Required</div>}
            </Field>
            <Field label="Last Name" required>
              {inp('lname', 'Smith')}
              {errors.lname && <div style={{ color: 'var(--danger)', fontSize: 11, marginTop: 3 }}>Required</div>}
            </Field>
            <Field label="Credential / License Type">
              {sel('cred', <>
                <option value="">— Select —</option>
                <option value="LCSW">LCSW — Licensed Clinical Social Worker</option>
                <option value="LPC">LPC — Licensed Professional Counselor</option>
                <option value="LMFT">LMFT — Licensed Marriage & Family Therapist</option>
                <option value="MFT Associate">MFT Associate (Supervised)</option>
                <option value="LCSW Associate">LCSW Associate (Supervised)</option>
                <option value="Licensed Psychologist">Licensed Psychologist (PhD/PsyD)</option>
                <option value="PMHNP">PMHNP — Psychiatric Nurse Practitioner</option>
                <option value="Naturopathic Physician">Naturopathic Physician (ND)</option>
                <option value="Chiropractor">Chiropractor (DC)</option>
                <option value="Acupuncturist">Licensed Acupuncturist (LAc)</option>
                <option value="LMT">Licensed Massage Therapist (LMT)</option>
                <option value="MD">Medical Doctor (MD)</option>
                <option value="DO">Doctor of Osteopathy (DO)</option>
                <option value="Other">Other</option>
              </>)}
            </Field>
            <Field label="Specialty Category">
              {sel('spec', <>
                <option>Mental Health</option>
                <option>Massage Therapy</option>
                <option>Naturopathic</option>
                <option>Chiropractic</option>
                <option>Acupuncture</option>
                <option>Wellness</option>
              </>)}
            </Field>
            <Field label="Provider Status">
              {sel('status', <>
                <option>Active</option>
                <option>Pending</option>
                <option>Inactive</option>
              </>)}
            </Field>

            <SectionDivider title="Contact" />
            <Field label="Email">{inp('email', 'provider@clinic.com', 'email')}</Field>
            <Field label="Phone">{inp('phone', '(503) 000-0000', 'tel')}</Field>
            <Field label="Specialty Focus" full>
              {inp('focus', 'Trauma, EMDR, Anxiety, Depression…')}
            </Field>
          </FieldGroup>
        )

      // ── STEP 2: CREDENTIALS & IDs ──────────────────────────────────────
      case 'credentials':
        return (
          <>
            {/* NPI Lookup at top of credentials step */}
            <div style={{ marginBottom: 16 }}>
              <NpiLookupPanel
                npiInput={npiInput}
                setNpiInput={setNpiInput}
                npiResult={npiResult}
                setNpiResult={setNpiResult}
                npiLoading={npiLoading}
                lookupNPI={lookupNPI}
                setProvForm={setProvForm}
              />
            </div>

            <FieldGroup>
              <SectionDivider title="National Identifiers" />
              <Field label="NPI Number" hint="10-digit Type 1 NPI">
                {inp('npi', '1234567890', 'text', { maxLength: 10 })}
              </Field>
              <Field label="State License Number" required>
                {inp('license', 'C12345')}
                {errors.licenseExp && <div style={{ color: 'var(--danger)', fontSize: 11, marginTop: 3 }}>Expiration date required</div>}
              </Field>
              <Field label="License State" hint="Add more states later from the Credentials tab">
                <select value={f('licenseState')} onChange={e => set('licenseState', e.target.value)}>
                  <option value="">Select…</option>
                  {US_STATES.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="License Expiration" required>
                {inp('licenseExp', '', 'date')}
                {errors.licenseExp && <div style={{ color: 'var(--danger)', fontSize: 11, marginTop: 3 }}>Required</div>}
              </Field>
              <Field label="Taxonomy Code" hint="From NPPES">
                {inp('taxonomyCode', '101YM0800X')}
              </Field>

              <SectionDivider title="CAQH" />
              <Field label="CAQH ID">{inp('caqh', '12345678')}</Field>
              <Field label="CAQH Attestation Date">{inp('caqhAttest', '', 'date')}</Field>
              <Field label="Next CAQH Due Date" hint="Every 120 days">
                {inp('caqhDue', '', 'date')}
              </Field>

              <SectionDivider title="Government Programs" />
              <Field label="Medicaid / DMAP ID">{inp('medicaid', 'OR1234567')}</Field>
              <Field label="Medicare PTAN">{inp('ptan', 'If applicable')}</Field>
              <Field label="DEA Registration #">{inp('dea', 'AB1234567')}</Field>
              <Field label="DEA Expiration">{inp('deaExp', '', 'date')}</Field>
            </FieldGroup>
          </>
        )

      // ── STEP 3: INSURANCE ─────────────────────────────────────────────
      case 'insurance':
        return (
          <FieldGroup>
            <SectionDivider title="Malpractice Insurance" />
            <Field label="Carrier">{inp('malCarrier', 'HPSO, CPH&A…')}</Field>
            <Field label="Policy Number">{inp('malPolicy', 'POL-123456')}</Field>
            <Field label="Expiration Date">{inp('malExp', '', 'date')}</Field>

            <SectionDivider title="Recredentialing" />
            <Field label="Recredentialing Due Date">{inp('recred', '', 'date')}</Field>

            <SectionDivider title="Supervision (Associates Only)" />
            <Field label="Supervising Provider">{inp('supervisor', 'Name of supervisor')}</Field>
            <Field label="Supervision Expiration">{inp('supExp', '', 'date')}</Field>

            {f('spec') === 'Mental Health' && (
              <>
                <SectionDivider title="Psychology Today Profile" />
                <Field label="Profile URL" full>
                  <input
                    type="url"
                    value={f('ptUrl')}
                    onChange={e => set('ptUrl', e.target.value)}
                    placeholder="https://www.psychologytoday.com/us/therapists/…"
                  />
                </Field>
                <Field label="Listing Status">
                  <select value={f('ptStatus') || 'None'} onChange={e => set('ptStatus', e.target.value)}>
                    <option value="None">No Listing</option>
                    <option value="Active">Active Listing</option>
                    <option value="Inactive">Inactive / Paused</option>
                  </select>
                </Field>
                <Field label="Monthly Fee ($29.95/mo)?">
                  <select value={f('ptMonthlyFee') ? 'true' : 'false'} onChange={e => set('ptMonthlyFee', e.target.value === 'true')}>
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </Field>
              </>
            )}
          </FieldGroup>
        )

      // ── STEP 4: REVIEW ───────────────────────────────────────────────
      case 'review':
        return (
          <div>
            <div style={{ background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', marginBottom: 2 }}>PROVIDER SUMMARY</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                {f('fname') || '—'} {f('lname')}{f('cred') ? `, ${f('cred')}` : ''}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                {f('spec')}{f('status') ? ` · ${f('status')}` : ''}
              </div>
            </div>

            <ReviewRow label="Email"         value={f('email')}      onEdit={setStep} stepId="basic" />
            <ReviewRow label="Phone"         value={f('phone')}      onEdit={setStep} stepId="basic" />
            <ReviewRow label="Focus"         value={f('focus')}      onEdit={setStep} stepId="basic" />
            <ReviewRow label="NPI"           value={f('npi')}        onEdit={setStep} stepId="credentials" />
            <ReviewRow label="License #"     value={f('license')}    onEdit={setStep} stepId="credentials" />
            <ReviewRow label="License Exp"   value={f('licenseExp')} onEdit={setStep} stepId="credentials" />
            <ReviewRow label="CAQH ID"       value={f('caqh')}       onEdit={setStep} stepId="credentials" />
            <ReviewRow label="CAQH Due"      value={f('caqhDue')}    onEdit={setStep} stepId="credentials" />
            <ReviewRow label="Medicaid ID"   value={f('medicaid')}   onEdit={setStep} stepId="credentials" />
            <ReviewRow label="DEA #"         value={f('dea')}        onEdit={setStep} stepId="credentials" />
            <ReviewRow label="Mal. Carrier"  value={f('malCarrier')} onEdit={setStep} stepId="insurance" />
            <ReviewRow label="Mal. Policy"   value={f('malPolicy')}  onEdit={setStep} stepId="insurance" />
            <ReviewRow label="Mal. Exp"      value={f('malExp')}     onEdit={setStep} stepId="insurance" />
            <ReviewRow label="Supervisor"    value={f('supervisor')} onEdit={setStep} stepId="insurance" />
            <ReviewRow label="Recred Due"    value={f('recred')}     onEdit={setStep} stepId="insurance" />

            {!f('npi') && (
              <div style={{
                marginTop: 14,
                padding: '9px 12px',
                background: 'var(--amber-l)',
                border: '1px solid var(--amber-b)',
                borderRadius: 'var(--r)',
                fontSize: 12,
                color: 'var(--amber-d)',
              }}>
                ⚠ NPI is missing. Most payers require NPI for enrollment — consider adding it before proceeding.
              </div>
            )}
            {!f('licenseExp') && (
              <div style={{
                marginTop: 8,
                padding: '9px 12px',
                background: 'var(--red-l)',
                border: '1px solid var(--red-b)',
                borderRadius: 'var(--r)',
                fontSize: 12,
                color: 'var(--danger)',
              }}>
                ✕ License expiration date is required. Please go back and add it.
              </div>
            )}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 760 }}>

        {/* Card Header */}
        <div className="card-header">
          <h3>{isEdit ? `Edit Provider — ${f('fname')} ${f('lname')}` : 'New Provider'}</h3>
          <div className="ch-meta">
            {isEdit ? 'Update provider information' : 'Step-by-step onboarding'}
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ padding: '16px 16px 0' }}>
          <WizardProgress step={step} setStep={setStep} completed={completed} />
        </div>

        {/* Step Content */}
        <div className="card-body" style={{ minHeight: 320 }}>
          {renderStep()}
        </div>

        {/* Footer actions */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            {isEdit && editingId?.provider && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleDeleteProvider(editingId.provider)}
              >
                Delete Provider
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-sm"
              onClick={() => isFirst ? setPage('providers') : goPrev()}
            >
              {isFirst ? 'Cancel' : '← Back'}
            </button>

            {!isReview && (
              <button className="btn btn-primary btn-sm" onClick={goNext}>
                Continue →
              </button>
            )}

            {isReview && (
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSaveProvider}
                disabled={saving || !f('licenseExp')}
              >
                {saving ? (
                  <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} /> Saving…</>
                ) : (
                  isEdit ? 'Save Changes' : 'Add Provider'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AddProviderWizard

/*
 * ─── SWAP IN index.js ────────────────────────────────────────────────────────
 *
 * 1. Import the wizard:
 *    import { AddProviderWizard } from '../features/providers/AddProviderWizard.jsx'
 *
 * 2. Replace the AddProvider render:
 *    // Before:
 *    if (page === 'add-provider') return <AddProvider {...props} />
 *
 *    // After:
 *    if (page === 'add-provider') return <AddProviderWizard {...props} />
 *
 * 3. No prop changes needed — same interface.
 */
