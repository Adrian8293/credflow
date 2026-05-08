import { useState, useEffect } from 'react'
import { daysUntil, fmtDate, pName, payName } from '../../lib/helpers.js'
import { Badge } from '../../components/ui/Badge.jsx'
import { Modal } from '../../components/ui/Modal.jsx'
import { DENIAL_CODES } from '../../constants/rcm.js'

export function DenialLog({ db, toast, requestConfirm }) {
  const { providers, payers, denials: initDenials = [], claims = [] } = db
  const [denials, setDenials] = useState(initDenials)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [fAppeal, setFAppeal] = useState('')
  const [fCat, setFCat] = useState('')

  useEffect(() => { setDenials(db.denials || []) }, [db.denials])

  function openAdd() { setForm({ appeal_status:'Not Started', denial_date: new Date().toISOString().split('T')[0] }); setModal(true) }
  function openEdit(d) { setForm({...d}); setModal(true) }

  // Auto-calc appeal deadline (90 days from denial) when denial date changes
  function handleDenialDateChange(val) {
    const deadline = new Date(val)
    deadline.setDate(deadline.getDate()+90)
    setForm(f=>({...f, denial_date:val, appeal_deadline: deadline.toISOString().split('T')[0]}))
  }

  function handleCodeSelect(code) {
    const found = DENIAL_CODES.find(d=>d.code===code)
    if (found) setForm(f=>({...f, reason_code:found.code, reason_desc:found.desc, category:found.cat}))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const saved = await upsertDenial(form)
      setDenials(prev=>{ const idx=prev.findIndex(x=>x.id===saved.id); return idx>=0?prev.map(x=>x.id===saved.id?saved:x):[saved,...prev] })
      toast('Denial logged!','success'); setModal(false)
    } catch(e) { toast(e.message,'error') }
    setSaving(false)
  }

  async function handleDelete(id) {
    if (requestConfirm && !(await requestConfirm({
      title: 'Delete Denial',
      body: 'This permanently removes the denial tracking record and any appeal notes stored with it.',
      confirmText: 'Delete denial',
      danger: true,
    }))) return
    try { await deleteDenial(id); setDenials(d=>d.filter(x=>x.id!==id)); toast('Deleted.','warn') }
    catch(e) { toast(e.message,'error') }
  }

  const filtered = denials.filter(d => {
    const q = search.toLowerCase()
    const claimPatient = d.claims?.patient_name||''
    const matchQ = !q || d.reason_code?.toLowerCase().includes(q) || claimPatient.toLowerCase().includes(q) || d.reason_desc?.toLowerCase().includes(q)
    const matchA = !fAppeal || d.appeal_status===fAppeal
    const matchC = !fCat || d.category===fCat
    return matchQ && matchA && matchC
  })

  // Stats
  const totalDenied = denials.length
  const won = denials.filter(d=>d.appeal_status==='Won').length
  const pending = denials.filter(d=>['Not Started','In Progress'].includes(d.appeal_status)).length
  const overdue = denials.filter(d=>d.appeal_deadline && daysUntil(d.appeal_deadline)!==null && daysUntil(d.appeal_deadline)<0 && !['Won','Lost','Written Off'].includes(d.appeal_status)).length

  const appealColor = { 'Not Started':'b-gray','In Progress':'b-blue','Won':'b-green','Lost':'b-red','Written Off':'b-amber' }
  const catColor = { 'Authorization':'b-purple','Coding':'b-blue','Eligibility':'b-teal','Timely Filing':'b-red','Coordination':'b-amber','Information':'b-gray','Patient Resp':'b-gold','Prior Payer':'b-gray' }

  // Denial by category breakdown
  const byCat = {}
  denials.forEach(d=>{ byCat[d.category||'Other']=(byCat[d.category||'Other']||0)+1 })

  return (
    <div className="page">
      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-label">Total Denials</div><div className="kpi-value">{totalDenied}</div></div>
        <div className="kpi kpi-red"><div className="kpi-label">Overdue Appeals</div><div className="kpi-value">{overdue}</div><div className="kpi-sub">Deadline passed</div></div>
        <div className="kpi kpi-amber"><div className="kpi-label">Pending Appeals</div><div className="kpi-value">{pending}</div></div>
        <div className="kpi kpi-teal"><div className="kpi-label">Appeals Won</div><div className="kpi-value">{won}</div><div className="kpi-sub">{totalDenied>0?((won/totalDenied)*100).toFixed(0):0}% win rate</div></div>
      </div>

      {overdue > 0 && (
        <div style={{background:'var(--red-l)',border:'1px solid var(--red-b)',borderRadius:'var(--r-lg)',padding:'12px 16px',marginBottom:16,fontSize:13,color:'var(--red)'}}>
          ⚠️ <strong>{overdue} appeal deadline{overdue>1?'s':''} overdue.</strong> Review and mark as Written Off or escalate immediately.
        </div>
      )}

      {Object.keys(byCat).length > 0 && (
        <div className="card mb-20">
          <div className="card-header"><h3>Denials by Category</h3></div>
          <div className="card-body">
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
              {Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([cat, count]) => (
                <div key={cat} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)'}}>
                  <span className={`badge ${catColor[cat]||'b-gray'}`} style={{fontSize:10}}>{cat}</span>
                  <span style={{fontFamily:'Poppins,sans-serif',fontSize:20,color:'var(--ink)'}}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="toolbar">
        <div className="search-box"><span className="si">🔍</span><input placeholder="Search code, patient, description…" value={search} onChange={e=>setSearch(e.target.value)} /></div>
        <select className="filter-select" value={fCat} onChange={e=>setFCat(e.target.value)}>
          <option value="">All Categories</option>
          {['Authorization','Coding','Eligibility','Timely Filing','Coordination','Information','Patient Resp','Prior Payer'].map(c=><option key={c}>{c}</option>)}
        </select>
        <select className="filter-select" value={fAppeal} onChange={e=>setFAppeal(e.target.value)}>
          <option value="">All Appeal Statuses</option>
          {['Not Started','In Progress','Won','Lost','Written Off'].map(s=><option key={s}>{s}</option>)}
        </select>
        <div className="toolbar-right"><button className="btn btn-primary btn-sm" onClick={openAdd}>＋ Log Denial</button></div>
      </div>

      <div className="tbl-wrap">
        <table>
          <thead><tr>
            <th className="no-sort">Patient / DOS</th>
            <th className="no-sort">Reason Code</th>
            <th className="no-sort">Category</th>
            <th className="no-sort">Denial Date</th>
            <th className="no-sort">Appeal Deadline</th>
            <th className="no-sort">Appeal Status</th>
            <th className="no-sort">Days Left</th>
            <th className="no-sort">Actions</th>
          </tr></thead>
          <tbody>
            {filtered.length===0 && <tr><td colSpan={8}><div className="empty-state"><div className="ei">🚫</div><h4>No denials logged</h4><p>Log a denial to track appeals and deadlines</p></div></td></tr>}
            {filtered.map(d => {
              const dl = daysUntil(d.appeal_deadline)
              const deadlineClass = dl===null?'b-gray':dl<0?'b-red':dl<=14?'b-red':dl<=30?'b-amber':'b-green'
              const isDone = ['Won','Lost','Written Off'].includes(d.appeal_status)
              return (
                <tr key={d.id} style={d.appeal_status==='Won'?{background:'#f0fdf4'}:overdue&&dl!==null&&dl<0&&!isDone?{background:'var(--red-l)'}:{}}>
                  <td>
                    <div style={{fontWeight:600}}>{d.claims?.patient_name||'—'}</div>
                    <div style={{fontSize:11,color:'var(--ink-4)'}}>{d.claims?.dos?fmtDate(d.claims.dos):''}</div>
                  </td>
                  <td>
                    <span style={{fontFamily:'monospace',fontSize:12,fontWeight:600,color:'var(--ink)'}}>{d.reason_code||'—'}</span>
                    <div style={{fontSize:11,color:'var(--ink-4)',marginTop:2,maxWidth:180}}>{d.reason_desc||''}</div>
                  </td>
                  <td>{d.category ? <span className={`badge ${catColor[d.category]||'b-gray'}`} style={{fontSize:10}}>{d.category}</span> : '—'}</td>
                  <td style={{fontSize:12}}>{d.denial_date?fmtDate(d.denial_date):'—'}</td>
                  <td style={{fontSize:12}}>{d.appeal_deadline?fmtDate(d.appeal_deadline):'—'}</td>
                  <td><span className={`badge ${appealColor[d.appeal_status]||'b-gray'}`}>{d.appeal_status||'Not Started'}</span></td>
                  <td>
                    {isDone ? <span style={{fontSize:11,color:'var(--ink-4)'}}>—</span>
                    : dl===null ? '—'
                    : <span className={`badge ${deadlineClass}`}>{dl<0?`${Math.abs(dl)}d overdue`:`${dl}d`}</span>}
                  </td>
                  <td><div style={{display:'flex',gap:5}}><button className="btn btn-secondary btn-sm" onClick={()=>openEdit(d)}>Edit</button><button className="btn btn-danger btn-sm" onClick={()=>handleDelete(d.id)}>✕</button></div></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <>
        <div className="drawer-overlay open" onClick={()=>setModal(false)} />
        <div className="drawer">
          <div className="drawer-header">
              <div><h3>{form.id?'Edit Denial':'Log Denial'}</h3><div className="mh-sub">Track denial reason, appeal status, and deadline</div></div>
              <button className="modal-close" onClick={()=>setModal(false)}>✕</button>
            </div>
            <div className="drawer-body">
              <div className="form-grid">
                <div className="fg"><label>Linked Claim (optional)</label>
                  <select value={form.claim_id||''} onChange={e=>setForm(f=>({...f,claim_id:e.target.value}))}>
                    <option value="">— Unlinked —</option>
                    {claims.map(c=><option key={c.id} value={c.id}>{c.patient_name} — {c.dos?fmtDate(c.dos):''} (#{c.claim_num||'no #'})</option>)}
                  </select>
                </div>
                <div className="fg"><label>Denial Date *</label><input type="date" value={form.denial_date||''} onChange={e=>handleDenialDateChange(e.target.value)} /></div>
                <div className="fg"><label>Reason Code</label>
                  <select value={form.reason_code||''} onChange={e=>handleCodeSelect(e.target.value)}>
                    <option value="">— Select code —</option>
                    {DENIAL_CODES.map(d=><option key={d.code} value={d.code}>{d.code} — {d.desc}</option>)}
                    <option value="OTHER">Other (enter manually)</option>
                  </select>
                </div>
                <div className="fg"><label>Category</label>
                  <select value={form.category||''} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                    <option value="">—</option>
                    {['Authorization','Coding','Eligibility','Timely Filing','Coordination','Information','Patient Resp','Prior Payer','Other'].map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="fg full"><label>Reason Description</label><input value={form.reason_desc||''} onChange={e=>setForm(f=>({...f,reason_desc:e.target.value}))} placeholder="Description of denial reason" /></div>
                <div className="fg"><label>Appeal Deadline</label><input type="date" value={form.appeal_deadline||''} onChange={e=>setForm(f=>({...f,appeal_deadline:e.target.value}))} /></div>
                <div className="fg"><label>Appeal Status</label>
                  <select value={form.appeal_status||'Not Started'} onChange={e=>setForm(f=>({...f,appeal_status:e.target.value}))}>
                    {['Not Started','In Progress','Won','Lost','Written Off'].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="fg full"><label>Appeal Notes</label><textarea value={form.appeal_notes||''} onChange={e=>setForm(f=>({...f,appeal_notes:e.target.value}))} rows={3} placeholder="Document steps taken, attachments sent, contacts made…" /></div>
              </div>
              <div style={{marginTop:14}}>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:.5,textTransform:'uppercase',color:'var(--ink-4)',marginBottom:8}}>Common Denial Codes Reference</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                  {DENIAL_CODES.map(d=>(
                    <button key={d.code} className="btn btn-ghost btn-sm" style={{fontFamily:'monospace',fontSize:11}} onClick={()=>handleCodeSelect(d.code)} title={d.desc}>{d.code}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?<><span className="spinner"/>Saving…</>:'Save'}</button>
            </div>
          </div>
          </>

      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// REVENUE ANALYTICS PAGE
// ═══════════════════════════════════════════════════════════════════════════════
