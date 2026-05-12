import { useState, useEffect } from 'react'
import { pNameShort, payName } from '../../lib/helpers.js'
import { Modal, DrawerModal } from '../../components/ui/Modal.jsx'
import { STAGES } from '../../constants/stages.js'
import { PAYER_CATALOG } from '../../constants/payerRequirements.js'

export function EnrollModal({ db, enrollForm, setEnrollForm, editingId, handleSaveEnrollment, onClose, saving, onAddPayer }) {
  const f = k => enrollForm[k] ?? ''
  const set = (k, v) => setEnrollForm(prev => ({ ...prev, [k]: v }))
  const stageIdx = STAGES.indexOf(f('stage'))

  // ── Inline validation state ───────────────────────────────────────────────
  const [touched, setTouched] = useState({ provId: false, payId: false })
  const provInvalid = touched.provId && !f('provId')
  const payInvalid  = touched.payId  && !f('payId')

  function handleSaveWithValidation() {
    setTouched({ provId: true, payId: true })
    if (!f('provId') || !f('payId')) return
    handleSaveEnrollment()
  }

  // ── Payer auto-suggest (Feature 5) ───────────────────────────────────────
  const [payerHints, setPayerHints] = useState([])
  const [showHints, setShowHints]   = useState(true)
  const selectedPayerId = f('payId')

  useEffect(() => {
    if (!selectedPayerId) { setPayerHints([]); return }
    const payer = db.payers.find(p => p.id === selectedPayerId)
    if (!payer) { setPayerHints([]); return }
    const catalog = PAYER_CATALOG.find(c => c.name.toLowerCase() === (payer.name || '').toLowerCase())
    if (catalog?.guidelines?.length) {
      setPayerHints(catalog.guidelines)
      setShowHints(true)   // MED-009: always reset on payer change so hints re-appear
    } else {
      setPayerHints([])
      setShowHints(true)   // reset so next payer with hints will show them
    }
  }, [selectedPayerId, db.payers])

  const catalogWarn = (() => {
    if (!selectedPayerId) return null
    const payer = db.payers.find(p => p.id === selectedPayerId)
    if (!payer) return null
    return PAYER_CATALOG.find(c => c.name.toLowerCase() === (payer.name || '').toLowerCase())?.warn || null
  })()

  const fieldStyle = (invalid) => ({
    border: invalid ? '1.5px solid var(--danger)' : undefined,
    borderRadius: 'var(--r)',
  })

  return <DrawerModal
    title={editingId.enrollment ? 'Edit Enrollment' : 'New Payer Enrollment'}
    sub={editingId.enrollment ? `${pNameShort(db.providers, f('provId'))} × ${payName(db.payers, f('payId'))}` : ''}
    onClose={onClose}
    footer={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSaveWithValidation} disabled={saving}>
          {saving ? 'Saving…' : 'Save Enrollment'}
        </button>
      </>
    }
  >
    <div className="mb-16">
      <div className="text-xs text-muted mb-8" style={{ fontWeight: 600, letterSpacing: '.6px', textTransform: 'uppercase' }}>Enrollment Stage</div>
      <div className="workflow-steps">
        {STAGES.filter(s => s !== 'Denied').map((s, i) => (
          <div key={s} className={`ws ${stageIdx > i ? 'done' : stageIdx === i ? 'active' : ''}`}>
            <div className="ws-dot">{stageIdx > i ? '✓' : i + 1}</div>
            <div className="ws-label">{s.split('–')[0].trim()}</div>
          </div>
        ))}
      </div>
    </div>

    <div className="form-grid">
      {/* Provider field with inline validation */}
      <div className="fg">
        <label style={{ color: provInvalid ? 'var(--danger)' : undefined }}>
          Provider <span style={{ color: 'var(--danger)' }}>*</span>
        </label>
        <select
          value={f('provId')}
          onChange={e => { set('provId', e.target.value); setTouched(t => ({ ...t, provId: true })) }}
          onBlur={() => setTouched(t => ({ ...t, provId: true }))}
          style={fieldStyle(provInvalid)}
        >
          <option value="">— Select Provider —</option>
          {db.providers.map(p => <option key={p.id} value={p.id}>{p.fname} {p.lname}, {p.cred}</option>)}
        </select>
        {provInvalid && (
          <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Provider is required
          </div>
        )}
      </div>

      {/* Payer field with inline validation + quick-add */}
      <div className="fg">
        <label style={{ color: payInvalid ? 'var(--danger)' : undefined }}>
          Payer <span style={{ color: 'var(--danger)' }}>*</span>
        </label>
        <div style={{ position: 'relative' }}>
          <select
            value={f('payId')}
            onChange={e => { set('payId', e.target.value); setTouched(t => ({ ...t, payId: true })) }}
            onBlur={() => setTouched(t => ({ ...t, payId: true }))}
            style={{ ...fieldStyle(payInvalid), width: '100%' }}
          >
            <option value="">— Select Payer —</option>
            {db.payers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {payInvalid && (
          <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Payer is required
          </div>
        )}
        {/* Quick-add payer link */}
        {onAddPayer && (
          <button
            onClick={onAddPayer}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 11.5, color: 'var(--pr)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontWeight: 500 }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add new payer
          </button>
        )}
      </div>

      {/* Payer requirements auto-suggest */}
      {payerHints.length > 0 && showHints && (
        <div className="fg full">
          <div style={{ background: 'rgba(30,86,240,.05)', border: '1.5px solid rgba(30,86,240,.18)', borderRadius: 'var(--r-lg)', padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--pr)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Required documents for {db.payers.find(p => p.id === selectedPayerId)?.name}
              </span>
              <button onClick={() => setShowHints(false)} style={{ fontSize: 11, color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer' }}>Dismiss ×</button>
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {payerHints.map((hint, i) => (
                <li key={i} style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <span style={{ color: 'var(--success)', flexShrink: 0, marginTop: 1 }}>•</span>
                  {hint}
                </li>
              ))}
            </ul>
            {catalogWarn && (
              <div style={{ marginTop: 10, padding: '6px 10px', background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 'var(--r)', fontSize: 11.5, color: 'var(--warning)', fontWeight: 500, lineHeight: 1.4 }}>
                ⚠ {catalogWarn}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="fg"><label>Stage</label><select value={f('stage')} onChange={e => set('stage', e.target.value)}>{STAGES.map(s => <option key={s}>{s}</option>)}</select></div>
      <div className="fg"><label>Date Submitted</label><input type="date" value={f('submitted')} onChange={e => set('submitted', e.target.value)} /></div>
      <div className="fg"><label>Effective Date</label><input type="date" value={f('effective')} onChange={e => set('effective', e.target.value)} /></div>
      <div className="fg"><label>Recredentialing Due</label><input type="date" value={f('recred')} onChange={e => set('recred', e.target.value)} /></div>
      <div className="fg"><label>EFT Status</label><select value={f('eft')} onChange={e => set('eft', e.target.value)}><option>Not Set Up</option><option>Submitted</option><option>Active</option></select></div>
      <div className="fg"><label>ERA Status</label><select value={f('era')} onChange={e => set('era', e.target.value)}><option>Not Set Up</option><option>Submitted</option><option>Active</option></select></div>
      <div className="fg"><label>Follow-up Date</label><input type="date" value={f('followup')} onChange={e => set('followup', e.target.value)} /></div>
      <div className="fg"><label>Contract Received</label><select value={f('contract')} onChange={e => set('contract', e.target.value)}><option value="No">No</option><option value="Yes">Yes</option></select></div>
      <div className="fg full"><label>Notes / Audit Entry</label><textarea value={f('notes')} onChange={e => set('notes', e.target.value)} placeholder="Add a note (logged to audit trail)…"></textarea></div>
    </div>
  </DrawerModal>
}
