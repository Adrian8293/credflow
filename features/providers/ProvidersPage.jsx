/**
 * ProvidersPage.jsx — PrimeCredential
 * Provider list with inline slide-over drawer for Add/Edit.
 * No page navigation required — drawer opens over the current page.
 */

import { useState } from 'react'
import { Providers } from './index.jsx'
import { AddProviderDrawer } from './AddProviderDrawer.jsx'
import EnrollmentKanban from '../../components/EnrollmentKanban'

export function ProvidersPage({
  db,
  provSearch, setProvSearch,
  provFStatus, setProvFStatus,
  provFSpec, setProvFSpec,
  openProvDetail, editProvider,
  setPage, setProvForm, setEditingId,
  setNpiInput, setNpiResult,
  syncFromNPPES,
  provForm, editingId,
  npiInput, npiResult, npiLoading,
  lookupNPI, handleSaveProvider,
  handleDeleteProvider,
  handlePhotoUpload, handleDeletePhoto,
  photoUploading, saving,
  onStageChange, openEnrollModal,
}) {
  const [view, setView]             = useState('table')
  const [tableTab, setTableTab]     = useState('all')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const TABLE_TABS = [
    { id: 'all',        label: 'All Providers' },
    { id: 'onboarding', label: 'Onboarding' },
    { id: 'active',     label: 'Active' },
    { id: 'inactive',   label: 'Inactive' },
  ]

  const tabStatus = tableTab === 'all' ? '' : tableTab === 'onboarding' ? 'Pending' : tableTab === 'active' ? 'Active' : 'Inactive'
  const effectiveStatus = tableTab === 'all' ? provFStatus : tabStatus

  function openAddDrawer() {
    setProvForm({})
    setEditingId(e => ({ ...e, provider: null }))
    setNpiInput('')
    setNpiResult(null)
    setDrawerOpen(true)
  }

  // Called from WorkflowProviderCard "Edit" button
  // editProvider(id) is already hooked in index.js to open the edit form.
  // We intercept it here to open our drawer instead.
  function handleEditFromCard(id) {
    editProvider(id)       // sets provForm + editingId via hook
    setDrawerOpen(true)
  }

  async function handleSaveAndClose() {
    await handleSaveProvider()
    setDrawerOpen(false)
  }

  const tabCount = id => {
    if (id === 'all')        return db.providers.length
    if (id === 'onboarding') return db.providers.filter(p => p.status === 'Pending').length
    if (id === 'active')     return db.providers.filter(p => p.status === 'Active').length
    return                          db.providers.filter(p => p.status === 'Inactive').length
  }

  return (
    <div className="page">

      {/* ── Page header ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:800, color:'var(--text-1)', letterSpacing:'-.04em', margin:0, marginBottom:3 }}>Providers</h2>
          <p style={{ fontSize:12.5, color:'var(--text-4)', margin:0 }}>
            {db.providers.length} providers · {db.providers.filter(p=>p.status==='Active').length} active · {db.providers.filter(p=>p.status==='Pending').length} onboarding
          </p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {/* View toggle */}
          <div style={{ display:'flex', background:'var(--elevated)', border:'1.5px solid var(--border)', borderRadius:'var(--r)', overflow:'hidden', padding:2, gap:2 }}>
            {[
              { id:'table', label:'Table',
                icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="17" width="18" height="4" rx="1"/></svg> },
              { id:'kanban', label:'Kanban',
                icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="13" rx="1"/><rect x="17" y="3" width="5" height="15" rx="1"/></svg> },
            ].map(v => (
              <button key={v.id} onClick={() => setView(v.id)} style={{
                display:'flex', alignItems:'center', gap:5, padding:'5px 12px',
                fontSize:11.5, fontWeight:600, cursor:'pointer', border:'none',
                fontFamily:'inherit', borderRadius:6,
                background: view===v.id ? 'var(--navy)' : 'transparent',
                color: view===v.id ? '#fff' : 'var(--text-3)',
                transition:'all var(--t)',
              }}>{v.icon} {v.label}</button>
            ))}
          </div>
          <button className="btn btn-primary btn-sm" onClick={openAddDrawer}
            style={{ display:'flex', alignItems:'center', gap:6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Provider
          </button>
        </div>
      </div>

      {/* ── TABLE VIEW ── */}
      {view === 'table' && (
        <>
          {/* Subtabs with counts */}
          <div className="tabs" style={{ marginBottom: 14 }}>
            {TABLE_TABS.map(t => (
              <div key={t.id} className={`tab${tableTab===t.id ? ' active':''}`} onClick={() => setTableTab(t.id)}>
                {t.label}
                <span style={{
                  marginLeft:5, background:'var(--elevated)', border:'1px solid var(--border)',
                  borderRadius:9, padding:'1px 6px', fontSize:10, fontWeight:700,
                  color: tableTab===t.id ? 'var(--pr)' : 'var(--text-4)',
                  background: tableTab===t.id ? 'var(--pr-l)' : 'var(--elevated)',
                }}>
                  {tabCount(t.id)}
                </span>
              </div>
            ))}
          </div>

          <Providers
            db={db}
            search={provSearch}      setSearch={setProvSearch}
            fStatus={effectiveStatus} setFStatus={setProvFStatus}
            fSpec={provFSpec}         setFSpec={setProvFSpec}
            openProvDetail={openProvDetail}
            editProvider={handleEditFromCard}
            setPage={setPage}
            setProvForm={setProvForm}
            setEditingId={setEditingId}
            setNpiInput={setNpiInput}
            setNpiResult={setNpiResult}
            syncFromNPPES={syncFromNPPES}
            onAddProvider={openAddDrawer}
          />
        </>
      )}

      {/* ── KANBAN VIEW ── */}
      {view === 'kanban' && (
        <EnrollmentKanban
          enrollments={db.enrollments}
          providers={db.providers}
          payers={db.payers}
          onStageChange={onStageChange}
          onOpen={enr => openEnrollModal(enr.id)}
        />
      )}

      {/* ── ADD / EDIT DRAWER ── */}
      <AddProviderDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        db={db}
        provForm={provForm}
        setProvForm={setProvForm}
        editingId={editingId}
        npiInput={npiInput}   setNpiInput={setNpiInput}
        npiResult={npiResult} setNpiResult={setNpiResult}
        npiLoading={npiLoading}
        lookupNPI={lookupNPI}
        handleSaveProvider={handleSaveAndClose}
        handleDeleteProvider={handleDeleteProvider}
        saving={saving}
      />
    </div>
  )
}

export default ProvidersPage
