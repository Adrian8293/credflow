import { useRef, useState, useEffect } from 'react'
import { Badge, ExpiryBadge } from './ui/Badge.jsx'

export function GlobalSearch({ db, onClose, setPage, openProvDetail, openEnrollModal }) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const q = query.trim().toLowerCase()

  const provResults = q.length < 1 ? [] : db.providers.filter(p => {
    const txt = [p.fname, p.lname, p.cred, p.spec, p.npi, p.license, p.medicaid,
      p.caqh, p.dea, p.email, p.phone, p.focus, p.supervisor, p.notes].join(' ').toLowerCase()
    return txt.includes(q)
  }).slice(0, 5)

  const enrResults = q.length < 1 ? [] : db.enrollments.filter(e => {
    const pn = pName(db.providers, e.provId).toLowerCase()
    const pay = payName(db.payers, e.payId).toLowerCase()
    return pn.includes(q) || pay.includes(q) || e.stage.toLowerCase().includes(q)
  }).slice(0, 4)

  const payResults = q.length < 1 ? [] : db.payers.filter(p =>
    `${p.name} ${p.payerId} ${p.type}`.toLowerCase().includes(q)
  ).slice(0, 3)

  const docResults = q.length < 1 ? [] : db.documents.filter(d => {
    const pn = pName(db.providers, d.provId).toLowerCase()
    return pn.includes(q) || (d.type||'').toLowerCase().includes(q) ||
      (d.issuer||'').toLowerCase().includes(q) || (d.number||'').toLowerCase().includes(q)
  }).slice(0, 3)

  const taskResults = q.length < 1 ? [] : db.tasks.filter(t =>
    (t.task||'').toLowerCase().includes(q) || (t.cat||'').toLowerCase().includes(q)
  ).slice(0, 3)

  // Build flat list for keyboard nav
  const allItems = [
    ...provResults.map(r => ({ type:'provider', data:r })),
    ...enrResults.map(r => ({ type:'enrollment', data:r })),
    ...payResults.map(r => ({ type:'payer', data:r })),
    ...docResults.map(r => ({ type:'doc', data:r })),
    ...taskResults.map(r => ({ type:'task', data:r })),
  ]
  const total = allItems.length

  useEffect(() => { setFocused(0) }, [query])

  function handleKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f+1, total-1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused(f => Math.max(f-1, 0)) }
    if (e.key === 'Enter' && total > 0) { handleSelect(allItems[focused]) }
  }

  function handleSelect(item) {
    if (item.type === 'provider') { setPage('providers'); openProvDetail(item.data.id) }
    else if (item.type === 'enrollment') { setPage('enrollments'); openEnrollModal(item.data.id) }
    else if (item.type === 'payer') { setPage('payer-hub') }
    else if (item.type === 'doc') { setPage('documents') }
    else if (item.type === 'task') { setPage('workflows') }
    onClose()
  }

  const isEmpty = q.length > 0 && total === 0
  const isBlank = q.length === 0

  let itemIdx = 0
  function Section({ label, items, icon, color, renderItem }) {
    if (!items.length) return null
    return (
      <div className="gsearch-section">
        <div className="gsearch-section-label">{label}</div>
        {items.map((item, i) => {
          const idx = itemIdx++
          return (
            <div key={i} className={`gsearch-item ${focused===idx?'focused':''}`}
              onMouseEnter={() => setFocused(idx)}
              onClick={() => handleSelect({ type: item._type, data: item })}>
              <div className="gsearch-item-icon" style={{background:color+'22',color}}>{icon}</div>
              <div className="gsearch-item-main">{renderItem(item)}</div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="gsearch-overlay" onClick={e => { if(e.target===e.currentTarget) onClose() }}>
      <div className="gsearch-box">
        <div className="gsearch-input-wrap">
          <span className="gsearch-icon">🔍</span>
          <input
            ref={inputRef}
            className="gsearch-input"
            placeholder="Search providers, payers, enrollments, documents…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
          />
          <span className="gsearch-kbd">ESC</span>
        </div>

        <div className="gsearch-results">
          {isBlank && (
            <div className="gsearch-empty">
              <div style={{fontSize:28,marginBottom:8}}>🔍</div>
              <div style={{fontWeight:600,color:'var(--ink-3)',marginBottom:4}}>Search everything</div>
              <div>Providers · Payers · Enrollments · Documents · Tasks</div>
            </div>
          )}
          {isEmpty && (
            <div className="gsearch-empty">
              <div style={{fontSize:28,marginBottom:8}}>😔</div>
              <div style={{fontWeight:600,color:'var(--ink-3)',marginBottom:4}}>No results for "{query}"</div>
              <div>Try a name, NPI, license number, payer, or specialty</div>
            </div>
          )}

          {provResults.map(p => { p._type='provider'; return null })}
          {enrResults.map(e => { e._type='enrollment'; return null })}
          {payResults.map(p => { p._type='payer'; return null })}
          {docResults.map(d => { d._type='doc'; return null })}
          {taskResults.map(t => { t._type='task'; return null })}

          {(() => { itemIdx = 0; return null })()}

          {provResults.length > 0 && (
            <div className="gsearch-section">
              <div className="gsearch-section-label">Providers</div>
              {provResults.map((p, i) => {
                const idx = itemIdx++
                const hasDays = daysUntil(p.licenseExp)
                const urgent = hasDays !== null && hasDays <= 30
                return (
                  <div key={p.id} className={`gsearch-item ${focused===idx?'focused':''}`}
                    onMouseEnter={() => setFocused(idx)}
                    onClick={() => handleSelect({type:'provider',data:p})}>
                    <div className="gsearch-item-icon" style={{background:(SPEC_COLORS[p.spec]||'#4f7ef8')+'25',color:SPEC_COLORS[p.spec]||'#4f7ef8',fontFamily:'Poppins,sans-serif',fontSize:15,fontWeight:600}}>
                      {initials(p)}
                    </div>
                    <div className="gsearch-item-main">
                      <div className="gsearch-item-title">{p.fname} {p.lname}{p.cred?', '+p.cred:''}</div>
                      <div className="gsearch-item-sub">
                        {p.spec}{p.npi?' · NPI '+p.npi:''}{p.license?' · '+p.license:''}
                        {p.email?' · '+p.email:''}
                      </div>
                    </div>
                    <div className="gsearch-item-tag" style={{display:'flex',flexDirection:'column',gap:4,alignItems:'flex-end'}}>
                      <span className={`badge badge-dot ${p.status==='Active'?'b-green':p.status==='Pending'?'b-amber':'b-gray'}`}>{p.status}</span>
                      {urgent && <span className="badge b-red" style={{fontSize:10}}>⚠ Expiring</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {enrResults.length > 0 && (
            <div className="gsearch-section">
              <div className="gsearch-section-label">Enrollments</div>
              {enrResults.map((e, i) => {
                const idx = itemIdx++
                return (
                  <div key={e.id} className={`gsearch-item ${focused===idx?'focused':''}`}
                    onMouseEnter={() => setFocused(idx)}
                    onClick={() => handleSelect({type:'enrollment',data:e})}>
                    <div className="gsearch-item-icon" style={{background:'#eff6ff',color:'#2563eb'}}>🏥</div>
                    <div className="gsearch-item-main">
                      <div className="gsearch-item-title">{pNameShort(db.providers, e.provId)}</div>
                      <div className="gsearch-item-sub">{payName(db.payers, e.payId)}</div>
                    </div>
                    <div className="gsearch-item-tag">
                      <span className={`badge ${STAGE_COLOR[e.stage]||'b-gray'}`} style={{fontSize:10}}>{e.stage}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {payResults.length > 0 && (
            <div className="gsearch-section">
              <div className="gsearch-section-label">Payers</div>
              {payResults.map((p, i) => {
                const idx = itemIdx++
                return (
                  <div key={p.id} className={`gsearch-item ${focused===idx?'focused':''}`}
                    onMouseEnter={() => setFocused(idx)}
                    onClick={() => handleSelect({type:'payer',data:p})}>
                    <div className="gsearch-item-icon" style={{background:'#fefce8',color:'#ca8a04'}}>🗂</div>
                    <div className="gsearch-item-main">
                      <div className="gsearch-item-title">{p.name}</div>
                      <div className="gsearch-item-sub">{p.type}{p.payerId?' · ID: '+p.payerId:''}{p.timeline?' · '+p.timeline:''}</div>
                    </div>
                    <div className="gsearch-item-tag">
                      <span className="badge b-blue" style={{fontSize:10}}>{p.type}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {docResults.length > 0 && (
            <div className="gsearch-section">
              <div className="gsearch-section-label">Documents</div>
              {docResults.map((d, i) => {
                const idx = itemIdx++
                const days = daysUntil(d.exp)
                return (
                  <div key={d.id} className={`gsearch-item ${focused===idx?'focused':''}`}
                    onMouseEnter={() => setFocused(idx)}
                    onClick={() => handleSelect({type:'doc',data:d})}>
                    <div className="gsearch-item-icon" style={{background:'#ecfeff',color:'#0891b2'}}>📎</div>
                    <div className="gsearch-item-main">
                      <div className="gsearch-item-title">{d.type} — {pNameShort(db.providers, d.provId)}</div>
                      <div className="gsearch-item-sub">{d.issuer||''}{d.number?' · '+d.number:''}</div>
                    </div>
                    <div className="gsearch-item-tag">
                      <span className={`badge ${days===null?'b-gray':days<0?'b-red':days<=30?'b-red':days<=90?'b-amber':'b-green'}`} style={{fontSize:10}}>
                        {days===null?'No exp':days<0?`Expired`:days<=90?`${days}d left`:'Active'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {taskResults.length > 0 && (
            <div className="gsearch-section">
              <div className="gsearch-section-label">Tasks</div>
              {taskResults.map((t, i) => {
                const idx = itemIdx++
                const dd = daysUntil(t.due)
                return (
                  <div key={t.id} className={`gsearch-item ${focused===idx?'focused':''}`}
                    onMouseEnter={() => setFocused(idx)}
                    onClick={() => handleSelect({type:'task',data:t})}>
                    <div className="gsearch-item-icon" style={{background:'#f5f3ff',color:'#7c3aed'}}>⚡</div>
                    <div className="gsearch-item-main">
                      <div className="gsearch-item-title">{t.task}</div>
                      <div className="gsearch-item-sub">{t.cat}{t.due?' · Due '+fmtDate(t.due):''}</div>
                    </div>
                    <div className="gsearch-item-tag" style={{display:'flex',gap:4}}>
                      <span className={`badge ${PRIORITY_COLOR[t.priority]||'b-gray'}`} style={{fontSize:10}}>{t.priority}</span>
                      <span className={`badge ${STATUS_COLOR[t.status]||'b-gray'}`} style={{fontSize:10}}>{t.status}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="gsearch-footer">
          <div className="gsearch-hint"><span className="gsearch-kbd">↑↓</span> navigate</div>
          <div className="gsearch-hint"><span className="gsearch-kbd">↵</span> open</div>
          <div className="gsearch-hint"><span className="gsearch-kbd">ESC</span> close</div>
          <div style={{marginLeft:'auto',fontSize:11,color:'var(--ink-4)'}}>
            {total > 0 ? `${total} result${total!==1?'s':''}` : ''}
          </div>
        </div>
      </div>
    </div>
  )
}


// ─── PROVIDER LOOKUP PAGE ─────────────────────────────────────────────────────
