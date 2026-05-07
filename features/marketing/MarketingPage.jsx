// MarketingPage — 3 sub-tabs: Psychology Today · Profile Directory · Optimization Tips
import { useState } from 'react'
import { PsychologyToday } from '../providers/PsychologyToday.jsx'

const TABS = [
  { id: 'pt',        label: 'Psychology Today' },
  { id: 'directory', label: 'Profile Directory' },
  { id: 'tips',      label: 'Optimization Tips' },
]

const PT_TIPS = [
  { icon: '📸', title: 'Add a professional photo', desc: 'Profiles with photos get significantly more clicks. Upload via the provider Edit page.' },
  { icon: '✍️', title: 'Write a personal bio', desc: 'Therapists who describe their approach and personality in first person convert better with potential clients.' },
  { icon: '🎥', title: 'Add a video introduction', desc: 'PT supports a short video intro. Even 60 seconds dramatically increases new client inquiries.' },
  { icon: '🏥', title: 'List all accepted insurances', desc: 'Many clients filter by insurance. Make sure every active payer enrollment is reflected on the PT profile.' },
  { icon: '🎯', title: 'Narrow your specialty focus', desc: '"Trauma and PTSD using EMDR" outperforms "anxiety and depression" in PT search rankings.' },
  { icon: '💬', title: 'Enable online booking', desc: 'Profiles with booking links convert at a higher rate. Consider linking your intake form directly.' },
  { icon: '🔄', title: 'Keep availability updated', desc: 'Profiles marked as accepting new clients rank higher in PT search results automatically.' },
  { icon: '⭐', title: 'Complete the entire profile', desc: 'PT favors complete profiles. Fill in every section including finances and statement.' },
  { icon: '🌐', title: 'List telehealth availability', desc: 'Telehealth-enabled listings receive significantly more views post-pandemic.' },
  { icon: '💳', title: 'Update insurance accepted', desc: 'Accurate insurance data drives organic referrals from PT search to your providers.' },
]

function ProfileDirectory({ db, editProvider }) {
  const mhProvs = db.providers.filter(p => p.spec === 'Mental Health')
  return (
    <div>
      <div className="tbl-wrap">
        <table>
          <thead><tr>
            <th className="no-sort">Provider</th>
            <th className="no-sort">Specialty</th>
            <th className="no-sort">PT Status</th>
            <th className="no-sort">Monthly Fee</th>
            <th className="no-sort">Profile URL</th>
            <th className="no-sort">Notes</th>
            <th className="no-sort">Actions</th>
          </tr></thead>
          <tbody>
            {!mhProvs.length ? (
              <tr><td colSpan={7}><div className="empty-state"><div className="ei">🧠</div><h4>No mental health providers</h4></div></td></tr>
            ) : mhProvs.map(p => {
              const ptStatus = p.ptStatus || 'None'
              const statusCls = ptStatus === 'Active' ? 'b-green' : ptStatus === 'Inactive' ? 'b-amber' : 'b-red'
              const ini = ((p.fname||'?')[0] + (p.lname||'')[0]).toUpperCase()
              return (
                <tr key={p.id}>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                      <div style={{ width:28, height:28, borderRadius:7, background:'var(--purple)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9.5, fontWeight:700, color:'#fff', flexShrink:0 }}>{ini}</div>
                      <div>
                        <div style={{ fontWeight:600, fontSize:12, color:'var(--text-1)' }}>{p.fname} {p.lname}{p.cred?`, ${p.cred}`:''}</div>
                        <div style={{ fontSize:10.5, color:'var(--text-3)' }}>{p.email||'—'}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="badge b-purple">{p.spec}</span></td>
                  <td><span className={`badge ${statusCls}`}>{ptStatus}</span></td>
                  <td style={{ fontFamily:'var(--fn-mono)', fontSize:11.5 }}>{p.ptMonthlyFee?`$${p.ptMonthlyFee}/mo`:ptStatus==='Active'?'$29.95/mo':'—'}</td>
                  <td>{p.ptProfileUrl?<a href={p.ptProfileUrl} target="_blank" rel="noreferrer" style={{ color:'var(--pr)', fontSize:11.5, fontWeight:600 }}>View Profile ↗</a>:<span style={{ color:'var(--text-3)', fontSize:11.5 }}>—</span>}</td>
                  <td style={{ fontSize:11.5, color:'var(--text-3)', maxWidth:140 }}>{p.notes?p.notes.slice(0,50):'—'}</td>
                  <td>
                    <div style={{ display:'flex', gap:5 }}>
                      <button className="btn btn-secondary btn-sm" onClick={()=>editProvider&&editProvider(p.id)}>Edit</button>
                      {ptStatus!=='Active'&&<button className="btn btn-primary btn-sm">+ Add PT</button>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function OptimizationTips() {
  const palettes = ['var(--pr-l)','var(--green-l)','var(--amber-l)','var(--purple-l)','var(--teal-l)','var(--red-l)','var(--elevated)','var(--gold-l)','var(--cyan-l)','var(--pr-l)']
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:10 }}>
      {PT_TIPS.map((tip, i) => (
        <div key={i} className="card" style={{ margin:0 }}>
          <div className="card-body" style={{ display:'flex', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:8, background:palettes[i%10], display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, flexShrink:0 }}>{tip.icon}</div>
            <div>
              <div style={{ fontWeight:700, fontSize:12.5, marginBottom:4, color:'var(--text-1)' }}>{tip.title}</div>
              <div style={{ fontSize:11.5, color:'var(--text-3)', lineHeight:1.55 }}>{tip.desc}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function MarketingPage({ db, setPage, editProvider }) {
  const [tab, setTab] = useState('pt')
  return (
    <div className="page">
      <div className="tabs">
        {TABS.map(t => (
          <div key={t.id} className={`tab${tab===t.id?' active':''}`} onClick={()=>setTab(t.id)}>{t.label}</div>
        ))}
      </div>
      {tab==='pt'        && <PsychologyToday db={db} setPage={setPage} editProvider={editProvider} />}
      {tab==='directory' && <ProfileDirectory db={db} editProvider={editProvider} />}
      {tab==='tips'      && <OptimizationTips />}
    </div>
  )
}

export default MarketingPage
