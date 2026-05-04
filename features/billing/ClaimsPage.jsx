import { useState } from 'react'
import { daysUntil, fmtDate, pName, payName } from '../../lib/helpers.js'
import { Badge } from '../../components/ui/Badge.jsx'
import { Modal } from '../../components/ui/Modal.jsx'
import { AGING_BUCKETS, getAgingBucket } from '../../constants/rcm.js'

function ClaimsPage({ db, toast }) {
  const { providers, payers, claims: initClaims = [] } = db
  const [claims, setClaims] = useState(initClaims)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fProv, setFProv] = useState('')
  const [activeTab, setActiveTab] = useState('list')

  useEffect(() => { setClaims(db.claims || []) }, [db.claims])

  function openAdd() {
    setForm({ status:'Submitted', submitted_date: new Date().toISOString().split('T')[0] })
    setModal(true)
  }
  function openEdit(c) { setForm({...c, cpt_codes_str: (c.cpt_codes||[]).join(', '), diag_codes_str: (c.diagnosis_codes||[]).join(', ')}); setModal(true) }

  async function handleSave() {
    const obj = { ...form,
      cpt_codes: form.cpt_codes_str ? form.cpt_codes_str.split(',').map(s=>s.trim()).filter(Boolean) : [],
      diagnosis_codes: form.diag_codes_str ? form.diag_codes_str.split(',').map(s=>s.trim()).filter(Boolean) : [],
    }
    delete obj.cpt_codes_str; delete obj.diag_codes_str
    setSaving(true)
    try {
      const saved = await upsertClaim(obj)
      setClaims(prev => { const idx=prev.findIndex(x=>x.id===saved.id); return idx>=0?prev.map(x=>x.id===saved.id?saved:x):[saved,...prev] })
      toast('Claim saved!','success'); setModal(false)
    } catch(e) { toast(e.message,'error') }
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this claim?')) return
    try { await deleteClaim(id); setClaims(c=>c.filter(x=>x.id!==id)); toast('Deleted.','warn') }
    catch(e) { toast(e.message,'error') }
  }

  const filtered = claims.filter(c => {
    const q = search.toLowerCase()
    const matchQ = !q || c.patient_name?.toLowerCase().includes(q) || c.claim_num?.toLowerCase().includes(q)
    const matchS = !fStatus || c.status === fStatus
    const matchP = !fProv || c.prov_id === fProv
    return matchQ && matchS && matchP
  })

  // A/R Aging
  const aging = Object.fromEntries(AGING_BUCKETS.map(b=>[b,0]))
  const pendingClaims = claims.filter(c => !['Paid','Written Off'].includes(c.status))
  pendingClaims.forEach(c => {
    const bucket = getAgingBucket(c.submitted_date)
    aging[bucket] = (aging[bucket]||0) + (Number(c.billed_amount||0) - Number(c.paid_amount||0))
  })
  const totalAR = Object.values(aging).reduce((s,v)=>s+v,0)
  const totalBilled = claims.reduce((s,c)=>s+Number(c.billed_amount||0),0)
  const totalPaid = claims.reduce((s,c)=>s+Number(c.paid_amount||0),0)
  const totalDenied = claims.filter(c=>c.status==='Denied').reduce((s,c)=>s+Number(c.billed_amount||0),0)

  const statusColor = { Submitted:'b-blue', Pending:'b-amber', Paid:'b-green', Denied:'b-red', Partial:'b-teal', Appeal:'b-purple' }
  const agingColor = ['#16a34a','#d97706','#c97d1e','#dc2626','#7c3aed']

  return (
    <div className="page">
      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-label">Total Billed</div><div className="kpi-value" style={{fontSize:26}}>{fmtMoney(totalBilled)}</div></div>
        <div className="kpi kpi-teal"><div className="kpi-label">Total Paid</div><div className="kpi-value" style={{fontSize:26}}>{fmtMoney(totalPaid)}</div><div className="kpi-sub">{totalBilled>0?((totalPaid/totalBilled)*100).toFixed(1):0}% collection rate</div></div>
        <div className="kpi kpi-amber"><div className="kpi-label">Total A/R</div><div className="kpi-value" style={{fontSize:26}}>{fmtMoney(totalAR)}</div><div className="kpi-sub">{pendingClaims.length} open claims</div></div>
        <div className="kpi kpi-red"><div className="kpi-label">Denied</div><div className="kpi-value" style={{fontSize:26}}>{fmtMoney(totalDenied)}</div><div className="kpi-sub">{claims.filter(c=>c.status==='Denied').length} claims</div></div>
      </div>

      <div className="tabs">
        {[['list','📋 All Claims'],['aging','📊 A/R Aging']].map(([t,l])=>(
          <div key={t} className={`tab ${activeTab===t?'active':''}`} onClick={()=>setActiveTab(t)}>{l}</div>
        ))}
      </div>

      {activeTab === 'aging' && (
        <div className="card mb-20">
          <div className="card-header"><h3>A/R Aging Report</h3><span className="ch-meta">Unpaid balance by days outstanding</span></div>
          <div className="card-body">
            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:20}}>
              {AGING_BUCKETS.map((b,i) => (
                <div key={b} style={{textAlign:'center',padding:'16px 8px',borderRadius:'var(--r-lg)',background:'var(--surface-2)',border:'1px solid var(--border)'}}>
                  <div style={{fontSize:11,fontWeight:700,letterSpacing:.5,textTransform:'uppercase',color:'var(--ink-4)',marginBottom:6}}>{b} days</div>
                  <div style={{fontFamily:'Poppins,sans-serif',fontSize:22,color:agingColor[i],marginBottom:4}}>{fmtMoney(aging[b])}</div>
                  <div style={{fontSize:10,color:'var(--ink-4)'}}>{totalAR>0?((aging[b]/totalAR)*100).toFixed(0):0}% of A/R</div>
                </div>
              ))}
            </div>
            <div style={{background:'var(--surface-2)',borderRadius:'var(--r-md)',padding:'12px 16px'}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--ink-4)',marginBottom:8,textTransform:'uppercase',letterSpacing:.5}}>Visual Distribution</div>
              <div style={{display:'flex',height:20,borderRadius:6,overflow:'hidden',gap:2}}>
                {AGING_BUCKETS.map((b,i) => {
                  const pct = totalAR>0?(aging[b]/totalAR)*100:0
                  return pct>0 ? <div key={b} style={{width:`${pct}%`,background:agingColor[i],transition:'width .4s'}} title={`${b} days: ${fmtMoney(aging[b])}`}/> : null
                })}
              </div>
              <div style={{display:'flex',gap:16,marginTop:8,flexWrap:'wrap'}}>
                {AGING_BUCKETS.map((b,i) => (
                  <div key={b} style={{display:'flex',alignItems:'center',gap:5,fontSize:11}}>
                    <div style={{width:8,height:8,borderRadius:2,background:agingColor[i],flexShrink:0}}/>
                    <span style={{color:'var(--ink-3)'}}>{b} days</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'list' && <>
        <div className="toolbar">
          <div className="search-box"><span className="si">🔍</span><input placeholder="Search patient, claim #…" value={search} onChange={e=>setSearch(e.target.value)} /></div>
          <select className="filter-select" value={fStatus} onChange={e=>setFStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {['Submitted','Pending','Paid','Denied','Partial','Appeal'].map(s=><option key={s}>{s}</option>)}
          </select>
          <select className="filter-select" value={fProv} onChange={e=>setFProv(e.target.value)}>
            <option value="">All Providers</option>
            {providers.map(p=><option key={p.id} value={p.id}>{p.fname} {p.lname}</option>)}
          </select>
          <div className="toolbar-right"><button className="btn btn-primary btn-sm" onClick={openAdd}>＋ Add Claim</button></div>
        </div>
        <div style={{marginBottom:12,fontSize:12,color:'var(--ink-4)',padding:'8px 12px',background:'var(--amber-l)',border:'1px solid var(--amber-b)',borderRadius:'var(--r-md)'}}>
          💡 <strong>SimplePractice users:</strong> Export claims from SP → Reports → Billing, then enter manually here. A CSV import tool is planned for a future update.
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th className="no-sort">Claim #</th>
              <th className="no-sort">Patient</th>
              <th className="no-sort">DOS</th>
              <th className="no-sort">Provider</th>
              <th className="no-sort">Payer</th>
              <th className="no-sort">CPT</th>
              <th className="no-sort">Billed</th>
              <th className="no-sort">Paid</th>
              <th className="no-sort">Status</th>
              <th className="no-sort">Aging</th>
              <th className="no-sort">Actions</th>
            </tr></thead>
            <tbody>
              {filtered.length===0 && <tr><td colSpan={11}><div className="empty-state"><div className="ei">📋</div><h4>No claims yet</h4><p>Add claims manually or import from your clearinghouse</p></div></td></tr>}
              {filtered.map(c => {
                const bucket = getAgingBucket(c.submitted_date)
                const agingCls = bucket==='120+'?'b-red':bucket==='91–120'?'b-red':bucket==='61–90'?'b-amber':bucket==='31–60'?'b-amber':'b-green'
                return (
                  <tr key={c.id}>
                    <td style={{fontFamily:'monospace',fontSize:11}}>{c.claim_num||'—'}</td>
                    <td><div style={{fontWeight:600,fontSize:13}}>{c.patient_name}</div><div style={{fontSize:11,color:'var(--ink-4)'}}>{c.dob?fmtDate(c.dob):''}</div></td>
                    <td style={{fontSize:12}}>{c.dos?fmtDate(c.dos):'—'}</td>
                    <td style={{fontSize:12}}>{pNameShort(providers,c.prov_id)}</td>
                    <td style={{fontSize:12}}>{payName(payers,c.payer_id)}</td>
                    <td style={{fontSize:11,fontFamily:'monospace'}}>{(c.cpt_codes||[]).join(', ')||'—'}</td>
                    <td style={{fontSize:12,fontWeight:500}}>{fmtMoney(c.billed_amount)}</td>
                    <td style={{fontSize:12,color:'var(--green)'}}>{c.paid_amount?fmtMoney(c.paid_amount):'—'}</td>
                    <td><span className={`badge ${statusColor[c.status]||'b-gray'}`}>{c.status}</span></td>
                    <td>{!['Paid','Written Off'].includes(c.status) ? <span className={`badge ${agingCls}`}>{bucket}</span> : <span style={{fontSize:11,color:'var(--ink-4)'}}>—</span>}</td>
                    <td><div style={{display:'flex',gap:5}}><button className="btn btn-secondary btn-sm" onClick={()=>openEdit(c)}>Edit</button><button className="btn btn-danger btn-sm" onClick={()=>handleDelete(c.id)}>✕</button></div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </>}

      {modal && (
        <>
        <div className="drawer-overlay open" onClick={()=>setModal(false)} />
        <div className="drawer">
          <div className="drawer-header">
              <div><h3>{form.id?'Edit Claim':'New Claim'}</h3><div className="mh-sub">Log a claim from SimplePractice or your clearinghouse</div></div>
              <button className="modal-close" onClick={()=>setModal(false)}>✕</button>
            </div>
            <div className="drawer-body">
              <div className="form-grid">
                <div className="fg"><label>Claim Number</label><input value={form.claim_num||''} onChange={e=>setForm(f=>({...f,claim_num:e.target.value}))} placeholder="Clearinghouse claim #" /></div>
                <div className="fg"><label>Status</label>
                  <select value={form.status||'Submitted'} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                    {['Submitted','Pending','Paid','Denied','Partial','Appeal'].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="fg full"><label>Patient Name *</label><input value={form.patient_name||''} onChange={e=>setForm(f=>({...f,patient_name:e.target.value}))} /></div>
                <div className="fg"><label>Date of Birth</label><input type="date" value={form.dob||''} onChange={e=>setForm(f=>({...f,dob:e.target.value}))} /></div>
                <div className="fg"><label>Date of Service *</label><input type="date" value={form.dos||''} onChange={e=>setForm(f=>({...f,dos:e.target.value}))} /></div>
                <div className="fg"><label>Provider</label>
                  <select value={form.prov_id||''} onChange={e=>setForm(f=>({...f,prov_id:e.target.value}))}>
                    <option value="">— Select —</option>
                    {providers.map(p=><option key={p.id} value={p.id}>{p.fname} {p.lname}</option>)}
                  </select>
                </div>
                <div className="fg"><label>Payer</label>
                  <select value={form.payer_id||''} onChange={e=>setForm(f=>({...f,payer_id:e.target.value}))}>
                    <option value="">— Select —</option>
                    {payers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="fg"><label>CPT Codes (comma-separated)</label><input value={form.cpt_codes_str||''} onChange={e=>setForm(f=>({...f,cpt_codes_str:e.target.value}))} placeholder="90837, 90846" /></div>
                <div className="fg"><label>Diagnosis Codes (comma-separated)</label><input value={form.diag_codes_str||''} onChange={e=>setForm(f=>({...f,diag_codes_str:e.target.value}))} placeholder="F41.1, Z63.0" /></div>
                <div className="section-divider">Financials</div>
                <div className="fg"><label>Billed Amount</label><input type="number" step="0.01" value={form.billed_amount||''} onChange={e=>setForm(f=>({...f,billed_amount:e.target.value}))} placeholder="0.00" /></div>
                <div className="fg"><label>Allowed Amount</label><input type="number" step="0.01" value={form.allowed_amount||''} onChange={e=>setForm(f=>({...f,allowed_amount:e.target.value}))} /></div>
                <div className="fg"><label>Paid Amount</label><input type="number" step="0.01" value={form.paid_amount||''} onChange={e=>setForm(f=>({...f,paid_amount:e.target.value}))} /></div>
                <div className="fg"><label>Patient Responsibility</label><input type="number" step="0.01" value={form.patient_resp||''} onChange={e=>setForm(f=>({...f,patient_resp:e.target.value}))} /></div>
                <div className="fg"><label>Submitted Date</label><input type="date" value={form.submitted_date||''} onChange={e=>setForm(f=>({...f,submitted_date:e.target.value}))} /></div>
                <div className="fg"><label>Paid Date</label><input type="date" value={form.paid_date||''} onChange={e=>setForm(f=>({...f,paid_date:e.target.value}))} /></div>
                <div className="fg"><label>Clearinghouse</label><input value={form.clearinghouse||''} onChange={e=>setForm(f=>({...f,clearinghouse:e.target.value}))} placeholder="Availity, Office Ally…" /></div>
                <div className="fg"><label>ERA Received</label>
                  <select value={form.era_received?'yes':'no'} onChange={e=>setForm(f=>({...f,era_received:e.target.value==='yes'}))}>
                    <option value="no">No</option><option value="yes">Yes</option>
                  </select>
                </div>
                <div className="fg full"><label>Notes</label><textarea value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2} /></div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?<><span className="spinner"/>Saving…</>:'Save Claim'}</button>
            </div>
          </div>
          </>

      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// DENIAL LOG PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export { ClaimsPage }
