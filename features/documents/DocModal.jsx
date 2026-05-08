import { Modal } from '../../components/ui/Modal.jsx'

export function DocModal({ db, docForm, setDocForm, editingId, handleSaveDocument, onClose, saving }) {
  const f = k => docForm[k] ?? ''
  const set = (k, v) => setDocForm(prev => ({ ...prev, [k]: v }))
  return <Modal title={editingId.doc?'Edit Document':'Add Document / Credential'} onClose={onClose}
    footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={handleSaveDocument} disabled={saving}>{saving?'Saving…':'Save Document'}</button></>}>
    <div className="form-grid">
      <div className="fg"><label>Provider *</label><select value={f('provId')} onChange={e=>set('provId',e.target.value)}><option value="">— Select Provider —</option>{db.providers.map(p=><option key={p.id} value={p.id}>{p.fname} {p.lname}</option>)}</select></div>
      <div className="fg"><label>Document Type *</label><select value={f('type')} onChange={e=>set('type',e.target.value)}><option>License</option><option>Malpractice</option><option>DEA</option><option>CAQH Attestation</option><option>Recredentialing</option><option>Supervision Agreement</option><option>NPI Letter</option><option>W-9</option><option>CV / Resume</option><option>Other</option></select></div>
      <div className="fg"><label>Issuer / Carrier</label><input type="text" value={f('issuer')} onChange={e=>set('issuer',e.target.value)} placeholder="OBRC, HPSO…" /></div>
      <div className="fg"><label>License / Policy Number</label><input type="text" value={f('number')} onChange={e=>set('number',e.target.value)} /></div>
      <div className="fg"><label>Issue Date</label><input type="date" value={f('issue')} onChange={e=>set('issue',e.target.value)} /></div>
      <div className="fg"><label>Expiration Date *</label><input type="date" value={f('exp')} onChange={e=>set('exp',e.target.value)} /></div>
      <div className="fg full"><label>Notes</label><textarea value={f('notes')} onChange={e=>set('notes',e.target.value)} style={{ minHeight:56 }}></textarea></div>
    </div>
  </Modal>
}
