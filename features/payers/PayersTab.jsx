/**
 * PayersTab.jsx — PrimeCredential
 * Redesigned Payer Directory: card-table hybrid with health indicators,
 * enrollment counts per payer, and rich workflow context.
 */

import { useState } from 'react'
import { useSorted } from '../../hooks/useSorted.js'
import { PAYER_CATALOG } from '../../constants/payerRequirements.js'

const SearchIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const LinkIcon   = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
const PlusIcon   = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const EditIcon   = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const TrashIcon  = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>

const TYPE_META = {
  'Commercial':        { color: '#1E56F0', bg: 'rgba(30,86,240,.08)',   label: 'Commercial' },
  'Medicaid':          { color: '#059669', bg: 'rgba(5,150,105,.08)',   label: 'Medicaid' },
  'Medicare':          { color: '#7c3aed', bg: 'rgba(124,58,237,.08)',  label: 'Medicare' },
  'Medicare Advantage':{ color: '#6d28d9', bg: 'rgba(109,40,217,.08)', label: 'MA' },
  'EAP':               { color: '#d97706', bg: 'rgba(217,119,6,.08)',   label: 'EAP' },
  'Other':             { color: '#6b7280', bg: 'rgba(107,114,128,.08)', label: 'Other' },
}

const PAYER_COLORS = [
  '#C8102E','#00539F','#004B87','#006699','#006F44','#0079C1','#007DC3',
  '#0033A0','#003781','#C41E3A','#1B3A6B','#374151','#008080','#6B21A8',
]

function payerInitials(name) {
  return name.split(/[\s\/]+/).slice(0,2).map(w => w[0]).join('').toUpperCase()
}

function payerColor(name) {
  // POL-012: use brand color from PAYER_CATALOG if available, fall back to hash
  const catalog = PAYER_CATALOG.find(c => c.name.toLowerCase() === (name || '').toLowerCase())
  if (catalog?.color) return catalog.color
  let h = 0
  for (let i = 0; i < (name||'').length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return PAYER_COLORS[Math.abs(h) % PAYER_COLORS.length]
}

function EnrollmentBar({ count, active }) {
  if (!count) return <span style={{ fontSize:11.5, color:'var(--text-4)' }}>No enrollments</span>
  return (
    <div style={{ display:'flex', alignItems:'center', gap:7 }}>
      <div style={{ flex:1, height:4, background:'var(--border-l)', borderRadius:2, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${Math.min((active/count)*100,100)}%`, background:'var(--success)', borderRadius:2, transition:'width .3s' }} />
      </div>
      <span style={{ fontSize:11, color:'var(--text-3)', whiteSpace:'nowrap' }}>
        <span style={{ fontWeight:700, color:'var(--success)' }}>{active}</span>/{count} active
      </span>
    </div>
  )
}

export function PayersTab({ db, search, setSearch, fType, setFType, openPayerModal, handleDeletePayer }) {
  const [viewMode, setViewMode] = useState('cards') // 'cards' | 'table'
  const [menuOpen, setMenuOpen] = useState(null)

  const rawPayers = db.payers.filter(p =>
    `${p.name} ${p.payerId||''} ${p.type||''}`.toLowerCase().includes((search||'').toLowerCase()) &&
    (!fType || p.type === fType)
  )
  const { sorted: list, thProps } = useSorted(rawPayers, 'name')

  // Enrollment stats per payer
  function payerStats(payerId) {
    const enrs   = db.enrollments.filter(e => e.payId === payerId)
    const active = enrs.filter(e => ['Active','Approved'].includes(e.stage)).length
    return { total: enrs.length, active }
  }

  const typeOptions = ['Commercial','Medicaid','Medicare','Medicare Advantage','EAP','Other']
  const totalCount  = db.payers.length

  return (
    <>
      {/* Summary strip */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
        {[
          { label:'Total Payers',   val: totalCount },
          { label:'Commercial',     val: db.payers.filter(p=>p.type==='Commercial').length,  color:'#1E56F0' },
          { label:'Government',     val: db.payers.filter(p=>['Medicaid','Medicare','Medicare Advantage'].includes(p.type)).length, color:'#7c3aed' },
          { label:'With Active Enrollments', val: db.payers.filter(p => db.enrollments.some(e => e.payId===p.id && ['Active','Approved'].includes(e.stage))).length, color:'var(--success)' },
        ].map(s => (
          <div key={s.label} style={{ padding:'8px 14px', background:'var(--card)', border:'1.5px solid var(--border)', borderRadius:10, display:'flex', flexDirection:'column', gap:1 }}>
            <span style={{ fontSize:18, fontWeight:900, color:s.color||'var(--text-1)', letterSpacing:'-.04em' }}>{s.val}</span>
            <span style={{ fontSize:10.5, color:'var(--text-4)', fontWeight:600 }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="toolbar" style={{ marginBottom:16 }}>
        <div className="search-box" style={{ flex:'1 1 200px', maxWidth:280 }}>
          <span className="si"><SearchIcon /></span>
          <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search payers, IDs…" />
        </div>

        <select className="filter-select" value={fType} onChange={e=>setFType(e.target.value)}>
          <option value="">All Types</option>
          {typeOptions.map(t => <option key={t}>{t}</option>)}
        </select>

        {(search || fType) && (
          <button onClick={()=>{setSearch('');setFType('')}} style={{ fontSize:12, color:'var(--pr)', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}>Clear ×</button>
        )}

        <div style={{ marginLeft:'auto', display:'flex', gap:6, alignItems:'center' }}>
          {/* View toggle */}
          <div style={{ display:'flex', background:'var(--elevated)', border:'1.5px solid var(--border)', borderRadius:'var(--r)', padding:3, gap:3 }}>
            {[['cards','⊞'],['table','≡']].map(([v,lbl]) => (
              <button key={v} onClick={()=>setViewMode(v)} style={{
                width:28, height:26, border:'none', borderRadius:'var(--r)', cursor:'pointer', fontFamily:'inherit',
                fontSize:14, display:'flex', alignItems:'center', justifyContent:'center',
                background: viewMode===v ? 'var(--pr)' : 'transparent',
                color: viewMode===v ? '#fff' : 'var(--text-3)',
                transition:'all .12s',
              }}>{lbl}</button>
            ))}
          </div>
          <button className="btn btn-primary btn-sm" onClick={()=>openPayerModal()} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <PlusIcon /> Add Payer
          </button>
        </div>
      </div>

      {/* Type filter pills */}
      <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:16 }}>
        <button onClick={()=>setFType('')} style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:99, cursor:'pointer', border:'1.5px solid', fontFamily:'inherit', transition:'all .12s', background:!fType?'var(--navy)':'transparent', borderColor:!fType?'var(--navy)':'var(--border)', color:!fType?'#fff':'var(--text-3)' }}>
          All ({totalCount})
        </button>
        {typeOptions.filter(t => db.payers.some(p=>p.type===t)).map(t => {
          const m = TYPE_META[t]||{}
          const count = db.payers.filter(p=>p.type===t).length
          return (
            <button key={t} onClick={()=>setFType(fType===t?'':t)} style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:99, cursor:'pointer', border:'1.5px solid', fontFamily:'inherit', transition:'all .12s', background:fType===t?(m.color||'var(--pr)'):'transparent', borderColor:fType===t?(m.color||'var(--pr)'):'var(--border)', color:fType===t?'#fff':(m.color||'var(--text-3)') }}>
              {t} ({count})
            </button>
          )
        })}
      </div>

      {/* Empty state */}
      {!list.length && (
        <div className="empty-state">
          <div className="empty-state-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E56F0" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></div>
          <div className="empty-state-title">No payers found</div>
          <div className="empty-state-desc">{search||fType ? 'Try clearing filters.' : 'Add your first payer to get started.'}</div>
          {!search && !fType && <button className="btn btn-primary btn-sm" onClick={()=>openPayerModal()}>+ Add Payer</button>}
        </div>
      )}

      {/* ── CARD VIEW ─────────────────────────────────────────────────────── */}
      {viewMode === 'cards' && list.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:12 }}>
          {list.map(p => {
            const meta  = TYPE_META[p.type] || TYPE_META['Other']
            const color = payerColor(p.name)
            const stats = payerStats(p.id)
            const ini   = payerInitials(p.name)
            return (
              <div key={p.id} style={{ background:'var(--card)', border:'1.5px solid var(--border)', borderRadius:12, overflow:'hidden', transition:'box-shadow .15s, border-color .15s', boxShadow:'var(--shadow-sm)' }}
                onMouseEnter={e=>{ e.currentTarget.style.boxShadow='var(--shadow-md)'; e.currentTarget.style.borderColor='rgba(30,86,240,.3)' }}
                onMouseLeave={e=>{ e.currentTarget.style.boxShadow='var(--shadow-sm)'; e.currentTarget.style.borderColor='var(--border)' }}
              >
                {/* Top color bar */}
                <div style={{ height:3, background:color }} />

                {/* Card body */}
                <div style={{ padding:'14px 16px' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:12 }}>
                    <div style={{ width:38, height:38, borderRadius:9, background:`${color}18`, border:`1.5px solid ${color}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:900, color, flexShrink:0, letterSpacing:'-.01em' }}>
                      {ini}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13.5, fontWeight:800, color:'var(--text-1)', letterSpacing:'-.025em', marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</div>
                      <div style={{ display:'flex', gap:5, flexWrap:'wrap', alignItems:'center' }}>
                        {p.type && <span style={{ fontSize:10.5, fontWeight:700, padding:'1px 7px', borderRadius:99, background:meta.bg, color:meta.color, border:`1px solid ${meta.color}25` }}>{p.type}</span>}
                        {p.payerId && <span style={{ fontFamily:'var(--fn-mono)', fontSize:10.5, color:'var(--text-4)', background:'var(--elevated)', padding:'1px 6px', borderRadius:4 }}>{p.payerId}</span>}
                      </div>
                    </div>
                    {/* Context menu */}
                    <div style={{ position:'relative', flexShrink:0 }}>
                      <button className="btn btn-secondary btn-sm" style={{ padding:'3px 8px' }} onClick={e=>{e.stopPropagation();setMenuOpen(menuOpen===p.id?null:p.id)}}>···</button>
                      {menuOpen===p.id && (
                        <div style={{ position:'absolute', top:'100%', right:0, zIndex:50, background:'var(--card)', border:'1.5px solid var(--border)', borderRadius:'var(--r-lg)', boxShadow:'var(--shadow-lg)', minWidth:160, overflow:'hidden' }}>
                          <button className="dropdown-item" style={{ display:'flex', alignItems:'center', gap:7 }} onClick={()=>{openPayerModal(p.id);setMenuOpen(null)}}>
                            <EditIcon /> Edit Payer
                          </button>
                          <div style={{ height:1, background:'var(--border-l)', margin:'3px 0' }} />
                          <button className="dropdown-item" style={{ color:'var(--danger)', display:'flex', alignItems:'center', gap:7 }} onClick={()=>{handleDeletePayer(p.id);setMenuOpen(null)}}>
                            <TrashIcon /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Enrollment bar */}
                  <div style={{ marginBottom:10 }}>
                    <EnrollmentBar count={stats.total} active={stats.active} />
                  </div>

                  {/* Meta row */}
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', fontSize:11.5, color:'var(--text-3)' }}>
                    {p.timeline && (
                      <span style={{ display:'flex', alignItems:'center', gap:3 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {p.timeline}
                      </span>
                    )}
                    {p.phone && <span>{p.phone}</span>}
                  </div>
                </div>

                {/* Footer actions */}
                <div style={{ padding:'8px 16px', background:'var(--elevated)', borderTop:'1px solid var(--border-l)', display:'flex', alignItems:'center', gap:8 }}>
                  <button className="btn btn-secondary btn-sm" style={{ flex:1, fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', gap:4 }} onClick={()=>openPayerModal(p.id)}>
                    <EditIcon /> Edit
                  </button>
                  {p.portal && (
                    <a href={p.portal} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ flex:1, fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', gap:4, textDecoration:'none', color:'var(--pr)' }}>
                      <LinkIcon /> Portal
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── TABLE VIEW ────────────────────────────────────────────────────── */}
      {viewMode === 'table' && list.length > 0 && (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th {...thProps('name','Payer')} />
                <th {...thProps('payerId','Payer ID')} />
                <th {...thProps('type','Type')} />
                <th style={{ width:130 }}>Enrollments</th>
                <th {...thProps('timeline','Timeline')} />
                <th className="no-sort">Phone</th>
                <th className="no-sort">Portal</th>
                <th className="no-sort" style={{ width:100 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map(p => {
                const meta  = TYPE_META[p.type]||{}
                const color = payerColor(p.name)
                const stats = payerStats(p.id)
                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                        <div style={{ width:28, height:28, borderRadius:7, flexShrink:0, background:`${color}18`, border:`1.5px solid ${color}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color, letterSpacing:'-.01em' }}>
                          {payerInitials(p.name)}
                        </div>
                        <span style={{ fontSize:13, fontWeight:700, color:'var(--text-1)' }}>{p.name}</span>
                      </div>
                    </td>
                    <td>
                      {p.payerId
                        ? <code style={{ fontFamily:'var(--fn-mono)', background:'var(--elevated)', padding:'2px 6px', borderRadius:4, fontSize:11.5, color:'var(--text-3)' }}>{p.payerId}</code>
                        : <span style={{ color:'var(--text-4)' }}>—</span>}
                    </td>
                    <td>
                      {p.type && <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:99, background:meta.bg||'var(--elevated)', color:meta.color||'var(--text-3)' }}>{p.type}</span>}
                    </td>
                    <td>
                      <div style={{ fontSize:12, color:'var(--text-3)' }}>
                        <span style={{ fontWeight:700, color:'var(--success)' }}>{stats.active}</span>
                        <span style={{ color:'var(--text-4)' }}>/{stats.total} active</span>
                      </div>
                    </td>
                    <td style={{ fontSize:12, color:'var(--text-3)' }}>{p.timeline||'—'}</td>
                    <td style={{ fontSize:12, color:'var(--text-3)' }}>{p.phone||'—'}</td>
                    <td>
                      {p.portal
                        ? <a href={p.portal} target="_blank" rel="noreferrer" style={{ fontSize:12, color:'var(--pr)', fontWeight:500, textDecoration:'none', display:'flex', alignItems:'center', gap:3 }}><LinkIcon /> Portal ↗</a>
                        : <span style={{ color:'var(--text-4)' }}>—</span>}
                    </td>
                    <td>
                      <div style={{ display:'flex', gap:5 }}>
                        <button className="btn btn-secondary btn-sm" onClick={()=>openPayerModal(p.id)} style={{ fontSize:11, padding:'3px 8px' }}>Edit</button>
                        <button className="btn btn-sm" onClick={()=>handleDeletePayer(p.id)} style={{ fontSize:11, padding:'3px 8px', color:'var(--danger)', borderColor:'var(--danger)' }}>Del</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ padding:'8px 16px', background:'var(--elevated)', borderTop:'1px solid var(--border-l)', fontSize:11.5, color:'var(--text-4)' }}>
            {list.length} of {totalCount} payers
          </div>
        </div>
      )}
    </>
  )
}
