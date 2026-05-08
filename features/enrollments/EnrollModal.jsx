import { pNameShort, payName } from '../../lib/helpers.js'
import { Modal, DrawerModal } from '../../components/ui/Modal.jsx'
import { STAGES } from '../../constants/stages.js'

export function EnrollModal({ db, enrollForm, setEnrollForm, editingId, handleSaveEnrollment, onClose, saving }) {
  const f = k => enrollForm[k] ?? ''
  const set = (k, v) => setEnrollForm(prev => ({ ...prev, [k]: v }))
  const stageIdx = STAGES.indexOf(f('stage'))
  return <DrawerModal title={editingId.enrollment?'Edit Enrollment':'New Payer Enrollment'} sub={editingId.enrollment?`${pNameShort(db.providers,f('provId'))} × ${payName(db.payers,f('payId'))}`:''}
    onClose={onClose}
    footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={handleSaveEnrollment} disabled={saving}>{saving?'Saving…':'Save Enrollment'}</button></>}>
    <div className="mb-16">
      <div className="text-xs text-muted mb-8" style={{ fontWeight:600, letterSpacing:'.6px', textTransform:'uppercase' }}>Enrollment Stage</div>
      <div className="workflow-steps">
        {STAGES.filter(s=>s!=='Denied').map((s,i)=>(
          <div key={s} className={`ws ${stageIdx>i?'done':stageIdx===i?'active':''}`}>
            <div className="ws-dot">{stageIdx>i?'✓':i+1}</div>
            <div className="ws-label">{s.split('–')[0].trim()}</div>
          </div>
        ))}
      </div>
    </div>
    <div className="form-grid">
      <div className="fg"><label>Provider *</label><select value={f('provId')} onChange={e=>set('provId',e.target.value)}><option value="">— Select —</option>{db.providers.map(p=><option key={p.id} value={p.id}>{p.fname} {p.lname}, {p.cred}</option>)}</select></div>
      <div className="fg"><label>Payer *</label><select value={f('payId')} onChange={e=>set('payId',e.target.value)}><option value="">— Select —</option>{db.payers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div className="fg"><label>Stage</label><select value={f('stage')} onChange={e=>set('stage',e.target.value)}>{STAGES.map(s=><option key={s}>{s}</option>)}</select></div>
      <div className="fg"><label>Date Submitted</label><input type="date" value={f('submitted')} onChange={e=>set('submitted',e.target.value)} /></div>
      <div className="fg"><label>Effective Date</label><input type="date" value={f('effective')} onChange={e=>set('effective',e.target.value)} /></div>
      <div className="fg"><label>Recredentialing Due</label><input type="date" value={f('recred')} onChange={e=>set('recred',e.target.value)} /></div>
      <div className="fg"><label>EFT Status</label><select value={f('eft')} onChange={e=>set('eft',e.target.value)}><option>Not Set Up</option><option>Submitted</option><option>Active</option></select></div>
      <div className="fg"><label>ERA Status</label><select value={f('era')} onChange={e=>set('era',e.target.value)}><option>Not Set Up</option><option>Submitted</option><option>Active</option></select></div>
      <div className="fg"><label>Follow-up Date</label><input type="date" value={f('followup')} onChange={e=>set('followup',e.target.value)} /></div>
      <div className="fg"><label>Contract Received</label><select value={f('contract')} onChange={e=>set('contract',e.target.value)}><option value="No">No</option><option value="Yes">Yes</option></select></div>
      <div className="fg full"><label>Notes / Audit Entry</label><textarea value={f('notes')} onChange={e=>set('notes',e.target.value)} placeholder="Add a note (logged to audit trail)…"></textarea></div>
    </div>
  </DrawerModal>
}
