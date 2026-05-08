import { NpiLookupPanel } from './NpiLookupPanel.jsx'
import { SPEC_COLORS } from '../../constants/stages.js'
import { useState } from 'react'

export function AddProvider({ db, provForm, setProvForm, editingId, setEditingId, npiInput, setNpiInput, npiResult, setNpiResult, npiLoading, lookupNPI, handleSaveProvider, handleDeleteProvider, handlePhotoUpload, handleDeletePhoto, photoUploading, setPage, saving }) {
  const f = (k) => provForm[k] || ''
  const set = (k, v) => setProvForm(prev => ({ ...prev, [k]: v }))
  const inp = (k, placeholder, type='text', opts={}) => <input type={type} value={f(k)} onChange={e=>set(k,e.target.value)} placeholder={placeholder} {...opts} />
  const sel = (k, children) => <select value={f(k)} onChange={e=>set(k,e.target.value)}>{children}</select>
  return <div className="page">
    <div className="card" style={{ maxWidth:760 }}>
      <div className="card-header">
        <h3>{editingId.provider ? 'Edit Provider' : 'New Provider'}</h3>
        <div className="ch-meta">{editingId.provider ? `${f('fname')} ${f('lname')}` : 'Fill in provider details below'}</div>
      </div>
      <div className="card-body">
        {/* ── PHOTO UPLOAD ── */}
        <div className="photo-upload-wrap">
          <div className="photo-preview">
            {provForm.avatarUrl
              ? <img src={provForm.avatarUrl} alt="Provider photo" onError={e=>{e.target.style.display='none'}} />
              : <span>{((provForm.fname||'?')[0]||'')}{((provForm.lname||'')[0]||'')}</span>
            }
          </div>
          <div className="photo-actions">
            <div className="photo-label">Provider Photo</div>
            <div className="photo-sub">JPG, PNG or WebP · Max 5MB · Stored in Supabase Storage</div>
            <div className="photo-btns">
              <label className="btn btn-primary btn-sm" style={{cursor:'pointer'}}>
                {photoUploading ? <><span className="spinner"></span> Uploading…</> : '📷 Upload Photo'}
                <input className="photo-upload-input" type="file" accept="image/jpeg,image/png,image/webp"
                  disabled={photoUploading}
                  onChange={e => { if(e.target.files[0]) handlePhotoUpload(e.target.files[0], editingId.provider) }}
                />
              </label>
              {provForm.avatarUrl && (
                <button className="btn btn-danger btn-sm" onClick={()=>handleDeletePhoto(editingId.provider)}>Remove</button>
              )}
              {!editingId.provider && (
                <span style={{fontSize:11,color:'var(--ink-4)',alignSelf:'center'}}>Save provider first to enable photo upload</span>
              )}
            </div>
          </div>
        </div>

        <NpiLookupPanel
          npiInput={npiInput}
          setNpiInput={setNpiInput}
          npiResult={npiResult}
          setNpiResult={setNpiResult}
          npiLoading={npiLoading}
          lookupNPI={lookupNPI}
          setProvForm={setProvForm}
        />
        <div className="form-grid">
          <div className="section-divider">Personal Information</div>
          <div className="fg"><label>First Name *</label>{inp('fname','Jane')}</div>
          <div className="fg"><label>Last Name *</label>{inp('lname','Smith')}</div>
          <div className="fg"><label>Credential / License Type</label>{sel('cred',<>
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
          </>)}</div>
          <div className="fg"><label>Specialty Category</label>{sel('spec',<>
            <option>Mental Health</option><option>Massage Therapy</option><option>Naturopathic</option><option>Chiropractic</option><option>Acupuncture</option>
          </>)}</div>
          <div className="fg"><label>Provider Status</label>{sel('status',<><option>Active</option><option>Pending</option><option>Inactive</option></>)}</div>
          <div className="fg"><label>Email</label>{inp('email','provider@pis.com','email')}</div>
          <div className="fg"><label>Phone</label>{inp('phone','(503) 000-0000','tel')}</div>
          <div className="fg full"><label>Specialty Focus</label>{inp('focus','Trauma, EMDR, Anxiety…')}</div>

          <div className="section-divider">Identification Numbers</div>
          <div className="fg"><label>NPI Number</label>{inp('npi','1234567890','text',{maxLength:10})}</div>
          <div className="fg"><label>CAQH ID</label>{inp('caqh','12345678')}</div>
          <div className="fg"><label>CAQH Attestation Date</label>{inp('caqhAttest','','date')}</div>
          <div className="fg"><label>Next CAQH Attestation Due</label>{inp('caqhDue','','date')}</div>
          <div className="fg"><label>Medicaid / DMAP ID</label>{inp('medicaid','OR1234567')}</div>
          <div className="fg"><label>Medicare PTAN</label>{inp('ptan','If applicable')}</div>
          <div className="fg"><label>State License Number</label>{inp('license','C12345')}</div>
          <div className="fg"><label>License Expiration *</label>{inp('licenseExp','','date')}</div>

          <div className="section-divider">Insurance & Malpractice</div>
          <div className="fg"><label>Malpractice Carrier</label>{inp('malCarrier','HPSO, CPH&A…')}</div>
          <div className="fg"><label>Malpractice Policy #</label>{inp('malPolicy','POL-123456')}</div>
          <div className="fg"><label>Malpractice Expiration *</label>{inp('malExp','','date')}</div>
          <div className="fg"><label>DEA Registration #</label>{inp('dea','AB1234567')}</div>
          <div className="fg"><label>DEA Expiration</label>{inp('deaExp','','date')}</div>
          <div className="fg"><label>Recredentialing Due Date</label>{inp('recred','','date')}</div>

          <div className="section-divider">Supervision (Associates Only)</div>
          <div className="fg"><label>Supervising Provider</label>{inp('supervisor','Name of supervisor')}</div>
          <div className="fg"><label>Supervision Expiration</label>{inp('supExp','','date')}</div>

          {provForm.spec === 'Mental Health' && <>
          <div className="section-divider">Psychology Today Profile <span style={{fontSize:10,fontWeight:500,marginLeft:8,color:'var(--purple)',background:'var(--purple-l)',border:'1px solid var(--purple-b)',padding:'2px 7px',borderRadius:20}}>Mental Health Only</span></div>
          <div className="fg"><label>PT Profile URL</label><input type="url" value={f('ptUrl')} onChange={e=>set('ptUrl',e.target.value)} placeholder="https://www.psychologytoday.com/us/therapists/…" /></div>
          <div className="fg"><label>PT Listing Status</label>
            <select value={f('ptStatus')||'None'} onChange={e=>set('ptStatus',e.target.value)}>
              <option value="None">No Listing</option>
              <option value="Active">Active Listing</option>
              <option value="Inactive">Inactive / Paused</option>
            </select>
          </div>
          <div className="fg"><label>Paying Monthly Fee ($29.95/mo)?</label>
            <select value={f('ptMonthlyFee')?'true':'false'} onChange={e=>set('ptMonthlyFee',e.target.value==='true')}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </div>
          <div className="fg"><label>PT Notes</label><input type="text" value={f('ptNotes')} onChange={e=>set('ptNotes',e.target.value)} placeholder="Profile views, referrals, notes…" /></div>
          </>}

          <div className="section-divider">Notes</div>
          <div className="fg full"><label>Internal Notes</label><textarea value={f('notes')} onChange={e=>set('notes',e.target.value)} placeholder="Any relevant credentialing notes…"></textarea></div>
        </div>
        <div style={{ display:'flex', gap:8, marginTop:12 }}>
          <button className="btn btn-primary" onClick={handleSaveProvider} disabled={saving}>{saving?'Saving…':'Save Provider'}</button>
          <button className="btn btn-secondary" onClick={()=>setPage('providers')}>Cancel</button>
          {editingId.provider && <button className="btn btn-danger" style={{ marginLeft:'auto' }} onClick={()=>handleDeleteProvider(editingId.provider)} disabled={saving}>Delete Provider</button>}
        </div>
      </div>
    </div>
  </div>
}

// ─── ENROLLMENTS ───────────────────────────────────────────────────────────────
