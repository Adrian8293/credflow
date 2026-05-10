/**
 * AddProviderDrawer.jsx — PrimeCredential
 *
 * Slide-in drawer panel that opens OVER the Providers page.
 * Step 1 leads with NPI lookup → auto-fills the form.
 * 4-step wizard: NPI + Basic → Credentials → Insurance → Review & Save
 *
 * Usage:
 *   <AddProviderDrawer
 *     open={drawerOpen}
 *     onClose={() => setDrawerOpen(false)}
 *     db={db}
 *     provForm={...} setProvForm={...}
 *     editingId={...}
 *     npiInput npiResult npiLoading lookupNPI setNpiInput setNpiResult
 *     handleSaveProvider handleDeleteProvider saving
 *   />
 */

import { useState, useCallback, useEffect } from 'react'
import { NpiLookupPanel } from './NpiLookupPanel.jsx'

// ─── STEPS ───────────────────────────────────────────────────────────────────
const STEPS = [
  { id: 'basic',       label: 'Basic Info',        icon: '①' },
  { id: 'credentials', label: 'Credentials & IDs', icon: '②' },
  { id: 'insurance',   label: 'Insurance',          icon: '③' },
  { id: 'review',      label: 'Review & Save',      icon: '④' },
]

const REQUIRED = {
  basic:       ['fname', 'lname'],
  credentials: ['licenseExp'],
  insurance:   [],
  review:      [],
}

// ─── FIELD PRIMITIVES ─────────────────────────────────────────────────────────
function Field({ label, required, hint, full, error, children }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '.05em',
        color: 'var(--text-3)', marginBottom: 4,
      }}>
        {label}{required && <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint  && <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 3 }}>{hint}</div>}
      {error && <div style={{ fontSize: 10.5, color: 'var(--danger)', marginTop: 3 }}>⚠ {error}</div>}
    </div>
  )
}

function FG({ children, cols = 2 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '12px 14px' }}>
      {children}
    </div>
  )
}

function Divider({ label }) {
  return (
    <div style={{
      gridColumn: '1 / -1',
      display: 'flex', alignItems: 'center', gap: 10,
      margin: '6px 0 2px',
    }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-4)', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

// ─── STEP PROGRESS ────────────────────────────────────────────────────────────
function StepProgress({ step, completed }) {
  const activeIdx = STEPS.findIndex(s => s.id === step)
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '16px 24px 0', gap: 0 }}>
      {STEPS.map((s, i) => {
        const done   = completed.includes(s.id)
        const active = s.id === step
        const col    = done ? 'var(--success)' : active ? 'var(--pr)' : 'var(--border)'
        const textC  = done || active ? '#fff' : 'var(--text-4)'
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: done ? 'var(--success)' : active ? 'var(--pr)' : 'var(--elevated)',
              border: `2px solid ${col}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: done ? 10 : 11, fontWeight: 700, color: textC,
              flexShrink: 0, transition: 'all .2s',
            }}>
              {done && !active
                ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                : i + 1
              }
            </div>
            <span style={{
              marginLeft: 5, fontSize: 10.5, fontWeight: active ? 700 : 400,
              color: active ? 'var(--text-1)' : done ? 'var(--text-2)' : 'var(--text-4)',
              whiteSpace: 'nowrap', marginRight: 6,
            }}>{s.label}</span>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? 'var(--success)' : 'var(--border)', borderRadius: 1, marginRight: 6, transition: 'background .2s' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── REVIEW ROW ───────────────────────────────────────────────────────────────
function RR({ label, value, onEdit, step }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--border-l)' }}>
      <div style={{ width: 140, flexShrink: 0, fontSize: 11.5, color: 'var(--text-4)' }}>{label}</div>
      <div style={{ flex: 1, fontSize: 12.5, color: 'var(--text-1)', fontWeight: 500 }}>{value}</div>
      <button onClick={() => onEdit(step)} style={{ color: 'var(--pr)', fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>Edit</button>
    </div>
  )
}

// ─── MAIN DRAWER ──────────────────────────────────────────────────────────────
export function AddProviderDrawer({
  open, onClose, db,
  provForm, setProvForm,
  editingId,
  npiInput, setNpiInput, npiResult, setNpiResult, npiLoading, lookupNPI,
  handleSaveProvider, handleDeleteProvider,
  saving,
}) {
  const [step, setStep]           = useState('basic')
  const [completed, setCompleted] = useState([])
  const [errors, setErrors]       = useState({})
  const [npiExpanded, setNpiExpanded] = useState(true)

  // Reset when reopened
  useEffect(() => {
    if (open) { setStep('basic'); setCompleted([]); setErrors({}) }
  }, [open])

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && open) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const f   = k => provForm[k] || ''
  const set = (k, v) => setProvForm(p => ({ ...p, [k]: v }))

  const inp = (k, placeholder, type = 'text', extra = {}) => (
    <input
      type={type} value={f(k)}
      onChange={e => { set(k, e.target.value); setErrors(prev => ({ ...prev, [k]: null })) }}
      placeholder={placeholder}
      style={{ borderColor: errors[k] ? 'var(--danger)' : undefined }}
      {...extra}
    />
  )

  const sel = (k, opts) => (
    <select value={f(k)} onChange={e => set(k, e.target.value)}>
      {opts}
    </select>
  )

  function validate(s) {
    const req  = REQUIRED[s] || []
    const errs = {}
    req.forEach(k => { if (!provForm[k]) errs[k] = 'Required' })
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function next() {
    if (!validate(step)) return
    const i = STEPS.findIndex(s => s.id === step)
    setCompleted(c => [...new Set([...c, step])])
    if (i < STEPS.length - 1) setStep(STEPS[i + 1].id)
  }

  function prev() {
    const i = STEPS.findIndex(s => s.id === step)
    if (i > 0) setStep(STEPS[i - 1].id)
  }

  const isEdit   = !!editingId?.provider
  const isFirst  = step === 'basic'
  const isReview = step === 'review'

  // ── STEP CONTENT ────────────────────────────────────────────────────────────
  function renderStep() {
    switch (step) {

      // ── STEP 1: NPI LOOKUP + BASIC INFO ────────────────────────────────────
      case 'basic':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* NPI Lookup — first on the page */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(30,86,240,.06) 0%, rgba(30,86,240,.02) 100%)',
              border: '1.5px solid rgba(30,86,240,.2)',
              borderRadius: 'var(--r-lg)',
              padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: npiExpanded ? 14 : 0, cursor: 'pointer' }}
                onClick={() => setNpiExpanded(e => !e)}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--pr)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--pr)' }}>NPI Registry Lookup</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Search by NPI number or provider name — auto-fills the form</div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: npiExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
              {npiExpanded && (
                <NpiLookupPanel
                  npiInput={npiInput} setNpiInput={setNpiInput}
                  npiResult={npiResult} setNpiResult={setNpiResult}
                  npiLoading={npiLoading} lookupNPI={lookupNPI}
                  setProvForm={setProvForm}
                />
              )}
              {npiResult && !npiExpanded && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '8px 10px', background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.2)', borderRadius: 'var(--r)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--success)' }}>Auto-filled from NPI Registry</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4 }}>NPI {npiResult.npi}</span>
                </div>
              )}
            </div>

            {/* Basic info fields */}
            <FG cols={2}>
              <Divider label="Identity" />
              <Field label="First Name" required error={errors.fname}>
                {inp('fname', 'Jane')}
              </Field>
              <Field label="Last Name" required error={errors.lname}>
                {inp('lname', 'Smith')}
              </Field>
              <Field label="Credential / License Type">
                {sel('cred', <>
                  <option value="">— Select —</option>
                  <option value="LCSW">LCSW</option>
                  <option value="LPC">LPC</option>
                  <option value="LMFT">LMFT</option>
                  <option value="MFT Associate">MFT Associate</option>
                  <option value="LCSW Associate">LCSW Associate</option>
                  <option value="Licensed Psychologist">Licensed Psychologist (PhD/PsyD)</option>
                  <option value="PMHNP">PMHNP</option>
                  <option value="Naturopathic Physician">Naturopathic Physician (ND)</option>
                  <option value="Chiropractor">Chiropractor (DC)</option>
                  <option value="Acupuncturist">Acupuncturist (LAc)</option>
                  <option value="LMT">LMT</option>
                  <option value="MD">MD</option>
                  <option value="DO">DO</option>
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
              <Field label="Status">
                {sel('status', <>
                  <option>Active</option>
                  <option>Pending</option>
                  <option>Inactive</option>
                </>)}
              </Field>

              <Divider label="Contact" />
              <Field label="Email">{inp('email', 'provider@clinic.com', 'email')}</Field>
              <Field label="Phone">{inp('phone', '(503) 000-0000', 'tel')}</Field>
              <Field label="Clinical Focus" full>
                {inp('focus', 'Trauma, EMDR, Anxiety, CBT…')}
              </Field>
            </FG>
          </div>
        )

      // ── STEP 2: CREDENTIALS ─────────────────────────────────────────────────
      case 'credentials':
        return (
          <FG cols={2}>
            <Divider label="National Identifiers" />
            <Field label="NPI Number" hint="10-digit Type 1 NPI">
              {inp('npi', '1234567890', 'text', { maxLength: 10 })}
            </Field>
            <Field label="Taxonomy Code" hint="From NPPES">
              {inp('taxonomyCode', '101YM0800X')}
            </Field>

            <Divider label="State License" />
            <Field label="License Number">
              {inp('license', 'C12345')}
            </Field>
            <Field label="Expiration Date" required error={errors.licenseExp}>
              {inp('licenseExp', '', 'date')}
            </Field>

            <Divider label="CAQH" />
            <Field label="CAQH ID">{inp('caqh', '12345678')}</Field>
            <Field label="Last Attestation Date">{inp('caqhAttest', '', 'date')}</Field>
            <Field label="Next Attestation Due" hint="Every 120 days">
              {inp('caqhDue', '', 'date')}
            </Field>

            <Divider label="Government Programs" />
            <Field label="Medicaid / DMAP ID">{inp('medicaid', 'OR1234567')}</Field>
            <Field label="Medicare PTAN">{inp('ptan', 'If applicable')}</Field>
            <Field label="DEA Registration #">{inp('dea', 'AB1234567')}</Field>
            <Field label="DEA Expiration">{inp('deaExp', '', 'date')}</Field>
          </FG>
        )

      // ── STEP 3: INSURANCE ───────────────────────────────────────────────────
      case 'insurance':
        return (
          <FG cols={2}>
            <Divider label="Malpractice Insurance" />
            <Field label="Carrier">{inp('malCarrier', 'HPSO, CPH&A…')}</Field>
            <Field label="Policy Number">{inp('malPolicy', 'POL-123456')}</Field>
            <Field label="Expiration Date">{inp('malExp', '', 'date')}</Field>

            <Divider label="Recredentialing" />
            <Field label="Recredentialing Due">{inp('recred', '', 'date')}</Field>

            <Divider label="Supervision (Associates Only)" />
            <Field label="Supervising Provider">{inp('supervisor', 'Name of supervisor')}</Field>
            <Field label="Supervision Expiration">{inp('supExp', '', 'date')}</Field>

            {f('spec') === 'Mental Health' && (
              <>
                <Divider label="Psychology Today Profile" />
                <Field label="Profile URL" full>
                  {inp('ptUrl', 'https://www.psychologytoday.com/us/therapists/…', 'url')}
                </Field>
                <Field label="Listing Status">
                  <select value={f('ptStatus') || 'None'} onChange={e => set('ptStatus', e.target.value)}>
                    <option value="None">No Listing</option>
                    <option value="Active">Active Listing</option>
                    <option value="Inactive">Inactive / Paused</option>
                  </select>
                </Field>
                <Field label="Monthly Fee?">
                  <select value={f('ptMonthlyFee') ? 'true' : 'false'} onChange={e => set('ptMonthlyFee', e.target.value === 'true')}>
                    <option value="false">No</option>
                    <option value="true">Yes ($29.95/mo)</option>
                  </select>
                </Field>
              </>
            )}

            <Field label="Notes" full>
              <textarea value={f('notes')} onChange={e => set('notes', e.target.value)}
                placeholder="Internal notes, onboarding status, special instructions…"
                rows={3} style={{ resize: 'vertical', fontFamily: 'inherit' }} />
            </Field>
          </FG>
        )

      // ── STEP 4: REVIEW ──────────────────────────────────────────────────────
      case 'review':
        return (
          <div>
            {/* Provider identity card */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: 'var(--elevated)', border: '1.5px solid var(--border)',
              borderRadius: 'var(--r-lg)', padding: '14px 16px', marginBottom: 18,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: 'var(--pr)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 15, fontWeight: 800, color: '#fff',
              }}>
                {(f('fname')[0] || '?').toUpperCase()}{(f('lname')[0] || '').toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>
                  {f('fname') || '—'} {f('lname')}{f('cred') ? `, ${f('cred')}` : ''}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {f('spec')}{f('status') ? ` · ${f('status')}` : ''}
                  {f('npi') ? ` · NPI ${f('npi')}` : ''}
                </div>
              </div>
            </div>

            <RR label="Email"        value={f('email')}      onEdit={setStep} step="basic" />
            <RR label="Phone"        value={f('phone')}      onEdit={setStep} step="basic" />
            <RR label="Focus"        value={f('focus')}      onEdit={setStep} step="basic" />
            <RR label="NPI"          value={f('npi')}        onEdit={setStep} step="credentials" />
            <RR label="License #"    value={f('license')}    onEdit={setStep} step="credentials" />
            <RR label="License Exp"  value={f('licenseExp')} onEdit={setStep} step="credentials" />
            <RR label="CAQH ID"      value={f('caqh')}       onEdit={setStep} step="credentials" />
            <RR label="CAQH Due"     value={f('caqhDue')}    onEdit={setStep} step="credentials" />
            <RR label="Medicaid ID"  value={f('medicaid')}   onEdit={setStep} step="credentials" />
            <RR label="DEA #"        value={f('dea')}        onEdit={setStep} step="credentials" />
            <RR label="Mal. Carrier" value={f('malCarrier')} onEdit={setStep} step="insurance" />
            <RR label="Mal. Exp"     value={f('malExp')}     onEdit={setStep} step="insurance" />
            <RR label="Supervisor"   value={f('supervisor')} onEdit={setStep} step="insurance" />
            <RR label="Recred Due"   value={f('recred')}     onEdit={setStep} step="insurance" />

            {!f('npi') && (
              <div style={{ marginTop: 14, padding: '9px 12px', background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 'var(--r)', fontSize: 12, color: '#92400E' }}>
                ⚠ NPI is missing. Most payers require NPI for enrollment.
              </div>
            )}
            {!f('licenseExp') && (
              <div style={{ marginTop: 8, padding: '9px 12px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--danger)' }}>
                ✕ License expiration date is required.
              </div>
            )}
          </div>
        )
    }
  }

  // ── DRAWER SHELL ─────────────────────────────────────────────────────────────
  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(13,27,61,.35)',
        backdropFilter: 'blur(2px)', zIndex: 200, transition: 'opacity .2s',
      }} />

      {/* Drawer panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 580, background: 'var(--card)',
        boxShadow: '-12px 0 48px rgba(0,0,0,.18)',
        zIndex: 201, display: 'flex', flexDirection: 'column',
        animation: 'slideInRight .22s cubic-bezier(.16,1,.3,1)',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px 24px', borderBottom: '1.5px solid var(--border)',
          flexShrink: 0, background: 'var(--card)',
        }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--pr)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: 0, letterSpacing: '-.02em' }}>
              {isEdit ? `Edit Provider` : 'Add New Provider'}
            </h2>
            <p style={{ fontSize: 11.5, color: 'var(--text-4)', margin: 0, marginTop: 1 }}>
              {isEdit ? `Updating ${f('fname')} ${f('lname')}` : 'Start with NPI lookup to auto-fill the form'}
            </p>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 'var(--r)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--elevated)', border: '1.5px solid var(--border)',
            cursor: 'pointer', color: 'var(--text-3)',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Step progress */}
        <StepProgress step={step} completed={completed} />

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {renderStep()}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 24px', borderTop: '1.5px solid var(--border)',
          background: 'var(--elevated)', flexShrink: 0,
        }}>
          <div>
            {isEdit && editingId?.provider && (
              <button className="btn btn-sm" onClick={() => handleDeleteProvider(editingId.provider)}
                style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,.3)' }}>
                Delete Provider
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => isFirst ? onClose() : prev()}>
              {isFirst ? 'Cancel' : '← Back'}
            </button>
            {!isReview && (
              <button className="btn btn-primary btn-sm" onClick={next}>
                Continue →
              </button>
            )}
            {isReview && (
              <button className="btn btn-primary btn-sm"
                onClick={handleSaveProvider}
                disabled={saving || !f('licenseExp')}>
                {saving
                  ? <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} /> Saving…</>
                  : isEdit ? '✓ Save Changes' : '✓ Add Provider'
                }
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default AddProviderDrawer
