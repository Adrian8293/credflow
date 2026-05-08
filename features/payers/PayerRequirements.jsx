import { useState } from 'react'
import { Badge } from '../../components/ui/Badge.jsx'
import { PAYER_REQUIREMENTS } from '../../constants/stages.js'

export function PayerRequirements({ db }) {
  const [search, setSearch] = useState('')
  const [fState, setFState] = useState('')
  const [fType, setFType] = useState('')
  const [expanded, setExpanded] = useState({})
  const toggle = name => setExpanded(e => ({ ...e, [name]: !e[name] }))

  const US_STATES = [
    ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
    ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','DC'],['FL','Florida'],
    ['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],
    ['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],
    ['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],
    ['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],
    ['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],
    ['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],
    ['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],
    ['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
  ]

  const TYPE_BADGE = {
    'National': 'b-blue', 'Regional': 'b-teal', 'Medicaid': 'b-green',
    'Medicare': 'b-purple', 'Military': 'b-gray', 'Marketplace': 'b-amber',
  }

  const allPayers = Object.keys(PAYER_REQUIREMENTS)

  const filtered = allPayers.filter(name => {
    const req = PAYER_REQUIREMENTS[name]
    const matchSearch = !search || name.toLowerCase().includes(search.toLowerCase()) || (req.notes||'').toLowerCase().includes(search.toLowerCase())
    const matchState = !fState || req.states === 'ALL' || (Array.isArray(req.states) && req.states.includes(fState))
    const matchType = !fType || req.type === fType
    return matchSearch && matchState && matchType
  })

  const nationalCount = filtered.filter(n => PAYER_REQUIREMENTS[n].states === 'ALL').length
  const stateCount = filtered.filter(n => PAYER_REQUIREMENTS[n].states !== 'ALL').length

  return (
    <div className="page">
      {/* Header info banner */}
      <div style={{background:'var(--primary-l)',border:'1px solid var(--primary-ll)',borderRadius:'var(--r-lg)',padding:'12px 16px',marginBottom:16,fontSize:13,color:'var(--primary)',display:'flex',alignItems:'center',gap:10}}>
        <span style={{fontSize:18}}>🗂️</span>
        <div>
          <strong>National Payer Library</strong> — {Object.keys(PAYER_REQUIREMENTS).length} payers across all 50 US states + DC.
          Filter by state to see which payers operate in that market.
        </div>
        <span className="badge b-blue" style={{marginLeft:'auto',flexShrink:0}}>{filtered.length} shown</span>
      </div>

      <div className="toolbar" style={{ marginBottom:18, flexWrap:'wrap', gap:8 }}>
        <div className="search-box">
          <span className="si">🔍</span>
          <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search payers, notes…" style={{width:220}} />
        </div>

        {/* State filter */}
        <select className="filter-select" value={fState} onChange={e=>setFState(e.target.value)} style={{minWidth:170}}>
          <option value="">🌎 All States</option>
          {US_STATES.map(([abbr, name]) => (
            <option key={abbr} value={abbr}>{abbr} — {name}</option>
          ))}
        </select>

        {/* Type filter */}
        <select className="filter-select" value={fType} onChange={e=>setFType(e.target.value)}>
          <option value="">All Types</option>
          <option value="National">National</option>
          <option value="Regional">Regional</option>
          <option value="Medicaid">Medicaid</option>
          <option value="Medicare">Medicare</option>
          <option value="Military">Military</option>
          <option value="Marketplace">Marketplace</option>
        </select>

        {(fState || fType || search) && (
          <button className="btn btn-ghost btn-sm" onClick={()=>{setFState('');setFType('');setSearch('')}}>✕ Clear filters</button>
        )}

        <div style={{marginLeft:'auto',display:'flex',gap:10,fontSize:12,color:'var(--ink-4)',alignItems:'center'}}>
          {fState && <span className="badge b-blue">{nationalCount} national + {stateCount} state-specific</span>}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">
          <div className="ei">🔍</div>
          <h4>No payers found</h4>
          <p>Try adjusting your filters or clearing the state/type selection.</p>
        </div>
      )}

      <div className="payer-req-grid">
        {filtered.map(name => {
          const req = PAYER_REQUIREMENTS[name]
          const isExp = expanded[name]
          const stateList = req.states === 'ALL' ? null : req.states
          return (
            <div key={name} className={`payer-req-card ${isExp ? 'expanded' : ''}`}>
              <div className="payer-req-header">
                <div className="payer-req-dot" style={{ background: req.color }} />
                <div className="payer-req-name">{name}</div>
                <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'flex-end'}}>
                  <span className={`badge ${TYPE_BADGE[req.type]||'b-gray'}`} style={{ fontSize:'10px' }}>{req.type}</span>
                  <span className="badge b-blue" style={{ fontSize:'10px' }}>{req.timeline}</span>
                </div>
              </div>
              <div className="payer-req-body">
                {/* States served */}
                <div style={{marginBottom:8}}>
                  {req.states === 'ALL'
                    ? <span style={{fontSize:11,color:'var(--ink-3)',background:'var(--surface-2)',padding:'2px 8px',borderRadius:20,border:'1px solid var(--border)'}}>🌎 Nationwide</span>
                    : <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                        {stateList.slice(0,12).map(s => (
                          <span key={s} style={{
                            fontSize:10,fontWeight:600,padding:'1px 5px',borderRadius:4,
                            background: fState===s ? 'var(--primary)' : 'var(--surface-2)',
                            color: fState===s ? 'white' : 'var(--ink-3)',
                            border:'1px solid var(--border)',cursor:'pointer'
                          }} onClick={()=>setFState(s===fState?'':s)}>{s}</span>
                        ))}
                        {stateList.length > 12 && <span style={{fontSize:10,color:'var(--ink-4)',padding:'1px 4px'}}>+{stateList.length-12} more</span>}
                      </div>
                  }
                </div>

                <div className="payer-req-meta">
                  <span className="payer-req-chip">🔄 {req.revalidation}</span>
                  {req.portalUrl && <a href={req.portalUrl} target="_blank" rel="noreferrer" className="payer-req-chip" style={{ color:'var(--primary)', textDecoration:'none' }}>🔗 Portal ↗</a>}
                </div>
                {req.specialNotes.map((n, i) => (
                  <div key={i} className="payer-req-special">⚡ {n}</div>
                ))}
                <div className="payer-req-section" style={{ marginTop:10 }}>
                  <div className="payer-req-section-label">Submission Method</div>
                  <div style={{ fontSize:'12.5px', color:'var(--ink-2)' }}>{req.submission}</div>
                </div>
                <div className="payer-req-expanded">
                  <div className="payer-req-section">
                    <div className="payer-req-section-label">Required Documents</div>
                    {req.requirements.map((r, i) => (
                      <div key={i} className="payer-req-item">{r}</div>
                    ))}
                  </div>
                  <div className="payer-req-section">
                    <div className="payer-req-section-label">Notes</div>
                    <div className="payer-req-note">{req.notes}</div>
                  </div>
                </div>
                <button className="payer-req-toggle" onClick={() => toggle(name)}>
                  {isExp ? '▲ Show less' : '▼ Show requirements & notes'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── GLOBAL SEARCH ─────────────────────────────────────────────────────────────
