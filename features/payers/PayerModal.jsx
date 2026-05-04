import { useState } from 'react'
import { Modal } from '../../components/ui/Modal.jsx'
import { PAYER_CATALOG } from '../../constants/payerRequirements.js'

export function PayerModal({ payerForm, setPayerForm, editingId, handleSavePayer, onClose, saving }) {
  const [step, setStep] = useState(editingId.payer ? 2 : 1)
  const [pickerSearch, setPickerSearch] = useState('')
  const [selectedCatalog, setSelectedCatalog] = useState(null)
  const f = k => payerForm[k] ?? ''
  const set = (k, v) => setPayerForm(prev => ({ ...prev, [k]: v }))

  function pickPayer(catalog) {
    setSelectedCatalog(catalog)
    setPayerForm({
      name: catalog.name,
      payerId: catalog.payerId,
      type: catalog.type,
      phone: catalog.phone,
      portal: catalog.portal,
      timeline: catalog.timeline,
      notes: catalog.notes,
      email: '',
    })
    setStep(2)
  }

  function pickCustom() {
    setSelectedCatalog(null)
    setPayerForm({ type:'Commercial', timeline:'60–90 days' })
    setStep(2)
  }

  const filteredCatalog = PAYER_CATALOG.filter(p =>
    p.name.toLowerCase().includes(pickerSearch.toLowerCase()) ||
    p.type.toLowerCase().includes(pickerSearch.toLowerCase())
  )

  const guidelines = selectedCatalog || (editingId.payer ? PAYER_CATALOG.find(p => p.name === payerForm.name) : null)

  return (
    <DrawerModal title={editingId.payer ? 'Edit Payer' : (step === 1 ? 'Add Payer — Choose Payer' : 'Add Payer — Details')} onClose={onClose}
      footer={
        step === 1
          ? <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          : <>
              {!editingId.payer && <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>}
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSavePayer} disabled={saving}>{saving ? 'Saving…' : 'Save Payer'}</button>
            </>
      }>

      {step === 1 && (
        <>
          {!editingId.payer && (
            <div className="modal-step-indicator" style={{ marginBottom:16 }}>
              <div className="msi-step active"><div className="msi-num">1</div><span>Choose Payer</span></div>
              <div className="msi-line" />
              <div className="msi-step"><div className="msi-num">2</div><span>Review & Save</span></div>
            </div>
          )}
          <div style={{ marginBottom:12 }}>
            <div className="search-box" style={{ marginBottom:12 }}>
              <span className="si">🔍</span>
              <input type="text" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
                placeholder="Search payers…" style={{ width:'100%' }} autoFocus />
            </div>
          </div>
          <div className="payer-picker-grid">
            {filteredCatalog.map(p => (
              <button key={p.name} className="payer-pick-btn" onClick={() => pickPayer(p)}>
                <div className="payer-pick-dot" style={{ background: p.color }} />
                <div>
                  <div className="payer-pick-name">{p.name}</div>
                  <div className="payer-pick-type">{p.type} · {p.timeline}</div>
                </div>
              </button>
            ))}
            <button className="payer-pick-custom" onClick={pickCustom}>
              <div style={{ fontSize:18, opacity:.5 }}>＋</div>
              <div>
                <div className="payer-pick-name" style={{ color:'var(--ink-3)' }}>Custom / Unlisted</div>
                <div className="payer-pick-type">Enter details manually</div>
              </div>
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          {!editingId.payer && (
            <div className="modal-step-indicator">
              <div className="msi-step done"><div className="msi-num">✓</div><span>Choose Payer</span></div>
              <div className="msi-line done" />
              <div className="msi-step active"><div className="msi-num">2</div><span>Review & Save</span></div>
            </div>
          )}

          {guidelines && (
            <div className="guideline-box">
              <div className="guideline-box-title">📋 Credentialing Guidelines — {guidelines.name}</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2px 16px', marginBottom: guidelines.warn ? 8 : 0 }}>
                {guidelines.guidelines.map((g, i) => (
                  <div key={i} className="guideline-item">{g}</div>
                ))}
              </div>
              {guidelines.warn && <div className="guideline-warn">⚡ {guidelines.warn}</div>}
            </div>
          )}

          <div className="form-grid">
            <div className="fg full"><label>Payer Name *</label>
              <input type="text" value={f('name')} onChange={e => set('name', e.target.value)} placeholder="Payer name" />
            </div>
            <div className="fg"><label>Payer ID / EDI ID</label>
              <input type="text" value={f('payerId')} onChange={e => set('payerId', e.target.value)} placeholder="60054" />
            </div>
            <div className="fg"><label>Type</label>
              <select value={f('type')} onChange={e => set('type', e.target.value)}>
                <option>Commercial</option><option>Medicaid</option><option>Medicare</option>
                <option>Medicare Advantage</option><option>EAP</option><option>Other</option>
              </select>
            </div>
            <div className="fg"><label>Provider Relations Phone</label>
              <input type="tel" value={f('phone')} onChange={e => set('phone', e.target.value)} />
            </div>
            <div className="fg"><label>Credentialing Email</label>
              <input type="email" value={f('email')} onChange={e => set('email', e.target.value)} />
            </div>
            <div className="fg"><label>Provider Portal URL</label>
              <input type="text" value={f('portal')} onChange={e => set('portal', e.target.value)} placeholder="https://…" />
            </div>
            <div className="fg"><label>Avg. Credentialing Timeline</label>
              <select value={f('timeline')} onChange={e => set('timeline', e.target.value)}>
                <option>30–45 days</option><option>45–60 days</option><option>60–90 days</option>
                <option>90–120 days</option><option>120+ days</option>
              </select>
            </div>
            <div className="fg full"><label>Notes</label>
              <textarea value={f('notes')} onChange={e => set('notes', e.target.value)} placeholder="Submission requirements, contacts, special instructions…" />
            </div>
          </div>
        </>
      )}
    </DrawerModal>
  )
}

export { PayerModal }
