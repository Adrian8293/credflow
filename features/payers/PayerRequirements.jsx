/**
 * PayerRequirements.jsx — Lacentra
 * Redesigned Payer Library: workflow-driven cards with rich visual hierarchy,
 * timeline indicators, checklist drawers, and quick-enroll CTAs.
 */

import { useState, useMemo } from 'react'
import { PAYER_REQUIREMENTS } from '../../constants/stages.js'
import { safeUrl } from '../../lib/safeUrl.js'

// ─── Icons ────────────────────────────────────────────────────────────────────
const SearchIcon    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const GlobeIcon     = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
const ClockIcon     = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
const RefreshIcon   = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
const LinkIcon      = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
const ChevronIcon   = ({ open }) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .2s' }}><polyline points="6 9 12 15 18 9"/></svg>
const CheckIcon     = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
const AlertIcon     = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
const PlusIcon      = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>

// ─── Config ───────────────────────────────────────────────────────────────────
const TYPE_META = {
  National:    { color: '#1565C0', bg: 'rgba(21,101,192,.09)',   border: 'rgba(21,101,192,.22)',   label: 'National'    },
  Regional:    { color: '#0891b2', bg: 'rgba(8,145,178,.09)',   border: 'rgba(8,145,178,.22)',   label: 'Regional'    },
  Medicaid:    { color: '#059669', bg: 'rgba(5,150,105,.09)',   border: 'rgba(5,150,105,.22)',   label: 'Medicaid'    },
  Medicare:    { color: '#7c3aed', bg: 'rgba(124,58,237,.09)',  border: 'rgba(124,58,237,.22)',  label: 'Medicare'    },
  'Medicare Advantage': { color: '#6d28d9', bg: 'rgba(109,40,217,.09)', border: 'rgba(109,40,217,.22)', label: 'Medicare Adv.' },
  Military:    { color: '#374151', bg: 'rgba(55,65,81,.09)',    border: 'rgba(55,65,81,.22)',    label: 'Military'    },
  Marketplace: { color: '#d97706', bg: 'rgba(217,119,6,.09)',   border: 'rgba(217,119,6,.22)',   label: 'Marketplace' },
}

// Parse timeline string → estimated days for the progress arc
function parseTimelineDays(tl) {
  if (!tl) return null
  const m = tl.match(/(\d+)[–\-](\d+)/)
  if (m) return Math.round((+m[1] + +m[2]) / 2)
  const s = tl.match(/(\d+)/)
  return s ? +s[1] : null
}

// Speed indicator: Fast <45d | Medium 45–75 | Slow >75
function SpeedBadge({ timeline }) {
  const days = parseTimelineDays(timeline)
  if (!days) return null
  const fast   = days < 45
  const medium = days >= 45 && days <= 75
  const color  = fast ? '#059669' : medium ? '#d97706' : '#dc2626'
  const bg     = fast ? 'rgba(5,150,105,.09)' : medium ? 'rgba(217,119,6,.09)' : 'rgba(220,38,38,.09)'
  const label  = fast ? 'Fast' : medium ? 'Medium' : 'Slow'
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'2px 7px', background:bg, color, border:`1px solid ${color}33`, borderRadius:99, fontSize:10, fontWeight:700, letterSpacing:'.02em' }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:color, display:'inline-block' }} />
      {label} · {timeline}
    </span>
  )
}

// Horizontal progress ring showing elapsed timeline
function TimelinePie({ timeline }) {
  const days = parseTimelineDays(timeline)
  if (!days) return null
  const MAX = 120
  const pct  = Math.min(days / MAX, 1)
  const r    = 14, c = 2 * Math.PI * r
  const dash = pct * c
  const color = days < 45 ? '#10b981' : days < 75 ? '#f59e0b' : '#ef4444'
  return (
    <svg width="38" height="38" viewBox="0 0 38 38">
      <circle cx="19" cy="19" r={r} fill="none" stroke="var(--border-l)" strokeWidth="3.5" />
      <circle cx="19" cy="19" r={r} fill="none" stroke={color} strokeWidth="3.5"
        strokeDasharray={`${dash} ${c}`} strokeDashoffset={c * 0.25}
        strokeLinecap="round" style={{ transition: 'stroke-dasharray .4s' }} />
      <text x="19" y="23" textAnchor="middle" fontSize="9" fontWeight="800" fill={color}>{days}d</text>
    </svg>
  )
}

// Enrollment readiness checklist for a specific provider
function ReadinessStrip({ req, enrolledPayers, payerName, openEnrollModal }) {
  const items = req.requirements.slice(0, 5)
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:8 }}>
      {items.map((item, i) => (
        <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:10.5, padding:'2px 7px', background:'var(--elevated)', border:'1px solid var(--border-l)', borderRadius:5, color:'var(--text-3)' }}>
          <span style={{ color:'var(--success)', display:'flex' }}><CheckIcon /></span>
          {item.split('(')[0].trim()}
        </span>
      ))}
      {req.requirements.length > 5 && (
        <span style={{ fontSize:10.5, color:'var(--text-4)', padding:'2px 5px' }}>+{req.requirements.length - 5} more</span>
      )}
    </div>
  )
}

// State pills
function StatePills({ states, activeState, onClickState }) {
  if (states === 'ALL') return (
    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
      <span style={{ color:'var(--pr)', display:'flex' }}><GlobeIcon /></span>
      <span style={{ fontSize:11.5, fontWeight:600, color:'var(--pr)' }}>Nationwide — all 50 states + DC</span>
    </div>
  )
  const sorted = [...states].sort()
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
      {sorted.slice(0, 14).map(s => (
        <button key={s} onClick={() => onClickState(s === activeState ? '' : s)} style={{
          fontSize:10, fontWeight:700, padding:'2px 5px', borderRadius:4, border:'1.5px solid',
          cursor:'pointer', fontFamily:'inherit', transition:'all .12s',
          background: activeState === s ? 'var(--pr)' : 'var(--elevated)',
          borderColor: activeState === s ? 'var(--pr)' : 'var(--border)',
          color: activeState === s ? '#fff' : 'var(--text-3)',
        }}>{s}</button>
      ))}
      {sorted.length > 14 && <span style={{ fontSize:10, color:'var(--text-4)', padding:'2px 4px', alignSelf:'center' }}>+{sorted.length - 14}</span>}
    </div>
  )
}

// ─── Main card ────────────────────────────────────────────────────────────────
function PayerCard({ name, req, isExpanded, onToggle, activeState, onClickState, openEnrollModal, enrolledProviders }) {
  const meta     = TYPE_META[req.type] || TYPE_META.National
  const enrolled = enrolledProviders > 0
  const hasWarn  = req.specialNotes?.some(n => n.includes('⚠') || n.toLowerCase().includes('warn') || n.toLowerCase().includes('closed') || n.toLowerCase().includes('invitation'))

  return (
    <div style={{
      background: 'var(--card)',
      border: '1.5px solid var(--border)',
      borderRadius: 14,
      overflow: 'hidden',
      transition: 'box-shadow .18s, border-color .18s',
      boxShadow: isExpanded ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
      borderColor: isExpanded ? 'var(--pr)' : 'var(--border)',
    }}>

      {/* Color accent bar */}
      <div style={{ height: 3, background: req.color || meta.color, opacity: .85 }} />

      {/* Card header */}
      <div style={{ padding: '14px 16px 12px', display:'flex', gap:12, alignItems:'flex-start' }}>
        {/* Payer initial avatar */}
        <div style={{
          width: 42, height: 42, borderRadius: 10, flexShrink: 0,
          background: `${req.color || meta.color}18`,
          border: `1.5px solid ${req.color || meta.color}30`,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize: 16, fontWeight: 900, color: req.color || meta.color,
          letterSpacing: '-.02em', fontFamily: 'var(--fn)',
        }}>
          {name[0]}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
            <span style={{ fontSize:14, fontWeight:800, color:'var(--text-1)', letterSpacing:'-.025em', lineHeight:1.2 }}>{name}</span>
            {enrolled && (
              <span style={{ fontSize:10, fontWeight:700, padding:'1px 7px', background:'rgba(16,185,129,.1)', color:'var(--success)', border:'1px solid rgba(16,185,129,.25)', borderRadius:99 }}>
                {enrolledProviders} enrolled
              </span>
            )}
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'2px 7px', fontSize:10.5, fontWeight:700, letterSpacing:'.03em', background: meta.bg, color: meta.color, border:`1px solid ${meta.border}`, borderRadius:99 }}>
              {req.type}
            </span>
            <SpeedBadge timeline={req.timeline} />
            {hasWarn && (
              <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:10, color:'var(--warning)', background:'rgba(245,158,11,.08)', border:'1px solid rgba(245,158,11,.25)', borderRadius:99, padding:'2px 7px', fontWeight:700 }}>
                <AlertIcon /> Note
              </span>
            )}
          </div>
        </div>

        {/* Timeline ring + toggle */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, flexShrink:0 }}>
          <TimelinePie timeline={req.timeline} />
          <button onClick={onToggle} style={{
            display:'flex', alignItems:'center', gap:3, fontSize:11, fontWeight:600,
            color: isExpanded ? 'var(--pr)' : 'var(--text-3)',
            background:'none', border:'none', cursor:'pointer', padding:0,
            fontFamily:'inherit',
          }}>
            <ChevronIcon open={isExpanded} />
          </button>
        </div>
      </div>

      {/* States served */}
      <div style={{ padding:'0 16px 10px' }}>
        <StatePills states={req.states} activeState={activeState} onClickState={onClickState} />
      </div>

      {/* Quick info strip */}
      <div style={{ padding:'8px 16px', background:'var(--elevated)', borderTop:'1px solid var(--border-l)', display:'flex', gap:16, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11.5, color:'var(--text-3)' }}>
          <span style={{ display:'flex', color:'var(--text-4)' }}><ClockIcon /></span>
          <span>{req.timeline}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11.5, color:'var(--text-3)' }}>
          <span style={{ display:'flex', color:'var(--text-4)' }}><RefreshIcon /></span>
          <span>{req.revalidation}</span>
        </div>
        {req.portalUrl && (
          <a href={safeUrl(req.portalUrl) || '#'} target="_blank" rel="noreferrer" style={{ display:'flex', alignItems:'center', gap:4, fontSize:11.5, color:'var(--pr)', fontWeight:600, textDecoration:'none', marginLeft:'auto' }}>
            <LinkIcon /> Portal ↗
          </a>
        )}
      </div>

      {/* Special warnings */}
      {req.specialNotes?.length > 0 && (
        <div style={{ padding:'8px 16px', borderTop:'1px solid var(--border-l)', display:'flex', flexDirection:'column', gap:4 }}>
          {req.specialNotes.map((note, i) => {
            const isWarn = note.includes('⚠') || note.toLowerCase().includes('warn') || note.toLowerCase().includes('closed') || note.toLowerCase().includes('invitation') || note.toLowerCase().includes('mandatory')
            return (
              <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:6, fontSize:11.5, color: isWarn ? 'var(--warning)' : 'var(--text-3)' }}>
                <span style={{ flexShrink:0, marginTop:1, color: isWarn ? 'var(--warning)' : 'var(--success)', display:'flex' }}>
                  {isWarn ? <AlertIcon /> : <CheckIcon />}
                </span>
                {note.replace('⚠ ', '')}
              </div>
            )
          })}
        </div>
      )}

      {/* Expandable requirements section */}
      {isExpanded && (
        <div style={{ borderTop:'2px solid var(--border-l)' }}>
          {/* Submission method */}
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border-l)' }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color:'var(--text-4)', marginBottom:6 }}>Submission Method</div>
            <div style={{ fontSize:13, color:'var(--text-2)', fontWeight:500 }}>{req.submission}</div>
          </div>

          {/* Required documents checklist */}
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border-l)' }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color:'var(--text-4)', marginBottom:8 }}>Required Documents</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'5px 12px' }}>
              {req.requirements.map((r, i) => (
                <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:7, fontSize:12.5, color:'var(--text-2)' }}>
                  <div style={{ width:16, height:16, borderRadius:4, background:'rgba(16,185,129,.12)', border:'1.5px solid rgba(16,185,129,.3)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
                    <CheckIcon />
                  </div>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          {req.notes && (
            <div style={{ padding:'12px 16px', background:'rgba(21,101,192,.025)', borderBottom:'1px solid var(--border-l)' }}>
              <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color:'var(--text-4)', marginBottom:5 }}>Credentialing Notes</div>
              <div style={{ fontSize:12.5, color:'var(--text-2)', lineHeight:1.55 }}>{req.notes}</div>
            </div>
          )}

          {/* Quick actions */}
          <div style={{ padding:'10px 16px', display:'flex', gap:8, alignItems:'center', background:'var(--elevated)' }}>
            {openEnrollModal && (
              <button className="btn btn-primary btn-sm" onClick={() => openEnrollModal()} style={{ display:'flex', alignItems:'center', gap:5, fontSize:12 }}>
                <PlusIcon /> Start Enrollment
              </button>
            )}
            {req.portalUrl && (
              <a href={safeUrl(req.portalUrl) || '#'} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, textDecoration:'none' }}>
                <LinkIcon /> Open Portal
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function PayerRequirements({ db, openEnrollModal }) {
  const [search,   setSearch]   = useState('')
  const [fState,   setFState]   = useState('')
  const [fType,    setFType]    = useState('')
  const [fSpeed,   setFSpeed]   = useState('')
  const [expanded, setExpanded] = useState({})
  const [view,     setView]     = useState('list') // 'grid' | 'list'
  const toggle = name => setExpanded(e => ({ ...e, [name]: !e[name] }))

  const allPayers = Object.keys(PAYER_REQUIREMENTS)

  const filtered = useMemo(() => allPayers.filter(name => {
    const req = PAYER_REQUIREMENTS[name]
    const matchSearch = !search || name.toLowerCase().includes(search.toLowerCase())
      || (req.notes||'').toLowerCase().includes(search.toLowerCase())
      || (req.submission||'').toLowerCase().includes(search.toLowerCase())
    const matchState = !fState || req.states === 'ALL' || (Array.isArray(req.states) && req.states.includes(fState))
    const matchType  = !fType  || req.type === fType
    const days       = parseTimelineDays(req.timeline)
    const matchSpeed = !fSpeed
      || (fSpeed === 'fast'   && days && days < 45)
      || (fSpeed === 'medium' && days && days >= 45 && days <= 75)
      || (fSpeed === 'slow'   && days && days > 75)
    return matchSearch && matchState && matchType && matchSpeed
  }), [search, fState, fType, fSpeed])

  // Payers the practice has active enrollments with
  const enrolledCounts = useMemo(() => {
    const counts = {}
    db.enrollments.forEach(e => {
      const payer = db.payers.find(p => p.id === e.payId)
      if (payer?.name) counts[payer.name] = (counts[payer.name] || 0) + 1
    })
    return counts
  }, [db.enrollments, db.payers])

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

  const types      = [...new Set(allPayers.map(n => PAYER_REQUIREMENTS[n].type))]
  const totalCount = allPayers.length
  const hasFilters = search || fState || fType || fSpeed

  // Summary stats
  const nationalCount = filtered.filter(n => PAYER_REQUIREMENTS[n].states === 'ALL').length
  const fastCount     = filtered.filter(n => { const d = parseTimelineDays(PAYER_REQUIREMENTS[n].timeline); return d && d < 45 }).length

  return (
    <div>
      {/* ── Hero banner ──────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(21,101,192,.06) 0%, rgba(21,101,192,.02) 100%)',
        border: '1.5px solid rgba(21,101,192,.14)',
        borderRadius: 14, padding: '16px 20px', marginBottom: 18,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', width:44, height:44, background:'rgba(21,101,192,.12)', borderRadius:12, flexShrink:0 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--pr)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:15, fontWeight:800, color:'var(--text-1)', marginBottom:2, letterSpacing:'-.03em' }}>National Payer Library</div>
          <div style={{ fontSize:12.5, color:'var(--text-3)' }}>
            {totalCount} payers — requirements, timelines, and submission portals for credentialing across all 50 states.
          </div>
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          {[
            { label: 'Total Payers',  val: totalCount,    color: 'var(--pr)' },
            { label: 'Nationwide',    val: allPayers.filter(n => PAYER_REQUIREMENTS[n].states === 'ALL').length, color: 'var(--success)' },
            { label: 'Fast (<45d)',   val: allPayers.filter(n => { const d = parseTimelineDays(PAYER_REQUIREMENTS[n].timeline); return d && d < 45 }).length, color: 'var(--warning)' },
          ].map(s => (
            <div key={s.label} style={{ textAlign:'center', padding:'8px 16px', background:'var(--card)', border:'1.5px solid var(--border)', borderRadius:10 }}>
              <div style={{ fontSize:20, fontWeight:900, color:s.color, letterSpacing:'-.04em' }}>{s.val}</div>
              <div style={{ fontSize:10.5, color:'var(--text-4)', fontWeight:600 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16, alignItems:'center' }}>
        <div className="search-box" style={{ flex:'1 1 220px', maxWidth:300 }}>
          <span className="si"><SearchIcon /></span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search payers, notes, portals…" />
        </div>

        <select aria-label="Filter by state" className="filter-select" value={fState} onChange={e => setFState(e.target.value)} style={{ minWidth:160 }}>
          <option value="">State: All</option>
          {US_STATES.map(([abbr, name]) => <option key={abbr} value={abbr}>{abbr} — {name}</option>)}
        </select>

        <select aria-label="Filter by type" className="filter-select" value={fType} onChange={e => setFType(e.target.value)}>
          <option value="">Type: All</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select className="filter-select" value={fSpeed} onChange={e => setFSpeed(e.target.value)}>
          <option value="">Speed: All</option>
          <option value="fast">Fast (&lt;45 days)</option>
          <option value="medium">Medium (45–75 days)</option>
          <option value="slow">Slow (&gt;75 days)</option>
        </select>

        {hasFilters && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFState(''); setFType(''); setFSpeed('') }}>
            Clear ×
          </button>
        )}

        <div style={{ marginLeft:'auto', display:'flex', gap:4, background:'var(--elevated)', border:'1.5px solid var(--border)', borderRadius:'var(--r)', padding:3 }}>
          {[['grid','⊞'],['list','≡']].map(([v, lbl]) => (
            <button key={v} onClick={() => setView(v)} style={{
              width:28, height:26, border:'none', borderRadius:'var(--r)', cursor:'pointer', fontFamily:'inherit',
              fontSize:14, display:'flex', alignItems:'center', justifyContent:'center',
              background: view === v ? 'var(--pr)' : 'transparent',
              color: view === v ? '#fff' : 'var(--text-3)',
              transition:'all .12s',
            }}>{lbl}</button>
          ))}
        </div>

        <div style={{ fontSize:12, color:'var(--text-4)', whiteSpace:'nowrap' }}>
          <span style={{ fontWeight:700, color:'var(--text-2)' }}>{filtered.length}</span> of {totalCount}
        </div>
      </div>

      {/* ── Type filter pills ─────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
        <button onClick={() => setFType('')} style={{
          fontSize:11.5, fontWeight:600, padding:'4px 12px', borderRadius:99, cursor:'pointer', border:'1.5px solid', fontFamily:'inherit', transition:'all .12s',
          background: !fType ? 'var(--pr)' : 'transparent',
          borderColor: !fType ? 'var(--pr)' : 'var(--border)',
          color: !fType ? '#fff' : 'var(--text-3)',
        }}>All ({totalCount})</button>
        {types.map(t => {
          const meta  = TYPE_META[t] || {}
          const count = allPayers.filter(n => PAYER_REQUIREMENTS[n].type === t).length
          const active = fType === t
          return (
            <button key={t} onClick={() => setFType(active ? '' : t)} style={{
              fontSize:11.5, fontWeight:600, padding:'4px 12px', borderRadius:99, cursor:'pointer', border:'1.5px solid', fontFamily:'inherit', transition:'all .12s',
              background: active ? meta.color : 'transparent',
              borderColor: active ? meta.color : 'var(--border)',
              color: active ? '#fff' : (meta.color || 'var(--text-3)'),
            }}>{t} ({count})</button>
          )
        })}
      </div>

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1565C0" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></div>
          <div className="empty-state-title">No payers match your filters</div>
          <div className="empty-state-desc">Try clearing the state or type filter.</div>
          <button className="btn btn-secondary btn-sm" onClick={() => { setSearch(''); setFState(''); setFType(''); setFSpeed('') }}>Clear all filters</button>
        </div>
      )}

      {/* ── Cards ─────────────────────────────────────────────────────────── */}
      <div style={view === 'grid' ? {
        display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(340px, 1fr))', gap:14,
      } : {
        display:'flex', flexDirection:'column', gap:10,
      }}>
        {filtered.map(name => (
          <PayerCard
            key={name}
            name={name}
            req={PAYER_REQUIREMENTS[name]}
            isExpanded={!!expanded[name]}
            onToggle={() => toggle(name)}
            activeState={fState}
            onClickState={setFState}
            openEnrollModal={openEnrollModal}
            enrolledProviders={enrolledCounts[name] || 0}
          />
        ))}
      </div>
    </div>
  )
}
