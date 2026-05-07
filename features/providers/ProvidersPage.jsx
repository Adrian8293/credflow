// ProvidersPage — Table view (4 sub-tabs) + Kanban view (7 credentialing stages)
// All existing logic (filter, sort, WorkflowProviderCard, AddProvider) is preserved.
import { useState } from 'react'
import { Providers } from './index.jsx'
import { AddProvider } from './AddProvider.jsx'
import { daysUntil } from '../../lib/helpers.js'
import { initials } from '../../lib/helpers.js'
import { SPEC_COLORS } from '../../constants/stages.js'

// 7 credentialing stages with color coding matching the HTML reference
const CRED_STAGES = [
  { id: 'intake',     label: 'Intake',      color: '#6B7280', bg: '#F3F4F6' },
  { id: 'submitted',  label: 'Submitted',   color: '#2563EB', bg: '#EFF6FF' },
  { id: 'in_review',  label: 'In Review',   color: '#7C3AED', bg: '#F5F3FF' },
  { id: 'pending',    label: 'Pending',     color: '#D97706', bg: '#FFFBEB' },
  { id: 'approved',   label: 'Approved',    color: '#0D9488', bg: '#F0FDFA' },
  { id: 'active',     label: 'Active',      color: '#10B981', bg: '#F0FDF4' },
  { id: 'returned',   label: 'Returned',    color: '#EF4444', bg: '#FEF2F2' },
]

// Map provider status → kanban stage
function provToStage(prov) {
  const s = (prov.status || '').toLowerCase()
  if (s === 'active') return 'active'
  if (s === 'inactive') return 'returned'
  if (s === 'pending') return 'pending'
  return 'intake'
}

// Days in current stage (mock: use license expiry distance as proxy, or days since created)
function daysInStage(prov) {
  // Use a stable number from the provider id if available
  if (!prov.id) return 1
  const hash = prov.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return (hash % 30) + 1
}

function KanbanBoard({ providers }) {
  const cols = CRED_STAGES.map(stage => ({
    ...stage,
    cards: providers.filter(p => provToStage(p) === stage.id),
  }))

  return (
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
      {cols.map(col => {
        const cardCount = col.cards.length
        return (
          <div key={col.id} style={{ minWidth: 168, flex: 1, background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 9 }}>
            {/* Column header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: col.color }}>{col.label}</span>
              <span style={{ background: col.bg, color: col.color, border: `1px solid ${col.color}22`, borderRadius: 5, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{cardCount}</span>
            </div>
            {/* Cards */}
            {col.cards.length === 0 && (
              <div style={{ textAlign: 'center', padding: '18px 0', fontSize: 11, color: 'var(--text-3)' }}>—</div>
            )}
            {col.cards.map(prov => {
              const days = daysInStage(prov)
              const isUrgent = days > 30
              const isWarn   = days > 14 && !isUrgent
              const ini = ((prov.fname||'?')[0] + (prov.lname||'')[0]).toUpperCase()
              const specColor = SPEC_COLORS?.[prov.spec] || '#2563EB'
              return (
                <div key={prov.id} style={{
                  background: 'var(--card)',
                  border: `1px solid ${isUrgent ? 'var(--danger)' : isWarn ? 'var(--warning)' : 'var(--border)'}`,
                  borderLeft: `3px solid ${isUrgent ? 'var(--danger)' : isWarn ? 'var(--warning)' : 'var(--border)'}`,
                  borderRadius: 'var(--r)',
                  padding: '9px 10px',
                  marginBottom: 6,
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-xs)',
                  transition: 'all var(--t)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 5, background: specColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{ini}</div>
                    <div style={{ fontWeight: 600, fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-1)' }}>{prov.fname} {prov.lname}{prov.cred ? `, ${prov.cred}` : ''}</div>
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginBottom: 4 }}>{prov.spec || '—'}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: isUrgent ? 'var(--danger)' : isWarn ? 'var(--warning)' : 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                    Day {days}{isUrgent ? ' 🚨' : isWarn ? ' ⚠' : ''}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

export function ProvidersPage({ db, provSearch, setProvSearch, provFStatus, setProvFStatus, provFSpec, setProvFSpec, openProvDetail, editProvider, setPage, setProvForm, setEditingId, setNpiInput, setNpiResult, syncFromNPPES, provForm, editingId, npiInput, npiResult, npiLoading, lookupNPI, handleSaveProvider, handleDeleteProvider, handlePhotoUpload, handleDeletePhoto, photoUploading, saving }) {
  const [view, setView] = useState('table') // 'table' | 'kanban'
  const [tableTab, setTableTab] = useState('all') // 'all' | 'onboarding' | 'active' | 'inactive'

  const TABLE_TABS = [
    { id: 'all',        label: 'All Providers' },
    { id: 'onboarding', label: 'Onboarding' },
    { id: 'active',     label: 'Active' },
    { id: 'inactive',   label: 'Inactive' },
  ]

  // Filter providers by table tab
  const tabFilteredStatus = tableTab === 'all' ? '' : tableTab === 'onboarding' ? 'Pending' : tableTab === 'active' ? 'Active' : 'Inactive'
  const effectiveStatus = tableTab === 'all' ? provFStatus : tabFilteredStatus

  function handleAddProvider() {
    setProvForm({})
    setEditingId(e => ({ ...e, provider: null }))
    setNpiInput('')
    setNpiResult(null)
    setPage('add-provider')
  }

  return (
    <div className="page">
      {/* ── Page header with view toggle ── */}
      <div className="page-header" style={{ marginBottom: 14 }}>
        <div className="page-header-left">
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>
            {db.providers.length} providers · {db.providers.filter(p => p.status === 'Active').length} active
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* View toggle */}
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', background: 'var(--card)' }}>
            <button onClick={() => setView('table')} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', border: 'none', fontFamily: 'inherit', background: view === 'table' ? 'var(--navy)' : 'transparent', color: view === 'table' ? '#fff' : 'var(--text-3)', transition: 'all var(--t)' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="1" width="10" height="3" rx="1"/><rect x="1" y="5" width="10" height="3" rx="1"/><rect x="1" y="9" width="10" height="2" rx="1"/></svg>
              Table
            </button>
            <button onClick={() => setView('kanban')} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', border: 'none', fontFamily: 'inherit', background: view === 'kanban' ? 'var(--navy)' : 'transparent', color: view === 'kanban' ? '#fff' : 'var(--text-3)', transition: 'all var(--t)' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="1" width="3" height="10" rx="1"/><rect x="4.5" y="1" width="3" height="7" rx="1"/><rect x="8" y="1" width="3" height="8.5" rx="1"/></svg>
              Kanban
            </button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleAddProvider}>+ Add Provider</button>
        </div>
      </div>

      {/* ── TABLE VIEW ── */}
      {view === 'table' && (
        <>
          {/* 4 sub-tabs */}
          <div className="tabs" style={{ marginBottom: 12 }}>
            {TABLE_TABS.map(t => (
              <div key={t.id} className={`tab${tableTab === t.id ? ' active' : ''}`} onClick={() => setTableTab(t.id)}>
                {t.label}
                <span style={{ marginLeft: 5, background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 9, padding: '1px 6px', fontSize: 10, fontWeight: 600, color: 'var(--text-3)' }}>
                  {t.id === 'all' ? db.providers.length
                    : t.id === 'onboarding' ? db.providers.filter(p => p.status === 'Pending').length
                    : t.id === 'active' ? db.providers.filter(p => p.status === 'Active').length
                    : db.providers.filter(p => p.status === 'Inactive').length}
                </span>
              </div>
            ))}
          </div>
          {/* Pass through to existing Providers component with tab-filtered status */}
          <Providers
            db={db}
            search={provSearch}
            setSearch={setProvSearch}
            fStatus={effectiveStatus}
            setFStatus={setProvFStatus}
            fSpec={provFSpec}
            setFSpec={setProvFSpec}
            openProvDetail={openProvDetail}
            editProvider={editProvider}
            setPage={setPage}
            setProvForm={setProvForm}
            setEditingId={setEditingId}
            setNpiInput={setNpiInput}
            setNpiResult={setNpiResult}
            syncFromNPPES={syncFromNPPES}
            hideAddBtn
          />
        </>
      )}

      {/* ── KANBAN VIEW ── */}
      {view === 'kanban' && (
        <>
          <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>7 credentialing stages · Color-coded by urgency</span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--text-3)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderLeft: '3px solid var(--danger)', display: 'inline-block' }} /> &gt;30 days urgent</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderLeft: '3px solid var(--warning)', display: 'inline-block' }} /> &gt;14 days warning</span>
            </div>
          </div>
          <KanbanBoard providers={db.providers} />
        </>
      )}
    </div>
  )
}

export default ProvidersPage
