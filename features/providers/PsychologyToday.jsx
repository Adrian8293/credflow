import { useState } from 'react'
import { Badge } from '../../components/ui/Badge.jsx'
import { initials } from '../../lib/helpers.js'

export function PsychologyToday({ db, setPage, editProvider }) {
  const [activeTab, setActiveTab] = useState('overview')

  const mentalHealthProvs = db.providers.filter(p => p.spec === 'Mental Health' && p.status === 'Active')
  // PT is exclusively for mental health providers
  const listed = mentalHealthProvs.filter(p => p.ptStatus === 'Active')
  const inactive = mentalHealthProvs.filter(p => p.ptStatus === 'Inactive')
  const unlisted = mentalHealthProvs.filter(p => !p.ptStatus || p.ptStatus === 'None')
  const monthlySpend = listed.filter(p => p.ptMonthlyFee).length * 29.95

  const PT_TIPS = [
    { icon: '📸', title: 'Add a professional photo', desc: 'Profiles with photos get significantly more clicks. Upload via the provider Edit page.' },
    { icon: '✍️', title: 'Write a personal bio', desc: 'Therapists who describe their approach, personality, and ideal client in first person convert better.' },
    { icon: '🎥', title: 'Add a video introduction', desc: 'PT supports a short video. Even a 60-second intro dramatically increases inquiries.' },
    { icon: '🏥', title: 'List all accepted insurances', desc: 'Many clients filter by insurance. Make sure every active payer enrollment is reflected on the PT profile.' },
    { icon: '🎯', title: 'Narrow your specialty focus', desc: 'Specific is better than general. "Trauma and PTSD using EMDR" outperforms "anxiety and depression".' },
    { icon: '💬', title: 'Enable online booking', desc: 'Profiles with booking links convert at a higher rate. Consider linking your intake form.' },
    { icon: '🔄', title: 'Keep availability updated', desc: 'Profiles marked as accepting new clients rank higher in PT search results.' },
    { icon: '⭐', title: 'Complete the entire profile', desc: 'PT favors complete profiles in their algorithm. Fill in every section including finances and statement.' },
  ]

  return (
    <div className="page">
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',background:'var(--purple-l)',border:'1px solid var(--purple-b)',borderRadius:'var(--r-lg)',marginBottom:18}}>
        <span style={{fontSize:20}}>🧠</span>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:600,color:'#5b21b6'}}>Mental Health Providers — Marketing Tool</div>
          <div style={{fontSize:12,color:'var(--ink-3)',marginTop:2}}>Psychology Today directory management is exclusive to Mental Health specialty providers. Non-mental health providers are not tracked here.</div>
        </div>
        <span className="badge b-purple" style={{flexShrink:0}}>Mental Health Only</span>
      </div>
      <div className="lookup-tabs">
        {[['overview','📊 Overview'],['directory','📋 Profile Directory'],['tips','💡 Optimization Tips']].map(([k,l]) => (
          <div key={k} className={`lookup-tab ${activeTab===k?'active':''}`} onClick={()=>setActiveTab(k)}>{l}</div>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && (
        <div>
          <div className="kpi-grid" style={{marginBottom:20}}>
            <div className="kpi kpi-green">
              <div className="kpi-icon">✅</div>
              <div className="kpi-label">Active PT Listings</div>
              <div className="kpi-value">{listed.length}</div>
              <div className="kpi-sub">of {mentalHealthProvs.length} mental health providers</div>
            </div>
            <div className="kpi kpi-red">
              <div className="kpi-icon">⚠️</div>
              <div className="kpi-label">No PT Profile</div>
              <div className="kpi-value">{unlisted.length}</div>
              <div className="kpi-sub">Mental Health providers</div>
            </div>
            <div className="kpi kpi-amber">
              <div className="kpi-icon">⏸️</div>
              <div className="kpi-label">Inactive Listings</div>
              <div className="kpi-value">{inactive.length}</div>
              <div className="kpi-sub">Paused or deactivated</div>
            </div>
            <div className="kpi kpi-blue">
              <div className="kpi-icon">💰</div>
              <div className="kpi-label">Monthly PT Spend</div>
              <div className="kpi-value">${monthlySpend.toFixed(0)}</div>
              <div className="kpi-sub">${(monthlySpend * 12).toFixed(0)}/year · $29.95/provider</div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-header">
                <h3>Active PT Profiles</h3>
                <a href="https://www.psychologytoday.com/us/therapists/positive-inner-self-llc-beaverton-or/751449" target="_blank" rel="noreferrer" className="btn btn-sm btn-primary">Search PT Directory ↗</a>
              </div>
              <div className="card-body" style={{padding:'12px 16px'}}>
                {listed.length === 0 ? (
                  <div className="text-muted">No active Psychology Today listings on file.</div>
                ) : listed.map(p => (
                  <div key={p.id} className="pt-card">
                    <div className="pt-card-avatar">
                      {p.avatarUrl
                        ? <img src={p.avatarUrl} alt={p.fname} style={{width:'100%',height:'100%',objectFit:'cover'}} />
                        : initials(p)
                      }
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:13}}>{p.fname} {p.lname}{p.cred?', '+p.cred:''}</div>
                      <div style={{fontSize:11.5,color:'var(--ink-3)'}}>{p.focus||p.spec}</div>
                      {p.ptNotes && <div style={{fontSize:11,color:'var(--ink-4)',marginTop:2}}>{p.ptNotes}</div>}
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:5,alignItems:'flex-end'}}>
                      <span className="badge b-green" style={{fontSize:10}}>Active</span>
                      {p.ptMonthlyFee && <span className="badge b-blue" style={{fontSize:10}}>$29.95/mo</span>}
                      {p.ptUrl && (
                        <a href={p.ptUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{padding:'3px 8px',fontSize:11}}>View ↗</a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="card mb-16">
                <div className="card-header">
                  <h3>Missing PT Profiles</h3>
                  {unlisted.length > 0 && <span className="badge b-amber">{unlisted.length} providers</span>}
                </div>
                <div className="card-body" style={{padding:'12px 16px'}}>
                  {unlisted.length === 0 ? (
                    <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 0'}}>
                      <span style={{fontSize:20}}>🎉</span>
                      <span style={{fontSize:13,color:'var(--ink-3)'}}>All mental health providers have PT listings!</span>
                    </div>
                  ) : unlisted.map(p => (
                    <div key={p.id} className="pt-card pt-missing">
                      <div className="pt-card-avatar" style={{background:'var(--amber-l)',color:'var(--amber)'}}>
                        {p.avatarUrl
                          ? <img src={p.avatarUrl} alt={p.fname} style={{width:'100%',height:'100%',objectFit:'cover'}} />
                          : initials(p)
                        }
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,fontSize:13}}>{p.fname} {p.lname}{p.cred?', '+p.cred:''}</div>
                        <div style={{fontSize:11.5,color:'var(--ink-3)'}}>{p.focus||p.spec}</div>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:5}}>
                        <button className="btn btn-sm btn-primary" style={{fontSize:11}} onClick={()=>editProvider(p.id)}>
                          + Add PT Profile
                        </button>
                        <a href="https://member.psychologytoday.com/us/login" target="_blank" rel="noreferrer"
                          className="btn btn-ghost btn-sm" style={{fontSize:11,textAlign:'center'}}>Sign up PT ↗</a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="card-header"><h3>Quick Links</h3></div>
                <div className="card-body" style={{padding:'12px 16px'}}>
                  {[
                    ['🔑 PT Provider Login','Sign into your Psychology Today account','https://member.psychologytoday.com/us/login'],
                    ['🔍 Our Beaverton Listing','See how PIS appears in PT search results','https://www.psychologytoday.com/us/therapists/positive-inner-self-llc-beaverton-or/751449'],
                    ['📖 PT Profile Best Practices','PT guide to getting more clients from your listing','https://www.psychologytoday.com/us/therapists/how-to-attract-clients'],
                    ['💳 PT Billing & Subscription','Manage your $29.95/mo subscription','https://member.psychologytoday.com/us/profile'],
                  ].map(([label, desc, href]) => (
                    <a key={label} href={href} target="_blank" rel="noreferrer"
                      style={{display:'flex',alignItems:'center',gap:10,padding:'9px 0',borderBottom:'1px solid var(--border-2)',textDecoration:'none',transition:'color var(--t)'}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:600,color:'var(--primary)'}}>{label}</div>
                        <div style={{fontSize:11.5,color:'var(--ink-4)'}}>{desc}</div>
                      </div>
                      <span style={{color:'var(--ink-4)',fontSize:12}}>↗</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DIRECTORY TAB ── */}
      {activeTab === 'directory' && (
        <div>
          <div style={{background:'var(--blue-l)',border:'1px solid var(--blue-b)',borderRadius:'var(--r-lg)',padding:'13px 16px',marginBottom:16,fontSize:13,color:'var(--blue)'}}>
            <strong>Tip:</strong> Click "Edit" on any provider to update their PT profile URL, status, and notes. PT profiles cost $29.95/month per provider.
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr>
                <th className="no-sort">Provider</th>
                <th className="no-sort">Specialty</th>
                <th className="no-sort">PT Status</th>
                <th className="no-sort">Monthly Fee</th>
                <th className="no-sort">PT Profile</th>
                <th className="no-sort">Notes</th>
                <th className="no-sort">Actions</th>
              </tr></thead>
              <tbody>
                {mentalHealthProvs.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <div style={{width:32,height:32,borderRadius:8,background:SPEC_COLORS[p.spec]||'#4f7ef8',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:'white',fontFamily:'Poppins,sans-serif',flexShrink:0,overflow:'hidden'}}>
                          {p.avatarUrl ? <img src={p.avatarUrl} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} /> : initials(p)}
                        </div>
                        <div>
                          <div style={{fontWeight:600,fontSize:13}}>{p.fname} {p.lname}</div>
                          <div style={{fontSize:11,color:'var(--ink-4)'}}>{p.cred}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className="badge b-gray" style={{fontSize:11}}>{p.spec}</span></td>
                    <td>
                      <span className={`badge ${p.ptStatus==='Active'?'b-green':p.ptStatus==='Inactive'?'b-amber':'b-gray'}`} style={{fontSize:11}}>
                        {p.ptStatus || 'No Listing'}
                      </span>
                    </td>
                    <td style={{fontSize:12,color:'var(--ink-3)'}}>
                      {p.ptMonthlyFee ? <span className="badge b-blue" style={{fontSize:10}}>$29.95/mo</span> : '—'}
                    </td>
                    <td>
                      {p.ptUrl
                        ? <a href={p.ptUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{fontSize:11}}>View Profile ↗</a>
                        : <span style={{fontSize:12,color:'var(--ink-4)'}}>No URL saved</span>
                      }
                    </td>
                    <td style={{fontSize:12,color:'var(--ink-4)',maxWidth:160}}>{p.ptNotes||'—'}</td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={()=>editProvider(p.id)}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TIPS TAB ── */}
      {activeTab === 'tips' && (
        <div>
          <div style={{background:'var(--navy)',borderRadius:'var(--r-lg)',padding:'20px 22px',marginBottom:20,color:'white'}}>
            <div style={{fontFamily:'Poppins,sans-serif',fontSize:20,marginBottom:6}}>Psychology Today Profile Optimization</div>
            <div style={{fontSize:13,opacity:.75,lineHeight:1.6}}>
              PT is the largest therapist directory in the US with 1.5M+ monthly visitors. A well-optimized profile is one of the highest-ROI marketing investments for a mental health practice. These tips are based on PT guidance and industry best practices.
            </div>
          </div>
          <div className="grid-2">
            {PT_TIPS.map((tip, i) => (
              <div key={i} className="card" style={{marginBottom:0}}>
                <div className="card-body" style={{display:'flex',gap:14,alignItems:'flex-start'}}>
                  <div style={{width:40,height:40,borderRadius:10,background:'var(--primary-l)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>{tip.icon}</div>
                  <div>
                    <div style={{fontWeight:700,fontSize:13.5,color:'var(--ink)',marginBottom:5}}>{tip.title}</div>
                    <div style={{fontSize:12.5,color:'var(--ink-3)',lineHeight:1.55}}>{tip.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="card mt-12">
            <div className="card-header"><h3>Psychology Today Resources</h3></div>
            <div className="card-body">
              <div className="grid-3">
                {[
                  ['📊 Analytics Dashboard','Track profile views and inquiries','https://member.psychologytoday.com'],
                  ['🔧 Edit Your Profile','Update bio, photo, specialties','https://member.psychologytoday.com'],
                  ['💰 Subscription & Billing','Manage $29.95/mo fee','https://member.psychologytoday.com'],
                  ['📚 PT Help Center','Guides on optimizing your listing','https://support.psychologytoday.com'],
                  ['🔍 Preview Your Listing','See how clients see our profile','https://www.psychologytoday.com/us/therapists/positive-inner-self-llc-beaverton-or/751449'],
                  ['📧 Contact PT Support','Questions about your account','https://support.psychologytoday.com'],
                ].map(([title, desc, href]) => (
                  <a key={title} href={href} target="_blank" rel="noreferrer" className="report-card" style={{textDecoration:'none'}}>
                    <h4>{title}</h4><p>{desc}</p>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ELIGIBILITY PAGE
// ═══════════════════════════════════════════════════════════════════════════════
