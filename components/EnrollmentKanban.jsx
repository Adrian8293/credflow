/**
 * EnrollmentKanban.jsx — CredFlow Payer Enrollment Board
 * Light theme, one column per stage, horizontal scroll.
 * Optimistic drag-drop: cards move instantly, Supabase syncs in background.
 */

import { useState, useEffect } from 'react'

const PIPELINE = [
  { id: 'not_started',  label: 'Not Started',                    color: '#64748B' },
  { id: 'submitted',    label: 'Application Submitted',           color: '#1E56F0' },
  { id: 'caqh',         label: 'Awaiting CAQH',                  color: '#8B5CF6' },
  { id: 'pending',      label: 'Pending Verification',            color: '#F59E0B' },
  { id: 'info',         label: 'Additional Info Requested',       color: '#EF4444' },
  { id: 'review',       label: 'Under Review',                    color: '#0EA5FF' },
  { id: 'approved',     label: 'Approved – Awaiting Contract',    color: '#10B981' },
  { id: 'contracted',   label: 'Contracted – Pending Effective',  color: '#22C55E' },
  { id: 'active',       label: 'Active',                          color: '#16A34A' },
  { id: 'denied',       label: 'Denied',                          color: '#94A3B8' },
]

const STAGE_TO_ID = {
  'Not Started':                         'not_started',
  'Application Submitted':               'submitted',
  'Awaiting CAQH':                       'caqh',
  'Pending Verification':                'pending',
  'Additional Info Requested':           'info',
  'Under Review':                        'review',
  'Approved – Awaiting Contract':        'approved',
  'Contracted – Pending Effective Date': 'contracted',
  'Active':                              'active',
  'Denied':                              'denied',
}

const ID_TO_STAGE = Object.fromEntries(
  Object.entries(STAGE_TO_ID).map(([k, v]) => [v, k])
)

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000)
}

function FollowupBadge({ followup }) {
  const days = daysUntil(followup)
  if (days === null) return null
  const urgent = days <= 3
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
      background: urgent ? '#FEE2E2' : '#FEF3C7',
      color: urgent ? '#DC2626' : '#B45309',
      border: `1px solid ${urgent ? '#FCA5A5' : '#FCD34D'}`,
      whiteSpace: 'nowrap',
    }}>
      {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d`}
    </span>
  )
}

function EnrollmentCard({ enrollment, provider, payer, onOpen, onDragStart, isDragging }) {
  const stage = PIPELINE.find(p => p.id === STAGE_TO_ID[enrollment.stage]) || PIPELINE[0]
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, enrollment.id)}
      onClick={() => onOpen(enrollment)}
      style={{
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderLeft: `3px solid ${stage.color}`,
        borderRadius: 8,
        padding: '8px 10px',
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        transition: 'opacity 0.1s, box-shadow 0.15s, transform 0.1s',
        userSelect: 'none',
        boxShadow: '0 1px 2px rgba(13,27,61,.04)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = `0 0 0 1px ${stage.color}55, 0 4px 10px rgba(13,27,61,.08)`
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(13,27,61,.04)'
        e.currentTarget.style.transform = 'none'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, gap: 6 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: '#0D1B3D', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {provider ? `${provider.lname}, ${provider.fname}` : 'Unknown Provider'}
          </div>
          {provider?.cred && <div style={{ fontSize: 9, color: '#94A3B8', marginTop: 1 }}>{provider.cred}</div>}
        </div>
        <FollowupBadge followup={enrollment.followup} />
      </div>
      <div style={{ fontSize: 10, color: '#64748B', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{payer?.name || '—'}</div>
      <div style={{ display: 'flex', gap: 8, fontSize: 9, color: '#94A3B8', flexWrap: 'wrap' }}>
        {enrollment.submitted && <span>Sub: {enrollment.submitted}</span>}
        {enrollment.effective && <span>· Eff: {enrollment.effective}</span>}
        {enrollment.eft && enrollment.eft !== 'Not Set Up' && <span style={{ color: '#10B981', fontWeight: 600 }}>· EFT ✓</span>}
      </div>
    </div>
  )
}

function KanbanColumn({ stage, cards, providers, payers, onOpen, onDrop, onDragOver, onDragLeave, onDragStart, isDragOver, dragId }) {
  return (
    <div
      style={{
        minWidth: 220, maxWidth: 240, flex: '0 0 220px',
        background: isDragOver ? '#EBF1FF' : '#F8FAFC',
        border: `1px solid ${isDragOver ? stage.color : '#E2E8F0'}`,
        borderRadius: 10,
        transition: 'border-color 0.12s, background 0.12s',
        display: 'flex', flexDirection: 'column',
        scrollSnapAlign: 'start',
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div style={{
        padding: '10px 12px',
        borderBottom: `1px solid ${isDragOver ? stage.color + '55' : '#E2E8F0'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flex: 1 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: 10.5, color: '#0D1B3D', letterSpacing: '0.03em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {stage.label}
          </span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: stage.color, background: `${stage.color}1A`, borderRadius: 10, padding: '1px 7px', border: `1px solid ${stage.color}33`, flexShrink: 0 }}>
          {cards.length}
        </span>
      </div>

      <div style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 100, overflowY: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
        {cards.length === 0 ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isDragOver ? stage.color : '#CBD5E1', fontSize: 10,
            border: `1px dashed ${isDragOver ? stage.color : '#E2E8F0'}`,
            borderRadius: 6, padding: 14, transition: 'all 0.12s',
          }}>
            {isDragOver ? 'Release to move here' : 'Drop here'}
          </div>
        ) : cards.map(enr => (
          <EnrollmentCard
            key={enr.id}
            enrollment={enr}
            provider={providers.find(p => p.id === enr.provId)}
            payer={payers.find(p => p.id === enr.payId)}
            onOpen={onOpen}
            onDragStart={onDragStart}
            isDragging={dragId === enr.id}
          />
        ))}
      </div>
    </div>
  )
}

function FilterBar({ providers, payers, filter, setFilter }) {
  const sel = { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 6, padding: '6px 10px', color: '#0D1B3D', fontSize: 12, outline: 'none', cursor: 'pointer' }
  const active = filter.search || filter.provId || filter.payId || filter.followupOnly
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input style={{ ...sel, minWidth: 200 }} placeholder="Search enrollments…" value={filter.search} onChange={e => setFilter(f => ({ ...f, search: e.target.value }))} />
      <select style={sel} value={filter.provId} onChange={e => setFilter(f => ({ ...f, provId: e.target.value }))}>
        <option value="">All Providers</option>
        {providers.map(p => <option key={p.id} value={p.id}>{p.lname}, {p.fname}</option>)}
      </select>
      <select style={sel} value={filter.payId} onChange={e => setFilter(f => ({ ...f, payId: e.target.value }))}>
        <option value="">All Payers</option>
        {payers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748B', fontSize: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={filter.followupOnly} onChange={e => setFilter(f => ({ ...f, followupOnly: e.target.checked }))} style={{ accentColor: '#1E56F0' }} />
        Follow-up due
      </label>
      {active && (
        <button onClick={() => setFilter({ search: '', provId: '', payId: '', followupOnly: false })}
          style={{ background: 'transparent', border: '1px solid #E2E8F0', borderRadius: 6, color: '#64748B', fontSize: 11, padding: '5px 10px', cursor: 'pointer' }}>
          Clear
        </button>
      )}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function EnrollmentKanban({ enrollments = [], providers = [], payers = [], onStageChange, onOpen }) {
  const [local, setLocal] = useState(enrollments)
  useEffect(() => { setLocal(enrollments) }, [enrollments])

  const [dragId, setDragId]         = useState(null)
  const [dragOverCol, setDragOverCol] = useState(null)
  const [filter, setFilter]          = useState({ search: '', provId: '', payId: '', followupOnly: false })

  function handleDragStart(e, id) {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }

  function handleDragOver(e, colId) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCol(colId)
  }

  function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOverCol(null)
  }

  function handleDrop(e, colId) {
    e.preventDefault()
    const id = dragId || e.dataTransfer.getData('text/plain')
    if (!id) { setDragOverCol(null); return }

    const newStage = ID_TO_STAGE[colId]
    if (!newStage) { setDragId(null); setDragOverCol(null); return }

    setLocal(prev => prev.map(enr => enr.id === id ? { ...enr, stage: newStage } : enr))
    setDragId(null)
    setDragOverCol(null)

    onStageChange?.(id, newStage)
  }

  function handleDragEnd() {
    setDragId(null)
    setDragOverCol(null)
  }

  const filtered = local.filter(e => {
    if (filter.provId && e.provId !== filter.provId) return false
    if (filter.payId  && e.payId  !== filter.payId)  return false
    if (filter.followupOnly && !e.followup) return false
    if (filter.search) {
      const prov  = providers.find(p => p.id === e.provId)
      const payer = payers.find(p => p.id === e.payId)
      const hay   = [prov?.fname, prov?.lname, payer?.name, e.stage].join(' ').toLowerCase()
      if (!hay.includes(filter.search.toLowerCase())) return false
    }
    return true
  })

  const stats = {
    total:    local.length,
    active:   local.filter(e => e.stage === 'Active').length,
    pending:  local.filter(e => ['Application Submitted','Awaiting CAQH','Pending Verification','Under Review'].includes(e.stage)).length,
    followup: local.filter(e => e.followup && daysUntil(e.followup) <= 3).length,
    denied:   local.filter(e => e.stage === 'Denied').length,
  }

  return (
    <div style={{ fontFamily: "var(--fn, 'Inter', system-ui, sans-serif)", color: '#0D1B3D' }} onDragEnd={handleDragEnd}>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Total',            value: stats.total,    color: '#1E56F0' },
          { label: 'Active',           value: stats.active,   color: '#16A34A' },
          { label: 'In Pipeline',      value: stats.pending,  color: '#F59E0B' },
          { label: 'Urgent Follow-up', value: stats.followup, color: '#EF4444' },
          { label: 'Denied',           value: stats.denied,   color: '#94A3B8' },
        ].map(s => (
          <div key={s.label} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 2, boxShadow: '0 1px 2px rgba(13,27,61,.03)' }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</span>
            <span style={{ fontSize: 9.5, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ marginBottom: 14 }}>
        <FilterBar providers={providers} payers={payers} filter={filter} setFilter={setFilter} />
      </div>

      {/* Board — horizontal scroll, one column per stage */}
      <div style={{
        display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 12, alignItems: 'flex-start',
        scrollSnapType: 'x proximity',
      }}>
        {PIPELINE.map(stage => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            cards={filtered.filter(e => STAGE_TO_ID[e.stage] === stage.id)}
            providers={providers}
            payers={payers}
            onOpen={onOpen}
            onDragStart={handleDragStart}
            onDragOver={(e) => handleDragOver(e, stage.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, stage.id)}
            isDragOver={dragOverCol === stage.id}
            dragId={dragId}
          />
        ))}
      </div>
    </div>
  )
}
