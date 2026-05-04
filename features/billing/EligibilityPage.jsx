import { useState } from 'react'
import { daysUntil, fmtDate, pName, payName } from '../../lib/helpers.js'
import { Badge } from '../../components/ui/Badge.jsx'
import { Modal } from '../../components/ui/Modal.jsx'

function EligibilityPage({ db, toast }) {
  const { providers, payers, eligibilityChecks: initChecks = [] } = db
  const [checks, setChecks] = useState(initChecks)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [verifying, setVerifying] = useState(false)

  useEffect(() => { setChecks(db.eligibilityChecks || []) }, [db.eligibilityChecks])

  function openAdd() { setForm({ status:'Pending', appt_date: new Date().toISOString().split('T')[0] }); setModal(true) }
  function openEdit(c) { setForm({...c}); setModal(true) }

  async function handleVerify() {
    if (!form.member_id || !form.payer_id) { toast('Member ID and payer required to verify.','error'); return }
    setVerifying(true)
    try {
      const res = await fetch('/api/eligibility', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ memberId: form.member_id, payerId: form.payer_id, dob: form.dob, provId: form.prov_id })
      })
      const data = await res.json()
      if (data.error) { toast(data.error,'error'); setVerifying(false); return }
      setForm(f => ({ ...f, status: data.status||'Eligible', copay: data.copay, deductible: data.deductible, deductible_met: data.deductible_met, oop_max: data.oop_max, oop_met: data.oop_met, plan_name: data.plan_name, group_num: data.group_num, raw_response: data.raw }))
      toast('Eligibility verified!','success')
    } catch(e) { toast('Availity API error: '+e.message,'error') }
    setVerifying(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const saved = await upsertEligibilityCheck(form)
      setChecks(prev => {
        const idx = prev.findIndex(x => x.id === saved.id)
        return idx >= 0 ? prev.map(x => x.id===saved.id?saved:x) : [saved,...prev]
      })
      toast('Saved!','success')
      setModal(false)
    } catch(e) { toast(e.message,'error') }
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this eligibility check?')) return
    try { await deleteEligibilityCheck(id); setChecks(c => c.filter(x => x.id!==id)); toast('Deleted.','warn') }
    catch(e) { toast(e.message,'error') }
  }

  const filtered = checks.filter(c => {
    const q = search.toLowerCase()
    const matchQ = !q || c.patient_name?.toLowerCase().includes(q) || c.member_id?.toLowerCase().includes(q)
    const matchS = !fStatus || c.status === fStatus
    return matchQ && matchS
  })

  const statusColor = { Eligible:'b-green', Ineligible:'b-red', Pending:'b-amber', Error:'b-gray' }

  return (
    <div className="page">
      <div className="kpi-grid">
        {[['Total Checks', checks.length, ''],
          ['Eligible', checks.filter(c=>c.status==='Eligible').length, 'kpi-teal'],
          ['Ineligible', checks.filter(c=>c.status==='Ineligible').length, 'kpi-red'],
          ['Pending', checks.filter(c=>c.status==='Pending').length, 'kpi-amber'],
        ].map(([label, val, cls]) => (
          <div key={label} className={`kpi ${cls}`}>
            <div className="kpi-label">{label}</div>
            <div className="kpi-value">{val}</div>
          </div>
        ))}
      </div>

      <div style={{background:'var(--blue-l)',border:'1px solid var(--blue-b)',borderRadius:'var(--r-lg)',padding:'13px 16px',marginBottom:16,fontSize:13,color:'var(--blue)'}}>
        <strong>ℹ️ Availity Integration:</strong> Real-time verification requires an Availity provider account (free). Configure your Availity API credentials in Settings, or log checks manually here. SimplePractice data must be entered manually.
      </div>

      <div className="toolbar">
        <div className="search-box"><span className="si">🔍</span><input placeholder="Search patient, member ID…" value={search} onChange={e=>setSearch(e.target.value)} /></div>
        <select className="filter-select" value={fStatus} onChange={e=>setFStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {['Eligible','Ineligible','Pending','Error'].map(s=><option key={s}>{s}</option>)}
        </select>
        <div className="toolbar-right">
          <button className="btn btn-primary btn-sm" onClick={openAdd}>＋ Add Check</button>
        </div>
      </div>

      <div className="tbl-wrap">
        <table>
          <thead><tr>
            <th className="no-sort">Patient</th>
            <th className="no-sort">Payer</th>
            <th className="no-sort">Provider</th>
            <th className="no-sort">Appt Date</th>
            <th className="no-sort">Member ID</th>
            <th className="no-sort">Status</th>
            <th className="no-sort">Copay</th>
            <th className="no-sort">Deductible</th>
            <th className="no-sort">Checked</th>
            <th className="no-sort">Actions</th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={10}><div className="empty-state"><div className="ei">🩺</div><h4>No eligibility checks yet</h4><p>Add a check or verify insurance before appointments</p></div></td></tr>}
            {filtered.map(c => (
              <tr key={c.id}>
                <td><div style={{fontWeight:600}}>{c.patient_name}</div><div style={{fontSize:11,color:'var(--ink-4)'}}>{c.dob ? fmtDate(c.dob) : ''}</div></td>
                <td style={{fontSize:12}}>{payName(payers, c.payer_id)}</td>
                <td style={{fontSize:12}}>{pNameShort(providers, c.prov_id)}</td>
                <td style={{fontSize:12}}>{c.appt_date ? fmtDate(c.appt_date) : '—'}</td>
                <td style={{fontSize:12,fontFamily:'monospace'}}>{c.member_id||'—'}</td>
                <td><span className={`badge ${statusColor[c.status]||'b-gray'}`}>{c.status||'Pending'}</span></td>
                <td style={{fontSize:12}}>{c.copay != null ? fmtMoney(c.copay) : '—'}</td>
                <td style={{fontSize:12}}>
                  {c.deductible != null ? <span>{fmtMoney(c.deductible_met||0)} / {fmtMoney(c.deductible)} met</span> : '—'}
                </td>
                <td style={{fontSize:11,color:'var(--ink-4)'}}>{c.checked_at ? new Date(c.checked_at).toLocaleDateString() : '—'}</td>
                <td>
                  <div style={{display:'flex',gap:5}}>
                    <button className="btn btn-secondary btn-sm" onClick={()=>openEdit(c)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={()=>handleDelete(c.id)}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <>
        <div className="drawer-overlay open" onClick={()=>setModal(false)} />
        <div className="drawer">
          <div className="drawer-header">
              <div><h3>{form.id?'Edit Eligibility Check':'New Eligibility Check'}</h3><div className="mh-sub">Verify patient insurance coverage before appointment</div></div>
              <button className="modal-close" onClick={()=>setModal(false)}>✕</button>
            </div>
            <div className="drawer-body">
              <div className="form-grid">
                <div className="fg full"><label>Patient Name *</label><input value={form.patient_name||''} onChange={e=>setForm(f=>({...f,patient_name:e.target.value}))} placeholder="Last, First" /></div>
                <div className="fg"><label>Date of Birth</label><input type="date" value={form.dob||''} onChange={e=>setForm(f=>({...f,dob:e.target.value}))} /></div>
                <div className="fg"><label>Appointment Date</label><input type="date" value={form.appt_date||''} onChange={e=>setForm(f=>({...f,appt_date:e.target.value}))} /></div>
                <div className="fg"><label>Payer</label>
                  <select value={form.payer_id||''} onChange={e=>setForm(f=>({...f,payer_id:e.target.value}))}>
                    <option value="">— Select Payer —</option>
                    {payers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="fg"><label>Provider</label>
                  <select value={form.prov_id||''} onChange={e=>setForm(f=>({...f,prov_id:e.target.value}))}>
                    <option value="">— Select Provider —</option>
                    {providers.map(p=><option key={p.id} value={p.id}>{p.fname} {p.lname}</option>)}
                  </select>
                </div>
                <div className="fg"><label>Member ID</label><input value={form.member_id||''} onChange={e=>setForm(f=>({...f,member_id:e.target.value}))} placeholder="Insurance member ID" /></div>
                <div className="fg"><label>Group Number</label><input value={form.group_num||''} onChange={e=>setForm(f=>({...f,group_num:e.target.value}))} /></div>
                <div className="fg"><label>Plan Name</label><input value={form.plan_name||''} onChange={e=>setForm(f=>({...f,plan_name:e.target.value}))} /></div>
                <div className="fg"><label>Coverage Type</label>
                  <select value={form.cov_type||''} onChange={e=>setForm(f=>({...f,cov_type:e.target.value}))}>
                    <option value="">—</option><option>Individual</option><option>Family</option>
                  </select>
                </div>
                <div className="fg"><label>Status</label>
                  <select value={form.status||'Pending'} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                    {['Pending','Eligible','Ineligible','Error'].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="section-divider">Financial Details (manual entry or from API)</div>
                <div className="fg"><label>Copay</label><input type="number" step="0.01" value={form.copay||''} onChange={e=>setForm(f=>({...f,copay:e.target.value}))} placeholder="0.00" /></div>
                <div className="fg"><label>Deductible</label><input type="number" step="0.01" value={form.deductible||''} onChange={e=>setForm(f=>({...f,deductible:e.target.value}))} placeholder="0.00" /></div>
                <div className="fg"><label>Deductible Met</label><input type="number" step="0.01" value={form.deductible_met||''} onChange={e=>setForm(f=>({...f,deductible_met:e.target.value}))} placeholder="0.00" /></div>
                <div className="fg"><label>OOP Max</label><input type="number" step="0.01" value={form.oop_max||''} onChange={e=>setForm(f=>({...f,oop_max:e.target.value}))} placeholder="0.00" /></div>
                <div className="fg"><label>OOP Met</label><input type="number" step="0.01" value={form.oop_met||''} onChange={e=>setForm(f=>({...f,oop_met:e.target.value}))} placeholder="0.00" /></div>
                <div className="fg full"><label>Notes</label><textarea value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2} /></div>
              </div>
              <div style={{marginTop:14,padding:'12px 14px',background:'var(--surface-2)',borderRadius:'var(--r-md)',border:'1px solid var(--border)',fontSize:12.5,color:'var(--ink-3)'}}>
                💡 <strong>Availity real-time verification:</strong> Enter member ID + payer, then click "Verify via Availity" to auto-fill eligibility data. Requires Availity API credentials in Settings.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setModal(false)}>Cancel</button>
              <button className="btn btn-ghost" onClick={handleVerify} disabled={verifying}>
                {verifying ? <><span className="spinner"/>Verifying…</> : '🔗 Verify via Availity'}
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <><span className="spinner"/>Saving…</> : 'Save'}
              </button>
            </div>
          </div>
          </>

      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLAIMS TRACKER PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export { EligibilityPage }
