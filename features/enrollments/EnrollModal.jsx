import { useState, useEffect } from 'react'
import { pNameShort, payName } from '../../lib/helpers.js'
import { Modal, DrawerModal } from '../../components/ui/Modal.jsx'
import { STAGES } from '../../constants/stages.js'
import { PayerChecklist } from './PayerChecklist.jsx'
import { PRODUCT_LINES, STATES, ASSOCIATE_MODES } from '../../constants/enrollmentOptions.js'
import { fetchEntities, fetchContracts } from '../../lib/db'
import { ContactLog } from './ContactLog.jsx'
import { PAYER_CATALOG } from '../../constants/payerRequirements.js'
import { DateInput } from '../../components/ui/DateInput.jsx'
import { suggestFollowup, needsFollowup } from '../../constants/followupCadence.js'
import { fmtDate } from '../../lib/helpers.js'
import { todayStr } from '../../lib/matrix.js'
import { DATE_SOURCES } from '../../constants/enrollmentOptions.js'

export function EnrollModal({ db, enrollForm, setEnrollForm, editingId, handleSaveEnrollment, onClose, saving, onAddPayer }) {
  const f = k => enrollForm[k] ?? ''
  const set = (k, v) => setEnrollForm(prev => ({ ...prev, [k]: v }))
  const [showMore, setShowMore] = useState(!!editingId.enrollment)   // new enrollments start short; the rest is one tap away
  const stageIdx = STAGES.indexOf(f('stage'))
  const [autoFollowup, setAutoFollowup] = useState(null)   // { days } when the follow-up date was filled in for the chosen stage

  // Changing the stage suggests a follow-up date (only when there is none, or it is already past).
  function changeStage(stage) {
    const sug = suggestFollowup(stage)
    setEnrollForm(prev => (sug && needsFollowup(prev.followup))
      ? { ...prev, stage, followup: sug.date }
      : { ...prev, stage })
    setAutoFollowup(sug && needsFollowup(enrollForm.followup) ? { days: sug.days } : null)
  }

  // ── Inline validation state ───────────────────────────────────────────────
  const [touched, setTouched] = useState({ provId: false, payId: false })
  const provInvalid = touched.provId && !f('provId')
  const payInvalid  = touched.payId  && !f('payId')
  const [npiBad, setNpiBad] = useState(false)

  function handleSaveWithValidation() {
    setTouched({ provId: true, payId: true })
    if (!f('provId') || !f('payId')) return
    if (level === 'Group' && f('groupNpi') && !/^\d{10}$/.test(f('groupNpi'))) { setNpiBad(true); return }
    handleSaveEnrollment()
  }

  // ── Payer auto-suggest (Feature 5) ───────────────────────────────────────
  const [payerHints, setPayerHints] = useState([])
  const [showHints, setShowHints]   = useState(true)
  const selectedPayerId = f('payId')
  // New enrollment with a payer that asks for CAQH: start as "provider still needs to authorize" (only if not chosen yet).
  useEffect(() => {
    if (editingId.enrollment || f('caqhStatus')) return
    if (payerHints.some(h => /caqh/i.test(h))) set('caqhStatus', 'needed')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payerHints])

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

  const selPayer = db.payers.find(p => p.id === f('payId'))
  const selProv  = db.providers.find(p => p.id === f('provId'))
  const payerModel = selPayer?.enrollmentModel || 'Individual + Group'
  const groupAllowed = payerModel !== 'Individual only'
  const groupForced  = payerModel === 'Group only'
  const level = groupForced ? 'Group' : (!groupAllowed ? 'Individual' : (f('level') || 'Individual'))
  const duplicate = f('provId') && f('payId') && db.enrollments.some(x =>
    x.id !== editingId.enrollment && x.provId === f('provId') && x.payId === f('payId') && (x.level || 'Individual') === level)
  const groupNames = [...new Set(db.enrollments.map(x => x.groupName).filter(Boolean))]

  // Keep the stored level in step with what the payer's enrollment model allows.
  useEffect(() => {
    if ((enrollForm.level || 'Individual') !== level) setEnrollForm(prev => ({ ...prev, level }))
  }, [level, enrollForm.level, setEnrollForm])

  // Optional link to a legal entity (group) and its payer contract (needs migration 013; falls back silently).
  const [entities, setEntities] = useState([])
  const [entContracts, setEntContracts] = useState([])
  useEffect(() => {
    if (level !== 'Group' || entities.length) return
    let live = true
    fetchEntities().then(l => live && setEntities(l)).catch(() => {})
    return () => { live = false }
  }, [level, entities.length])
  const selEntity = entities.find(e => e.id === f('entityId'))
  useEffect(() => {
    if (!selEntity) { setEntContracts([]); return }
    let live = true
    fetchContracts(selEntity.id).then(l => live && setEntContracts(l)).catch(() => {})
    return () => { live = false }
  }, [selEntity])
  const payerContracts = entContracts.filter(c => c.payerId === f('payId'))
  function pickEntity(id) {
    const ent = entities.find(e => e.id === id)
    setEnrollForm(prev => ({ ...prev, entityId: id, contractId: '', groupName: ent ? ent.name : prev.groupName, groupNpi: ent ? ent.type2Npi : prev.groupNpi }))
  }
  function pickContract(id) {
    const c = entContracts.find(x => x.id === id)
    setEnrollForm(prev => ({
      ...prev, contractId: id,
      state: prev.state || c?.state || '', productLine: prev.productLine || c?.productLine || '',
      contractEffective: prev.contractEffective || c?.contractEffective || '',
    }))
  }
  const coaConflict = f('associateMode') === 'Roster under group' && selEntity?.holdsCoa
  const medicaidAssociate = !!selProv?.supervisor && (f('productLine') === 'Medicaid' || selPayer?.type === 'Medicaid')

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
      <div className="workflow-steps" tabIndex={0} role="group" aria-label="Enrollment stages">
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
          <PayerChecklist
            title={`Required for ${db.payers.find(p => p.id === selectedPayerId)?.name}`}
            guidelines={payerHints}
            provider={db.providers.find(p => p.id === f('provId'))}
            documents={db.documents}
            enrollmentId={editingId.enrollment}
            onDismiss={() => setShowHints(false)}
          />
          <div>
            {catalogWarn && (
              <div style={{ marginTop: 10, padding: '6px 10px', background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 'var(--r)', fontSize: 11.5, color: 'var(--warning)', fontWeight: 500, lineHeight: 1.4 }}>
                ⚠ {catalogWarn}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="fg"><label>Enrollment Type</label>
        <select value={level} disabled={!groupAllowed || groupForced} onChange={e => set('level', e.target.value)}>
          <option value="Individual">Individual (Type 1 NPI)</option>
          {groupAllowed && <option value="Group">Group (Type 2 NPI / billing group)</option>}
        </select>
        {selPayer && payerModel !== 'Individual + Group' && (
          <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>{selPayer.name} is set to “{payerModel}”.</div>
        )}
      </div>
      {level === 'Group' && entities.length > 0 && <>
        <div className="fg"><label>Group</label>
          <select value={f('entityId')} onChange={e => pickEntity(e.target.value)}><option value="">— Select group —</option>{entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
          {selEntity && <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>{selEntity.type2Npi ? `Type 2 NPI ${selEntity.type2Npi}` : 'No Type 2 NPI on this group yet'}</div>}
        </div>
        <div className="fg"><label>Payer Contract</label>
          <select value={f('contractId')} disabled={!selEntity} onChange={e => pickContract(e.target.value)}>
            <option value="">{payerContracts.length ? '— Select contract —' : 'No contract for this payer'}</option>
            {payerContracts.map(c => <option key={c.id} value={c.id}>{[c.state, c.productLine, c.contractNo].filter(Boolean).join(' · ') || 'Contract'}</option>)}
          </select>
        </div>
      </>}
      {level === 'Group' && entities.length === 0 && (<>
        <div className="fg"><label>Group Name</label>
          <input list="group-names" value={f('groupName')} onChange={e => set('groupName', e.target.value)} placeholder="e.g. Positive Inner Self, LLC" />
          <datalist id="group-names">{groupNames.map(n => <option key={n} value={n} />)}</datalist>
        </div>
        <div className="fg"><label>Group NPI</label><input value={f('groupNpi')} placeholder="Type 2 NPI" inputMode="numeric" maxLength={10} onChange={e => { setNpiBad(false); set('groupNpi', e.target.value.replace(/\D/g, '')) }} style={npiBad ? { border: '1.5px solid var(--danger)' } : undefined} />
          {npiBad && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>Group NPI must be 10 digits</div>}
        </div>
      </>)}
      {duplicate && (
        <div className="fg full" style={{ fontSize: 12, color: 'var(--amber)', background: 'rgba(180,83,9,.08)', border: '1px solid rgba(180,83,9,.25)', borderRadius: 'var(--r)', padding: '6px 10px' }}>
          This provider already has a {level.toLowerCase()} enrollment with this payer. Edit that one, or change the type if this is a separate group enrollment.
        </div>
      )}
      <div className="fg"><label>Stage</label><select value={f('stage')} onChange={e => changeStage(e.target.value)}>{STAGES.map(s => <option key={s}>{s}</option>)}</select></div>
      <div className="fg"><label>Date Submitted</label><DateInput  value={f('submitted')} onChange={e => set('submitted', e.target.value)} /></div>
      <div className="fg"><label>CAQH authorization for this payer</label>
        <select value={f('caqhStatus')} onChange={e => set('caqhStatus', e.target.value)}>
          <option value="">Not set yet</option>
          <option value="needed">Provider still needs to authorize this payer</option>
          <option value="authorized">Authorized in CAQH</option>
          <option value="none">Not needed for this payer</option>
        </select>
        <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>In CAQH, each provider must authorize each payer before the payer can read their profile. “Still needs to” shows up on Today and in the provider’s portal.</div>
      </div>
      <div className="fg"><label>Follow-up Date</label><DateInput  value={f('followup')} onChange={e => { set('followup', e.target.value); setAutoFollowup(null) }} />
        {autoFollowup && <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 3 }}>Suggested for this stage: {autoFollowup.days} days from today ({fmtDate(f('followup'))}). Change it if you like.</div>}</div>
      <div className="fg full"><label>Notes / Audit Entry</label><textarea value={f('notes')} onChange={e => set('notes', e.target.value)} placeholder="Add a note (logged to audit trail)…"></textarea></div>
      <div className="fg full">
        <button type="button" className="x-link" aria-expanded={showMore} onClick={() => setShowMore(m => !m)}>
          {showMore ? 'Hide extra details ▲' : 'More details: effective dates, state, IDs, EFT/ERA ▼'}
        </button>
      </div>
      {showMore && <>
      <div className="fg"><label>Effective Date (overall)</label><DateInput  value={f('effective')} onChange={e => set('effective', e.target.value)} /></div>
      <div className="fg"><label>Credentialing Effective</label><DateInput  value={f('credentialingEffective')} onChange={e => set('credentialingEffective', e.target.value)} /></div>
      <div className="fg"><label>Contract Effective</label><DateInput  value={f('contractEffective')} onChange={e => set('contractEffective', e.target.value)} /></div>
      <div className="fg"><label>Billable From</label><DateInput  value={f('billableFrom')} onChange={e => set('billableFrom', e.target.value)} />
        <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>First date claims will be paid. Many payers do not backdate.</div>
      </div>
      {level === 'Group' && <div className="fg"><label>Roster / Link Effective</label><DateInput  value={f('rosterEffective')} onChange={e => set('rosterEffective', e.target.value)} /></div>}
      <div className="fg"><label>Termination Date</label><DateInput  value={f('termDate')} onChange={e => set('termDate', e.target.value)} /></div>
      <div className="fg"><label>Where these dates came from</label>
        <select value={f('datesSource')} onChange={e => setEnrollForm(prev => ({ ...prev, datesSource: e.target.value, datesVerified: e.target.value && !prev.datesVerified ? todayStr() : prev.datesVerified }))}>
          <option value="">— Not recorded —</option>{DATE_SOURCES.map(s => <option key={s}>{s}</option>)}
        </select>
        <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>Payers sometimes change dates later. Recording the source makes disputes easy to settle.</div>
      </div>
      <div className="fg"><label>Dates last confirmed</label><DateInput value={f('datesVerified')} onChange={e => set('datesVerified', e.target.value)} /></div>
      <div className="fg"><label>State</label>
        <select value={f('state')} onChange={e => set('state', e.target.value)}><option value="">—</option>{STATES.map(s => <option key={s}>{s}</option>)}</select>
      </div>
      <div className="fg"><label>Product Line</label>
        <select value={f('productLine')} onChange={e => set('productLine', e.target.value)}><option value="">—</option>{PRODUCT_LINES.map(s => <option key={s}>{s}</option>)}</select>
      </div>
      <div className="fg"><label>Payer Provider ID / Contract #</label><input value={f('payerProviderId')} onChange={e => set('payerProviderId', e.target.value)} placeholder="Assigned by payer" /></div>
      {selProv?.supervisor && (
        <div className="fg full"><label>Associate Billing Mode ({selProv.fname} is supervised)</label>
          <select value={f('associateMode') || 'Unverified'} onChange={e => set('associateMode', e.target.value)}>{ASSOCIATE_MODES.map(m => <option key={m}>{m}</option>)}</select>
          {coaConflict && <div style={{ fontSize: 11.5, color: 'var(--amber)', marginTop: 6 }}>This group holds an Oregon COA. Moda’s associate roster program is not available to COA holders; confirm with Moda.</div>}
          {medicaidAssociate && <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 6 }}>Supervised provider on a Medicaid enrollment. Associates do not see Medicaid patients here, and OHA is restricting associate enrollment. Confirm before submitting.</div>}
          <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>How this payer handles pre-licensed clinicians. Keep “Unverified” until confirmed in writing with the payer.</div>
        </div>
      )}
      <div className="fg"><label>Recredentialing Due</label><DateInput  value={f('recred')} onChange={e => set('recred', e.target.value)} /></div>
      <div className="fg"><label>EFT Status</label><select value={f('eft')} onChange={e => set('eft', e.target.value)}><option>Not Set Up</option><option>Submitted</option><option>Active</option></select></div>
      <div className="fg"><label>ERA Status</label><select value={f('era')} onChange={e => set('era', e.target.value)}><option>Not Set Up</option><option>Submitted</option><option>Active</option></select></div>
      <div className="fg"><label>Contract Received</label><select value={f('contract')} onChange={e => set('contract', e.target.value)}><option value="No">No</option><option value="Yes">Yes</option></select></div>
      </>}
    </div>

    {editingId.enrollment && (
      <ContactLog enrollmentId={editingId.enrollment} onFollowupSet={d => set('followup', d)} />
    )}
  </DrawerModal>
}
